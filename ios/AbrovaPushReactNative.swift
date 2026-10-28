/**
 * AbrovaPush React Native iOS Module
 * Thin wrapper around the native AbrovaPush iOS SDK
 * This is similar to how the Android module wraps the AAR
 */
import Foundation
import React
import UserNotifications
import AbrovaPushSDK

@objc(AbrovaPushReactNative)
class AbrovaPushReactNative: RCTEventEmitter {

    private var hasListeners = false
    private static var instance: AbrovaPushReactNative?
    private var showNotificationInForeground: Bool = true
    private var pendingEvents: [(name: String, body: Any?)] = []

    // The module instance whose JS side has a tokenProvider. Nil when none
    // does: nothing is registered with the native SDK then.
    private static weak var tokenProviderOwner: AbrovaPushReactNative?
    private static let tokenReplyTimeout: TimeInterval = 10

    // Token requests waiting for JS to answer, by request id.
    private var pendingTokenRequests: [String: (Result<String?, Error>) -> Void] = [:]
    private let tokenRequestsLock = NSLock()

    override init() {
        super.init()
        AbrovaPushReactNative.instance = self
    }

    override static func moduleName() -> String! {
        return "AbrovaPushReactNative"
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    override func supportedEvents() -> [String]! {
        return [
            "onMessage",
            "onConnectionState",
            "onRegistered",
            "onError",
            "onDetailedError",
            "onReconnecting",
            "onNetworkState",
            "onAppState",
            "onAppUpdated",
            "onNotificationTapped",
            "onNotificationAction",
            "onAuthError",
            "getUserToken",
            "onInAppMessageReady",
            "onInAppButtonClick",
            "onInAppMessageDismissed",
            "onInboxMessageReceived",
            "onInboxMessageStatusChanged",
            "onABTestVariantAssigned",
            "onABTestError"
        ]
    }

    override func startObserving() {
        hasListeners = true
        // Flush any events that fired before JS listeners were ready
        for event in pendingEvents {
            sendEvent(withName: event.name, body: event.body)
        }
        pendingEvents.removeAll()
    }

    override func stopObserving() {
        hasListeners = false
    }

    override func invalidate() {
        // JS can no longer answer: the native SDK goes on with the token it has.
        if AbrovaPushReactNative.tokenProviderOwner === self {
            AbrovaPushReactNative.tokenProviderOwner = nil
            AbrovaPush.shared.setTokenProvider(callback: nil)
        }
        failPendingTokenRequests("React Native bridge invalidated")
        super.invalidate()
    }

    // MARK: - Core Methods

    @objc(init:resolver:rejecter:)
    func initialize(configDict: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let apiKey = configDict["apiKey"] as? String else {
            reject("INIT_ERROR", "API key is required", nil)
            return
        }

        let config = AbrovaPushConfig(
            apiKey: apiKey,
            usePushKit: configDict["usePushKit"] as? Bool ?? false,
            showNotificationInForeground: configDict["showNotificationInForeground"] as? Bool ?? true,
            autoConnect: configDict["autoConnect"] as? Bool ?? true,
            appGroup: configDict["appGroup"] as? String,
            autoRefresh: configDict["autoRefresh"] as? Bool ?? true,
            wrapperSdkName: configDict["wrapperSdkName"] as? String,
            wrapperSdkVersion: configDict["wrapperSdkVersion"] as? String,
            sendDiagnostics: configDict["sendDiagnostics"] as? Bool ?? true
        )

        self.showNotificationInForeground = configDict["showNotificationInForeground"] as? Bool ?? true

        // Set up delegate before initializing so events are captured
        AbrovaPush.shared.delegate = self

        AbrovaPush.shared.initialize(config: config)

        // Set up callbacks
        AbrovaPush.shared.setInboxCallback(self)
        AbrovaPush.shared.setInAppMessageCallback(self)
        AbrovaPush.shared.setABTestingDelegate(self)

        // Set notification center delegate for foreground display
        UNUserNotificationCenter.current().delegate = self

        // Request notification permission and wait for result before resolving
        let usePushKit = configDict["usePushKit"] as? Bool ?? false
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if granted && !usePushKit {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            resolve(nil)
        }
    }

    @objc(register:metadata:resolver:rejecter:)
    func register(userId: String?, metadata: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let metadataDict = metadata as? [String: String]
        AbrovaPush.shared.register(userId: userId, metadata: metadataDict)
        resolve(nil)
    }

    @objc(unregister:rejecter:)
    func unregister(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.unregister()
        resolve(nil)
    }

    @objc(isConnected:rejecter:)
    func isConnected(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolve(AbrovaPush.shared.isConnected)
    }

    @objc(getDeviceId:rejecter:)
    func getDeviceId(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolve(AbrovaPush.shared.getDeviceId())
    }

    @objc(getSubscriptionId:rejecter:)
    func getSubscriptionId(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolve(AbrovaPush.shared.getSubscriptionId())
    }

    @objc(setLogLevel:resolver:rejecter:)
    func setLogLevel(level: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.setLogLevel(AbrovaPushLogLevel.fromString(level))
        resolve(nil)
    }

    // MARK: - Topic Subscriptions

    @objc(subscribeTopic:resolver:rejecter:)
    func subscribeTopic(topic: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.subscribeTopic(topic)
        resolve(nil)
    }

    @objc(unsubscribeTopic:resolver:rejecter:)
    func unsubscribeTopic(topic: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.unsubscribeTopic(topic)
        resolve(nil)
    }

    // MARK: - User Management

    @objc(setUserId:resolver:rejecter:)
    func setUserId(userId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.setUserId(userId)
        resolve(nil)
    }

    @objc(clearUserId:rejecter:)
    func clearUserId(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.clearUserId()
        resolve(nil)
    }

    // MARK: - Signed User Tokens

    @objc(setTokenProvider:resolver:rejecter:)
    func setTokenProvider(enabled: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if enabled {
            AbrovaPushReactNative.tokenProviderOwner = self
            AbrovaPush.shared.setTokenProvider(callback: { [weak self] completion in
                guard let self = self else {
                    completion(.failure(TokenBridgeError("React Native is not running")))
                    return
                }
                self.fetchUserTokenFromJS(completion)
            })
        } else {
            AbrovaPushReactNative.tokenProviderOwner = nil
            AbrovaPush.shared.setTokenProvider(callback: nil)
            failPendingTokenRequests("tokenProvider removed")
        }
        resolve(nil)
    }

    @objc(setUserToken:resolver:rejecter:)
    func setUserToken(token: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.setUserToken(token)
        resolve(nil)
    }

    /// JS answers a `getUserToken` event: a token, nil when no user is signed
    /// in, or an error when the provider failed.
    @objc(answerUserToken:token:error:)
    func answerUserToken(requestId: String, token: String?, error: String?) {
        guard let completion = takeTokenRequest(requestId) else { return }
        if let error = error {
            completion(.failure(TokenBridgeError(error)))
        } else {
            completion(.success((token?.isEmpty ?? true) ? nil : token))
        }
    }

    private struct TokenBridgeError: LocalizedError {
        let errorDescription: String?
        init(_ message: String) { errorDescription = message }
    }

    /// Asks JS for the user token. Completes with nil only when JS says no
    /// user is signed in, and with a failure when JS cannot answer, so the
    /// native SDK keeps the token it already has.
    private func fetchUserTokenFromJS(_ completion: @escaping (Result<String?, Error>) -> Void) {
        DispatchQueue.main.async {
            guard AbrovaPushReactNative.tokenProviderOwner === self, self.hasListeners else {
                completion(.failure(TokenBridgeError("React Native is not running")))
                return
            }
            let requestId = UUID().uuidString
            self.tokenRequestsLock.lock()
            self.pendingTokenRequests[requestId] = completion
            self.tokenRequestsLock.unlock()

            self.sendEvent(withName: "getUserToken", body: ["requestId": requestId])

            DispatchQueue.main.asyncAfter(deadline: .now() + AbrovaPushReactNative.tokenReplyTimeout) {
                self.takeTokenRequest(requestId)?(.failure(TokenBridgeError("tokenProvider did not answer in time")))
            }
        }
    }

    private func takeTokenRequest(_ requestId: String) -> ((Result<String?, Error>) -> Void)? {
        tokenRequestsLock.lock(); defer { tokenRequestsLock.unlock() }
        return pendingTokenRequests.removeValue(forKey: requestId)
    }

    private func failPendingTokenRequests(_ reason: String) {
        tokenRequestsLock.lock()
        let pending = pendingTokenRequests
        pendingTokenRequests.removeAll()
        tokenRequestsLock.unlock()
        pending.values.forEach { $0(.failure(TokenBridgeError(reason))) }
    }

    // MARK: - Initial Message

    @objc(getInitialMessage:rejecter:)
    func getInitialMessage(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if let message = AbrovaPush.shared.getInitialMessage() {
            AbrovaPush.shared.clearInitialMessage()
            resolve(message.toDictionary())
        } else {
            resolve(nil)
        }
    }

    // MARK: - In-App Messages

    @objc(fetchInAppMessages:rejecter:)
    func fetchInAppMessages(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.fetchInAppMessages { messages in
            resolve(messages.map { $0.toDictionary() })
        }
    }

    @objc(triggerInAppOnAppOpen:rejecter:)
    func triggerInAppOnAppOpen(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.triggerInAppOnAppOpen()
        resolve(nil)
    }

    @objc(triggerInAppEvent:properties:resolver:rejecter:)
    func triggerInAppEvent(eventName: String, properties: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let propsDict = properties as? [String: Any]
        AbrovaPush.shared.triggerInAppEvent(eventName, properties: propsDict)
        resolve(nil)
    }

    @objc(triggerInAppOnSessionStart:rejecter:)
    func triggerInAppOnSessionStart(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.triggerInAppOnSessionStart()
        resolve(nil)
    }

    @objc(showInAppMessage:resolver:rejecter:)
    func showInAppMessage(messageId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.showInAppMessage(messageId)
        resolve(nil)
    }

    @objc(dismissInAppMessage:rejecter:)
    func dismissInAppMessage(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.dismissInAppMessage()
        resolve(nil)
    }

    // MARK: - Inbox

    @objc(getInboxMessages:resolver:rejecter:)
    func getInboxMessages(filter: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        var inboxFilter = InboxFilter()

        if let filterDict = filter as? [String: Any] {
            inboxFilter = InboxFilter(
                status: filterDict["status"] != nil ? InboxMessageStatus.fromString(filterDict["status"] as! String) : nil,
                category: filterDict["category"] as? String,
                limit: filterDict["limit"] as? Int ?? 50,
                offset: filterDict["offset"] as? Int ?? 0
            )
        }

        AbrovaPush.shared.getInboxMessages(
            filter: inboxFilter,
            onSuccess: { response in
                resolve(response.toDictionary())
            },
            onError: { error in
                reject("ERROR", error, nil)
            }
        )
    }

    @objc(getInboxMessage:resolver:rejecter:)
    func getInboxMessage(messageId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.getInboxMessage(
            messageId: messageId,
            onSuccess: { message in resolve(message.toDictionary()) },
            onError: { error in reject("ERROR", error, nil) }
        )
    }

    @objc(markInboxMessageAsRead:resolver:rejecter:)
    func markInboxMessageAsRead(messageId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.markInboxMessageAsRead(
            messageId: messageId,
            onSuccess: { resolve(nil) },
            onError: { error in reject("ERROR", error, nil) }
        )
    }

    @objc(archiveInboxMessage:resolver:rejecter:)
    func archiveInboxMessage(messageId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.archiveInboxMessage(
            messageId: messageId,
            onSuccess: { resolve(nil) },
            onError: { error in reject("ERROR", error, nil) }
        )
    }

    @objc(deleteInboxMessage:resolver:rejecter:)
    func deleteInboxMessage(messageId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.deleteInboxMessage(
            messageId: messageId,
            onSuccess: { resolve(nil) },
            onError: { error in reject("ERROR", error, nil) }
        )
    }

    @objc(markMultipleInboxMessages:status:resolver:rejecter:)
    func markMultipleInboxMessages(messageIds: [String], status: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.markMultipleInboxMessages(
            messageIds: messageIds,
            status: InboxMessageStatus.fromString(status),
            onSuccess: { resolve(nil) },
            onError: { error in reject("ERROR", error, nil) }
        )
    }

    @objc(markAllInboxMessagesAsRead:rejecter:)
    func markAllInboxMessagesAsRead(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.markAllInboxMessagesAsRead(
            onSuccess: { resolve(nil) },
            onError: { error in reject("ERROR", error, nil) }
        )
    }

    @objc(getInboxUnreadCount:rejecter:)
    func getInboxUnreadCount(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolve(AbrovaPush.shared.getInboxUnreadCount())
    }

    @objc(fetchInboxUnreadCount:rejecter:)
    func fetchInboxUnreadCount(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.fetchInboxUnreadCount(
            onSuccess: { count in resolve(count) },
            onError: { error in reject("ERROR", error, nil) }
        )
    }

    @objc(getCachedInboxMessages:rejecter:)
    func getCachedInboxMessages(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolve(AbrovaPush.shared.getCachedInboxMessages().map { $0.toDictionary() })
    }

    @objc(clearInboxCache:rejecter:)
    func clearInboxCache(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.clearInboxCache()
        resolve(nil)
    }

    // MARK: - A/B Testing

    @objc(getActiveABTests:rejecter:)
    func getActiveABTests(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.getActiveABTests { result in
            switch result {
            case .success(let tests):
                resolve(tests.map { $0.toDictionary() })
            case .failure(let error):
                reject("ABTEST_ERROR", error.localizedDescription, nil)
            }
        }
    }

    @objc(getABTestVariant:forceRefresh:resolver:rejecter:)
    func getABTestVariant(testId: String, forceRefresh: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.getABTestVariant(testId: testId, forceRefresh: forceRefresh) { result in
            switch result {
            case .success(let variant):
                resolve(variant.toDictionary())
            case .failure(let error):
                reject("ABTEST_ERROR", error.localizedDescription, nil)
            }
        }
    }

    @objc(getCachedABTestVariant:resolver:rejecter:)
    func getCachedABTestVariant(testId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let variant = AbrovaPush.shared.getCachedABTestVariant(testId: testId)
        resolve(variant?.toDictionary())
    }

    @objc(trackABTestImpression:variantId:resolver:rejecter:)
    func trackABTestImpression(testId: String, variantId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.trackABTestImpression(testId: testId, variantId: variantId) { result in
            switch result {
            case .success:
                resolve(nil)
            case .failure(let error):
                reject("ABTEST_ERROR", error.localizedDescription, nil)
            }
        }
    }

    @objc(trackABTestOpened:variantId:resolver:rejecter:)
    func trackABTestOpened(testId: String, variantId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.trackABTestOpened(testId: testId, variantId: variantId) { result in
            switch result {
            case .success:
                resolve(nil)
            case .failure(let error):
                reject("ABTEST_ERROR", error.localizedDescription, nil)
            }
        }
    }

    @objc(trackABTestClicked:variantId:resolver:rejecter:)
    func trackABTestClicked(testId: String, variantId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.trackABTestClicked(testId: testId, variantId: variantId) { result in
            switch result {
            case .success:
                resolve(nil)
            case .failure(let error):
                reject("ABTEST_ERROR", error.localizedDescription, nil)
            }
        }
    }

    @objc(trackABTestConverted:variantId:resolver:rejecter:)
    func trackABTestConverted(testId: String, variantId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.getABTestingManager().trackConverted(testId: testId, variantId: variantId) { result in
            switch result {
            case .success:
                resolve(nil)
            case .failure(let error):
                reject("ABTEST_ERROR", error.localizedDescription, nil)
            }
        }
    }

    @objc(trackABTestDisplay:variantId:resolver:rejecter:)
    func trackABTestDisplay(testId: String, variantId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let variant = ABTestVariant(testId: testId, variantId: variantId, variantName: "", content: nil)
        AbrovaPush.shared.trackABTestDisplay(variant: variant) { result in
            switch result {
            case .success:
                resolve(nil)
            case .failure(let error):
                reject("ABTEST_ERROR", error.localizedDescription, nil)
            }
        }
    }

    @objc(clearABTestCache:rejecter:)
    func clearABTestCache(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AbrovaPush.shared.clearABTestCache()
        resolve(nil)
    }

    // MARK: - Event Emission

    private func emitEvent(_ name: String, body: Any?) {
        if hasListeners {
            sendEvent(withName: name, body: body)
        } else {
            pendingEvents.append((name: name, body: body))
        }
    }
}

// MARK: - AbrovaPushDelegate
extension AbrovaPushReactNative: AbrovaPushDelegate {
    func abrovaPush(_ abrovaPush: AbrovaPush, didReceiveMessage message: AbrovaPushMessage) {
        emitEvent("onMessage", body: message.toDictionary())
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didChangeConnectionState connected: Bool) {
        emitEvent("onConnectionState", body: connected)
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didRegisterWithDeviceId deviceId: String) {
        emitEvent("onRegistered", body: deviceId)
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didReceiveVoIPToken token: String) {
        // Internal - not exposed to React Native
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didFailWithError error: Error) {
        emitEvent("onError", body: error.localizedDescription)
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didFailWithDetailedError error: AbrovaPushError) {
        emitEvent("onDetailedError", body: error.toDictionary())
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didStartReconnecting state: ReconnectionState) {
        emitEvent("onReconnecting", body: state.toDictionary())
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didChangeNetworkState state: NetworkState) {
        emitEvent("onNetworkState", body: state.toDictionary())
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didChangeAppState state: AppState) {
        emitEvent("onAppState", body: state.toDictionary())
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didDetectAppUpdate info: AppUpdateInfo) {
        emitEvent("onAppUpdated", body: info.toDictionary())
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didFailWithAuthError event: AbrovaPushAuthErrorEvent) {
        // Only meaningful while JS is listening: not queued for later.
        guard hasListeners else { return }
        sendEvent(withName: "onAuthError", body: [
            "code": event.code,
            "message": event.message
        ])
    }

    func abrovaPush(_ abrovaPush: AbrovaPush, didReceiveNotificationAction action: NotificationAction, forMessage message: AbrovaPushMessage) {
        let messageDict = message.toDictionary()
        emitEvent("onNotificationAction", body: [
            "actionId": action.id,
            "title": messageDict["title"] as Any,
            "body": messageDict["body"] as Any,
            "data": messageDict["data"] as Any,
            "messageId": messageDict["messageId"] as Any
        ])
    }
}

// MARK: - InAppMessageCallback
extension AbrovaPushReactNative: InAppMessageCallback {
    func inAppMessageReady(_ message: InAppMessage) {
        emitEvent("onInAppMessageReady", body: message.toDictionary())
    }

    func inAppMessageButtonClicked(_ message: InAppMessage, button: InAppButton) {
        emitEvent("onInAppButtonClick", body: [
            "message": message.toDictionary(),
            "button": button.toDictionary()
        ])
    }

    func inAppMessageDismissed(_ message: InAppMessage) {
        emitEvent("onInAppMessageDismissed", body: message.toDictionary())
    }

    func inAppMessageError(_ error: String) {
        emitEvent("onError", body: error)
    }
}

// MARK: - InboxCallback
extension AbrovaPushReactNative: InboxCallback {
    func inboxMessageReceived(_ message: InboxMessage) {
        emitEvent("onInboxMessageReceived", body: message.toDictionary())
    }

    func inboxMessageStatusChanged(messageId: String, status: InboxMessageStatus) {
        emitEvent("onInboxMessageStatusChanged", body: [
            "messageId": messageId,
            "status": status.rawValue
        ])
    }
}

// MARK: - ABTestingDelegate
extension AbrovaPushReactNative: ABTestingDelegate {
    func abTestingManager(_ manager: ABTestingManager, didAssignVariant variant: ABTestVariant) {
        emitEvent("onABTestVariantAssigned", body: variant.toDictionary())
    }

    func abTestingManager(_ manager: ABTestingManager, didFailWithError error: Error, forTest testId: String?) {
        emitEvent("onABTestError", body: [
            "testId": testId ?? "",
            "error": error.localizedDescription
        ])
    }
}

// MARK: - UNUserNotificationCenterDelegate
extension AbrovaPushReactNative: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // This module owns the notification-centre delegate, so the SDK never
        // sees willPresent. Forward it so foreground deliveries are confirmed.
        AbrovaPush.shared.handleRemoteNotification(userInfo: notification.request.content.userInfo)

        if showNotificationInForeground {
            if #available(iOS 14.0, *) {
                completionHandler([.banner, .sound, .badge])
            } else {
                completionHandler([.alert, .sound, .badge])
            }
        } else {
            completionHandler([])
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo

        // Forward to native SDK for notification response handling
        AbrovaPush.shared.handleNotificationResponse(userInfo: userInfo, actionIdentifier: response.actionIdentifier)

        // Auto-track A/B test click from APNs payload (abTestId/variantId are at top level)
        if let abTestId = userInfo["abTestId"] as? String,
           let variantId = userInfo["variantId"] as? String,
           !abTestId.isEmpty, !variantId.isEmpty {
            AbrovaPush.shared.trackABTestClicked(testId: abTestId, variantId: variantId) { _ in }
        }

        // Only emit onNotificationTapped for body taps. Action-button taps
        // are dispatched via the SDK delegate as onNotificationAction.
        let isBodyTap = response.actionIdentifier == UNNotificationDefaultActionIdentifier
        if isBodyTap, let message = AbrovaPushMessage.from(payload: userInfo) {
            emitEvent("onNotificationTapped", body: message.toDictionary())
        }
        completionHandler()
    }
}

// MARK: - APNs Token Forwarding
extension AbrovaPushReactNative {
    @objc static func didRegisterForRemoteNotificationsWithDeviceToken(_ deviceToken: Data) {
        AbrovaPush.shared.setAPNsToken(deviceToken)
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Log.d("ReactNative", "APNs token forwarded: \(String(token.prefix(20)))...")
    }

    @objc static func didFailToRegisterForRemoteNotificationsWithError(_ error: Error) {
        Log.d("ReactNative", "APNs registration failed: \(error.localizedDescription)")
    }
}
