/**
 * AbrovaPush React Native Module
 * Bridge between React Native and native Android SDK
 */
package ir.abrova.push.reactnative

import android.app.Activity
import android.content.Intent
import android.util.Log
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

// Import from native SDK
import ir.abrova.push.sdk.AbrovaPush
import ir.abrova.push.sdk.AbrovaPushAuthError
import ir.abrova.push.sdk.AbrovaPushBlockingTokenProvider
import ir.abrova.push.sdk.AbrovaPushCallbackAdapter
import ir.abrova.push.sdk.AbrovaPushConfig
import ir.abrova.push.sdk.AbrovaPushError
import ir.abrova.push.sdk.AbrovaPushLogLevel
import ir.abrova.push.sdk.AbrovaPushMessage
import ir.abrova.push.sdk.AbrovaPushService
import ir.abrova.push.sdk.inapp.InAppMessage
import ir.abrova.push.sdk.inapp.InAppButton
import ir.abrova.push.sdk.inapp.InAppMessageCallback
import ir.abrova.push.sdk.inbox.InboxFilter
import ir.abrova.push.sdk.inbox.InboxMessage
import ir.abrova.push.sdk.inbox.InboxMessageStatus
import ir.abrova.push.sdk.abtesting.ABTestingCallback
import ir.abrova.push.sdk.abtesting.ABTestVariant
import ir.abrova.push.sdk.abtesting.ABTestSummary

class AbrovaPushReactNativeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener, ActivityEventListener {

    companion object {
        const val TAG = "AbrovaPushRN"
        const val NAME = "AbrovaPushReactNative"

        // The module instance whose JS side has a tokenProvider. Null when
        // none does: nothing is registered with the native SDK then.
        @Volatile
        private var tokenProviderOwner: AbrovaPushReactNativeModule? = null

        private const val TOKEN_REPLY_TIMEOUT_MS = 10_000L
    }

    // A token request waiting for JS to answer.
    private class TokenRequest {
        val latch = java.util.concurrent.CountDownLatch(1)
        @Volatile var token: String? = null
        @Volatile var failure: Throwable? = null
    }

    private val pendingTokenRequests = java.util.concurrent.ConcurrentHashMap<String, TokenRequest>()

    private var listenerCount = 0
    private var isInForeground = true
    private var lifecycleObserverRegistered = false

    init {
        reactContext.addLifecycleEventListener(this)
        // Listen for onNewIntent so taps from the status-bar shade (warm start)
        // are forwarded to the native SDK; without this the activity comes to
        // the foreground but onNotificationTapped / getInitialMessage may miss it.
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    override fun getConstants(): MutableMap<String, Any> {
        return hashMapOf(
            "LOG_LEVEL_NONE" to "none",
            "LOG_LEVEL_ERROR" to "error",
            "LOG_LEVEL_WARNING" to "warning",
            "LOG_LEVEL_INFO" to "info",
            "LOG_LEVEL_DEBUG" to "debug",
            "LOG_LEVEL_VERBOSE" to "verbose"
        )
    }

    @ReactMethod
    fun init(configMap: ReadableMap, promise: Promise) {
        try {
            val config = AbrovaPushConfig(
                apiKey = configMap.getString("apiKey") ?: throw Exception("apiKey is required"),
                notificationIcon = configMap.getString("notificationIcon"),
                showServiceNotification = if (configMap.hasKey("showServiceNotification"))
                    configMap.getBoolean("showServiceNotification") else true,
                showNotificationInForeground = if (configMap.hasKey("showNotificationInForeground"))
                    configMap.getBoolean("showNotificationInForeground") else true,
                autoRefresh = if (configMap.hasKey("autoRefresh") && !configMap.isNull("autoRefresh"))
                    configMap.getBoolean("autoRefresh") else true,
                wrapperSdkName = if (configMap.hasKey("wrapperSdkName")) configMap.getString("wrapperSdkName") else null,
                wrapperSdkVersion = if (configMap.hasKey("wrapperSdkVersion")) configMap.getString("wrapperSdkVersion") else null,
                sendDiagnostics = if (configMap.hasKey("sendDiagnostics") && !configMap.isNull("sendDiagnostics"))
                    configMap.getBoolean("sendDiagnostics") else true
            )

            // Initialize native SDK
            AbrovaPush.init(reactApplicationContext, config)

            // Set up callbacks to forward events to React Native
            AbrovaPush.setCallback(object : AbrovaPushCallbackAdapter() {
                override fun onMessageReceived(message: AbrovaPushMessage) {
                    Log.d(TAG, "Message received: ${message.title}")
                    sendEvent("onMessage", messageToMap(message))
                }

                override fun onConnectionStateChanged(connected: Boolean) {
                    Log.d(TAG, "Connection state changed: $connected")
                    sendEvent("onConnectionState", connected)
                }

                override fun onRegistered(deviceId: String) {
                    Log.d(TAG, "Device registered: $deviceId")
                    sendEvent("onRegistered", deviceId)
                }

                override fun onError(error: String) {
                    Log.e(TAG, "Error: $error")
                    sendEvent("onError", error)
                }

                override fun onDetailedError(error: AbrovaPushError) {
                    Log.e(TAG, "Detailed error: ${error.code} - ${error.message}")
                    sendEvent("onDetailedError", Arguments.createMap().apply {
                        putInt("code", error.code)
                        putString("message", error.message)
                        putString("details", error.details)
                    })
                }

                override fun onReconnecting(attempt: Int, nextRetryMs: Long) {
                    Log.d(TAG, "Reconnecting: attempt=$attempt, nextRetry=${nextRetryMs}ms")
                    val map = Arguments.createMap().apply {
                        putInt("retryAttempt", attempt)
                        putDouble("nextRetryMs", nextRetryMs.toDouble())
                    }
                    sendEvent("onReconnecting", map)
                }

                override fun onNetworkStateChanged(isAvailable: Boolean, networkType: String) {
                    Log.d(TAG, "Network state: available=$isAvailable, type=$networkType")
                    val map = Arguments.createMap().apply {
                        putBoolean("isAvailable", isAvailable)
                        putString("networkType", networkType)
                    }
                    sendEvent("onNetworkState", map)
                }

                override fun onAppStateChanged(isInForeground: Boolean) {
                    Log.d(TAG, "App state: foreground=$isInForeground")
                    val map = Arguments.createMap().apply {
                        putBoolean("isInForeground", isInForeground)
                    }
                    sendEvent("onAppState", map)
                }

                override fun onAppUpdated(previousVersion: String, currentVersion: String, needsReregistration: Boolean) {
                    Log.d(TAG, "App updated: $previousVersion -> $currentVersion")
                    val map = Arguments.createMap().apply {
                        putString("previousVersion", previousVersion)
                        putString("currentVersion", currentVersion)
                        putBoolean("needsReregistration", needsReregistration)
                    }
                    sendEvent("onAppUpdated", map)
                }

                override fun onNotificationTapped(message: AbrovaPushMessage) {
                    Log.d(TAG, "Notification tapped: ${message.title}")
                    sendEvent("onNotificationTapped", messageToMap(message))
                }

                override fun onAuthError(error: AbrovaPushAuthError) {
                    // Only meaningful while JS is listening: not queued for later.
                    if (!reactApplicationContext.hasActiveReactInstance()) return
                    sendEvent("onAuthError", Arguments.createMap().apply {
                        putString("code", error.code)
                        putString("message", error.message)
                    })
                }

                override fun onNotificationAction(message: AbrovaPushMessage, actionId: String) {
                    Log.d(TAG, "Notification action: $actionId for ${message.title}")
                    val map = Arguments.createMap().apply {
                        putString("actionId", actionId)
                        message.title?.let { putString("title", it) }
                        message.body?.let { putString("body", it) }
                        message.messageId?.let { putString("messageId", it) }
                        message.data?.let { data ->
                            val dataMap = Arguments.createMap()
                            data.forEach { (k, v) ->
                                when (v) {
                                    is String -> dataMap.putString(k, v)
                                    is Number -> dataMap.putDouble(k, v.toDouble())
                                    is Boolean -> dataMap.putBoolean(k, v)
                                    else -> dataMap.putString(k, v.toString())
                                }
                            }
                            putMap("data", dataMap)
                        }
                    }
                    sendEvent("onNotificationAction", map)
                }
            })

            // Set up in-app message callback
            AbrovaPush.setInAppMessageCallback(object : InAppMessageCallback {
                override fun onMessageReady(message: InAppMessage) {
                    Log.d(TAG, "In-app message ready: ${message.name}")
                    sendEvent("onInAppMessageReady", inAppMessageToMap(message))
                }

                override fun onButtonClicked(message: InAppMessage, button: InAppButton) {
                    Log.d(TAG, "In-app button clicked: ${button.text}")
                    val map = Arguments.createMap().apply {
                        putMap("message", inAppMessageToMap(message))
                        putMap("button", inAppButtonToMap(button))
                    }
                    sendEvent("onInAppButtonClick", map)
                }

                override fun onMessageDismissed(message: InAppMessage) {
                    Log.d(TAG, "In-app message dismissed: ${message.name}")
                    sendEvent("onInAppMessageDismissed", inAppMessageToMap(message))
                }

                override fun onError(error: String) {
                    Log.e(TAG, "In-app message error: $error")
                    sendEvent("onError", error)
                }
            })

            // Set up A/B testing callback
            AbrovaPush.setABTestingCallback(object : ABTestingCallback {
                override fun onVariantAssigned(variant: ABTestVariant) {
                    Log.d(TAG, "A/B test variant assigned: ${variant.variantName}")
                    sendEvent("onABTestVariantAssigned", abTestVariantToMap(variant))
                }

                override fun onError(testId: String?, error: String) {
                    Log.e(TAG, "A/B test error for $testId: $error")
                    val map = Arguments.createMap().apply {
                        putString("testId", testId ?: "")
                        putString("error", error)
                    }
                    sendEvent("onABTestError", map)
                }
            })

            // Set up inbox callback for real-time inbox updates
            AbrovaPush.getInboxManager().setCallback(object : ir.abrova.push.sdk.inbox.InboxCallback {
                override fun onMessageReceived(message: ir.abrova.push.sdk.inbox.InboxMessage) {
                    Log.d(TAG, "Inbox message received: ${message.content.title}")
                    val map = Arguments.createMap().apply {
                        putString("id", message.id)
                        putString("title", message.content.title)
                        putString("body", message.content.body)
                        putString("category", message.category)
                        putString("status", message.status.name.lowercase())
                        putString("createdAt", message.createdAt)
                    }
                    sendEvent("onInboxMessageReceived", map)
                }

                override fun onMessageStatusChanged(messageId: String, status: ir.abrova.push.sdk.inbox.InboxMessageStatus) {
                    Log.d(TAG, "Inbox message status changed: $messageId -> $status")
                    val map = Arguments.createMap().apply {
                        putString("messageId", messageId)
                        putString("status", status.name.lowercase())
                    }
                    sendEvent("onInboxMessageStatusChanged", map)
                }
            })

            // Set up lifecycle observer
            setupLifecycleObserver()

            Log.d(TAG, "AbrovaPush SDK initialized with native SDK")
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Init error: ${e.message}")
            promise.reject("INIT_ERROR", e.message)
        }
    }

    @ReactMethod
    fun register(userId: String?, metadata: ReadableMap?, promise: Promise) {
        try {
            val metadataMap = metadata?.let { map ->
                val result = mutableMapOf<String, Any>()
                val iterator = map.keySetIterator()
                while (iterator.hasNextKey()) {
                    val key = iterator.nextKey()
                    when (map.getType(key)) {
                        ReadableType.String -> result[key] = map.getString(key) ?: ""
                        ReadableType.Number -> result[key] = map.getDouble(key)
                        ReadableType.Boolean -> result[key] = map.getBoolean(key)
                        else -> {}
                    }
                }
                result
            }

            AbrovaPush.register(userId, metadataMap)
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Register error: ${e.message}")
            promise.reject("REGISTER_ERROR", e.message)
        }
    }

    @ReactMethod
    fun unregister(promise: Promise) {
        try {
            AbrovaPush.unregister()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("UNREGISTER_ERROR", e.message)
        }
    }

    @ReactMethod
    fun subscribeTopic(topic: String, promise: Promise) {
        try {
            AbrovaPush.subscribeTopic(topic)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SUBSCRIBE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun unsubscribeTopic(topic: String, promise: Promise) {
        try {
            AbrovaPush.unsubscribeTopic(topic)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("UNSUBSCRIBE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isConnected(promise: Promise) {
        try {
            val connected = AbrovaPush.isConnected()
            promise.resolve(connected)
        } catch (e: Exception) {
            promise.reject("CONNECTION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getDeviceId(promise: Promise) {
        try {
            val deviceId = AbrovaPush.getDeviceId()
            promise.resolve(deviceId)
        } catch (e: Exception) {
            promise.reject("DEVICE_ID_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getSubscriptionId(promise: Promise) {
        try {
            promise.resolve(AbrovaPush.getSubscriptionId())
        } catch (e: Exception) {
            promise.reject("SUBSCRIPTION_ID_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setUserId(userId: String, promise: Promise) {
        try {
            AbrovaPush.setUserId(userId)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SET_USER_ID_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearUserId(promise: Promise) {
        try {
            AbrovaPush.clearUserId()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CLEAR_USER_ID_ERROR", e.message)
        }
    }

    // ==================== Signed User Tokens ====================

    @ReactMethod
    fun setTokenProvider(enabled: Boolean, promise: Promise) {
        try {
            if (enabled) {
                tokenProviderOwner = this
                AbrovaPush.setBlockingTokenProvider(AbrovaPushBlockingTokenProvider { fetchUserTokenFromJs() })
            } else {
                tokenProviderOwner = null
                AbrovaPush.setBlockingTokenProvider(null)
                failPendingTokenRequests("tokenProvider removed")
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("TOKEN_PROVIDER_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setUserToken(token: String?, promise: Promise) {
        try {
            AbrovaPush.setUserToken(token)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SET_USER_TOKEN_ERROR", e.message)
        }
    }

    /**
     * JS answers a `getUserToken` event: a token, null when no user is signed
     * in, or an error when the provider failed.
     */
    @ReactMethod
    fun answerUserToken(requestId: String, token: String?, error: String?) {
        val request = pendingTokenRequests.remove(requestId) ?: return
        if (error != null) {
            request.failure = IllegalStateException(error)
        } else {
            request.token = token?.takeIf { it.isNotEmpty() }
        }
        request.latch.countDown()
    }

    /**
     * Asks JS for the user token. Runs on a native SDK background thread.
     * Returns null only when JS says no user is signed in; throws when JS
     * cannot answer, so the native SDK keeps the token it already has.
     */
    private fun fetchUserTokenFromJs(): String? {
        if (tokenProviderOwner !== this || !reactApplicationContext.hasActiveReactInstance()) {
            throw IllegalStateException("React Native is not running")
        }
        val requestId = java.util.UUID.randomUUID().toString()
        val request = TokenRequest()
        pendingTokenRequests[requestId] = request
        try {
            sendEvent("getUserToken", Arguments.createMap().apply { putString("requestId", requestId) })
            if (!request.latch.await(TOKEN_REPLY_TIMEOUT_MS, java.util.concurrent.TimeUnit.MILLISECONDS)) {
                throw java.util.concurrent.TimeoutException("tokenProvider did not answer in time")
            }
        } finally {
            pendingTokenRequests.remove(requestId)
        }
        request.failure?.let { throw it }
        return request.token
    }

    private fun failPendingTokenRequests(reason: String) {
        val pending = pendingTokenRequests.values.toList()
        pendingTokenRequests.clear()
        pending.forEach {
            it.failure = IllegalStateException(reason)
            it.latch.countDown()
        }
    }

    @ReactMethod
    fun getInitialMessage(promise: Promise) {
        try {
            val message = AbrovaPush.getInitialMessage()
            if (message != null) {
                AbrovaPush.clearInitialMessage()
                promise.resolve(messageToMap(message))
            } else {
                promise.resolve(null)
            }
        } catch (e: Exception) {
            promise.reject("INITIAL_MESSAGE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getClickedAction(promise: Promise) {
        try {
            val action = AbrovaPush.getClickedAction()
            if (action != null) {
                val map = Arguments.createMap().apply {
                    action.forEach { (k, v) ->
                        if (v != null) putString(k, v) else putNull(k)
                    }
                }
                promise.resolve(map)
            } else {
                promise.resolve(null)
            }
        } catch (e: Exception) {
            promise.reject("CLICKED_ACTION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setLogLevel(level: String, promise: Promise) {
        try {
            val logLevel = when (level.lowercase()) {
                "none" -> AbrovaPushLogLevel.NONE
                "error" -> AbrovaPushLogLevel.ERROR
                "warning" -> AbrovaPushLogLevel.WARNING
                "info" -> AbrovaPushLogLevel.INFO
                "debug" -> AbrovaPushLogLevel.DEBUG
                "verbose" -> AbrovaPushLogLevel.VERBOSE
                else -> AbrovaPushLogLevel.DEBUG
            }
            AbrovaPush.setLogLevel(logLevel)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("LOG_LEVEL_ERROR", e.message)
        }
    }

    // ==================== In-App Messages ====================

    @ReactMethod
    fun fetchInAppMessages(promise: Promise) {
        try {
            AbrovaPush.fetchInAppMessages { messages ->
                val array = Arguments.createArray()
                messages.forEach { message ->
                    array.pushMap(inAppMessageToMap(message))
                }
                promise.resolve(array)
            }
        } catch (e: Exception) {
            promise.reject("FETCH_INAPP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun triggerInAppOnAppOpen(promise: Promise) {
        try {
            AbrovaPush.triggerInAppOnAppOpen()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("TRIGGER_INAPP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun triggerInAppEvent(eventName: String, properties: ReadableMap?, promise: Promise) {
        try {
            val propsMap = properties?.let { map ->
                val result = mutableMapOf<String, Any>()
                val iterator = map.keySetIterator()
                while (iterator.hasNextKey()) {
                    val key = iterator.nextKey()
                    when (map.getType(key)) {
                        ReadableType.String -> result[key] = map.getString(key) ?: ""
                        ReadableType.Number -> result[key] = map.getDouble(key)
                        ReadableType.Boolean -> result[key] = map.getBoolean(key)
                        else -> {}
                    }
                }
                result
            }
            AbrovaPush.triggerInAppEvent(eventName, propsMap)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("TRIGGER_INAPP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun triggerInAppOnSessionStart(promise: Promise) {
        try {
            AbrovaPush.triggerInAppOnSessionStart()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("TRIGGER_INAPP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun showInAppMessage(messageId: String, promise: Promise) {
        try {
            AbrovaPush.showInAppMessage(messageId)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SHOW_INAPP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun dismissInAppMessage(promise: Promise) {
        try {
            AbrovaPush.dismissInAppMessage()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DISMISS_INAPP_ERROR", e.message)
        }
    }

    // ==================== Inbox ====================

    @ReactMethod
    fun getInboxMessages(filterMap: ReadableMap?, promise: Promise) {
        try {
            val status = filterMap?.getString("status")?.let {
                when (it.lowercase()) {
                    "unread" -> InboxMessageStatus.UNREAD
                    "read" -> InboxMessageStatus.READ
                    "archived" -> InboxMessageStatus.ARCHIVED
                    else -> null
                }
            }
            val category = filterMap?.getString("category")
            val limit = if (filterMap?.hasKey("limit") == true) filterMap.getInt("limit") else 50
            val offset = if (filterMap?.hasKey("offset") == true) filterMap.getInt("offset") else 0

            val filter = InboxFilter(
                status = status,
                category = category,
                limit = limit,
                offset = offset
            )

            AbrovaPush.getInboxMessages(
                filter = filter,
                onSuccess = { response ->
                    val map = Arguments.createMap().apply {
                        val messagesArray = Arguments.createArray()
                        response.messages.forEach { msg ->
                            messagesArray.pushMap(inboxMessageToMap(msg))
                        }
                        putArray("messages", messagesArray)
                        putInt("total", response.total)
                        putInt("unreadCount", response.unreadCount)
                    }
                    promise.resolve(map)
                },
                onError = { error ->
                    promise.reject("INBOX_ERROR", error)
                }
            )
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getInboxMessage(messageId: String, promise: Promise) {
        try {
            AbrovaPush.getInboxMessage(
                messageId = messageId,
                onSuccess = { message ->
                    promise.resolve(inboxMessageToMap(message))
                },
                onError = { error ->
                    promise.reject("INBOX_ERROR", error)
                }
            )
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun markInboxMessageAsRead(messageId: String, promise: Promise) {
        try {
            AbrovaPush.markInboxMessageAsRead(
                messageId = messageId,
                onSuccess = { promise.resolve(null) },
                onError = { error -> promise.reject("INBOX_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun archiveInboxMessage(messageId: String, promise: Promise) {
        try {
            AbrovaPush.archiveInboxMessage(
                messageId = messageId,
                onSuccess = { promise.resolve(null) },
                onError = { error -> promise.reject("INBOX_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun deleteInboxMessage(messageId: String, promise: Promise) {
        try {
            AbrovaPush.deleteInboxMessage(
                messageId = messageId,
                onSuccess = { promise.resolve(null) },
                onError = { error -> promise.reject("INBOX_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun markMultipleInboxMessages(messageIds: ReadableArray, statusStr: String, promise: Promise) {
        try {
            val ids = mutableListOf<String>()
            for (i in 0 until messageIds.size()) {
                messageIds.getString(i)?.let { ids.add(it) }
            }

            val status = when (statusStr.lowercase()) {
                "read" -> InboxMessageStatus.READ
                "archived" -> InboxMessageStatus.ARCHIVED
                "deleted" -> InboxMessageStatus.DELETED
                else -> InboxMessageStatus.READ
            }

            AbrovaPush.markMultipleInboxMessages(
                messageIds = ids,
                status = status,
                onSuccess = { promise.resolve(null) },
                onError = { error -> promise.reject("INBOX_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun markAllInboxMessagesAsRead(promise: Promise) {
        try {
            AbrovaPush.markAllInboxMessagesAsRead(
                onSuccess = { promise.resolve(null) },
                onError = { error -> promise.reject("INBOX_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getInboxUnreadCount(promise: Promise) {
        try {
            val count = AbrovaPush.getInboxUnreadCount()
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun fetchInboxUnreadCount(promise: Promise) {
        try {
            AbrovaPush.fetchInboxUnreadCount(
                onSuccess = { count -> promise.resolve(count) },
                onError = { error -> promise.reject("INBOX_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getCachedInboxMessages(promise: Promise) {
        try {
            val messages = AbrovaPush.getCachedInboxMessages()
            val array = Arguments.createArray()
            messages.forEach { msg ->
                array.pushMap(inboxMessageToMap(msg))
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearInboxCache(promise: Promise) {
        try {
            AbrovaPush.clearInboxCache()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("INBOX_ERROR", e.message)
        }
    }

    // ==================== A/B Testing ====================

    @ReactMethod
    fun getActiveABTests(promise: Promise) {
        try {
            AbrovaPush.getActiveABTests(
                onSuccess = { tests ->
                    val array = Arguments.createArray()
                    tests.forEach { test ->
                        array.pushMap(abTestSummaryToMap(test))
                    }
                    promise.resolve(array)
                },
                onError = { error ->
                    promise.reject("ABTEST_ERROR", error)
                }
            )
        } catch (e: Exception) {
            promise.reject("ABTEST_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getABTestVariant(testId: String, forceRefresh: Boolean, promise: Promise) {
        try {
            AbrovaPush.getABTestVariant(
                testId = testId,
                forceRefresh = forceRefresh,
                onSuccess = { variant ->
                    promise.resolve(abTestVariantToMap(variant))
                },
                onError = { error ->
                    promise.reject("ABTEST_ERROR", error)
                }
            )
        } catch (e: Exception) {
            promise.reject("ABTEST_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getCachedABTestVariant(testId: String, promise: Promise) {
        try {
            val variant = AbrovaPush.getCachedABTestVariant(testId)
            if (variant != null) {
                promise.resolve(abTestVariantToMap(variant))
            } else {
                promise.resolve(null)
            }
        } catch (e: Exception) {
            promise.reject("ABTEST_ERROR", e.message)
        }
    }

    @ReactMethod
    fun trackABTestImpression(testId: String, variantId: String, promise: Promise) {
        try {
            AbrovaPush.trackABTestImpression(
                testId = testId,
                variantId = variantId,
                onSuccess = { promise.resolve(null) },
                onError = { error -> promise.reject("ABTEST_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("ABTEST_ERROR", e.message)
        }
    }

    @ReactMethod
    fun trackABTestOpened(testId: String, variantId: String, promise: Promise) {
        try {
            AbrovaPush.trackABTestOpened(
                testId = testId,
                variantId = variantId,
                onSuccess = { promise.resolve(null) },
                onError = { error -> promise.reject("ABTEST_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("ABTEST_ERROR", e.message)
        }
    }

    @ReactMethod
    fun trackABTestClicked(testId: String, variantId: String, promise: Promise) {
        try {
            AbrovaPush.trackABTestClicked(
                testId = testId,
                variantId = variantId,
                onSuccess = { promise.resolve(null) },
                onError = { error -> promise.reject("ABTEST_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("ABTEST_ERROR", e.message)
        }
    }

    @ReactMethod
    fun trackABTestConverted(testId: String, variantId: String, promise: Promise) {
        try {
            AbrovaPush.trackABTestConverted(
                testId = testId,
                variantId = variantId,
                onSuccess = { promise.resolve(null) },
                onError = { error -> promise.reject("ABTEST_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("ABTEST_ERROR", e.message)
        }
    }

    @ReactMethod
    fun trackABTestDisplay(testId: String, variantId: String, promise: Promise) {
        try {
            // trackDisplay = impression + opened (same as Flutter plugin)
            AbrovaPush.trackABTestImpression(
                testId = testId,
                variantId = variantId,
                onSuccess = {
                    AbrovaPush.trackABTestOpened(
                        testId = testId,
                        variantId = variantId,
                        onSuccess = { promise.resolve(null) },
                        onError = { error -> promise.reject("ABTEST_ERROR", error) }
                    )
                },
                onError = { error -> promise.reject("ABTEST_ERROR", error) }
            )
        } catch (e: Exception) {
            promise.reject("ABTEST_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearABTestCache(promise: Promise) {
        try {
            AbrovaPush.clearABTestingCache()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ABTEST_ERROR", e.message)
        }
    }

    // ==================== Service Notification ====================

    @ReactMethod
    fun isServiceNotificationHidden(promise: Promise) {
        try {
            promise.resolve(AbrovaPush.isServiceNotificationHidden())
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun openServiceNotificationSettings(promise: Promise) {
        try {
            AbrovaPush.openServiceNotificationSettings()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_ERROR", e.message)
        }
    }

    // ==================== Event Listeners ====================

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount++
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount -= count
    }

    // ==================== Lifecycle ====================

    override fun onHostResume() {
        isInForeground = true
        reactApplicationContext.currentActivity?.let { AbrovaPush.setCurrentActivity(it) }
    }

    override fun onHostPause() {
        isInForeground = false
    }

    override fun onHostDestroy() {
        AbrovaPush.setCurrentActivity(null)
    }

    // ActivityEventListener — forward onNewIntent so taps from the shade after
    // a delay deliver onNotificationTapped / populate getInitialMessage.
    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        // No-op; only onNewIntent is relevant for this module.
    }

    override fun onNewIntent(intent: Intent?) {
        if (intent != null) {
            AbrovaPush.handleNotificationIntent(intent)
        }
    }

    // ==================== Private Helpers ====================

    private fun setupLifecycleObserver() {
        if (lifecycleObserverRegistered) return

        try {
            val observer = LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_START -> {
                        if (!isInForeground) {
                            isInForeground = true
                            if (!AbrovaPush.isConnected()) {
                                AbrovaPushService.reconnectNow()
                            }
                        }
                    }
                    Lifecycle.Event.ON_STOP -> {
                        isInForeground = false
                    }
                    else -> {}
                }
            }
            // addObserver must be called on the main thread
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                try {
                    ProcessLifecycleOwner.get().lifecycle.addObserver(observer)
                    lifecycleObserverRegistered = true
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to add lifecycle observer: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to setup lifecycle observer: ${e.message}")
        }
    }

    private fun sendEvent(eventName: String, params: Any?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun messageToMap(message: AbrovaPushMessage): WritableMap {
        return Arguments.createMap().apply {
            putString("title", message.title)
            putString("body", message.body)
            putBoolean("silent", message.silent)
            message.imageUrl?.let { putString("imageUrl", it) }
            message.iconUrl?.let { putString("iconUrl", it) }
            message.deepLink?.let { putString("deepLink", it) }
            message.badge?.let { putInt("badge", it) }
            message.badgeAction?.let { putString("badgeAction", it) }
            message.sound?.let { putString("sound", it) }
            message.threadId?.let { putString("threadId", it) }
            message.collapseKey?.let { putString("collapseKey", it) }
            message.category?.let { putString("category", it) }
            message.priority?.let { putString("priority", it) }
            message.ttl?.let { putInt("ttl", it) }
            message.messageId?.let { putString("messageId", it) }
            message.campaignId?.let { putString("campaignId", it) }

            message.data?.let { data ->
                val dataMap = Arguments.createMap()
                data.forEach { (k, v) ->
                    when (v) {
                        is String -> dataMap.putString(k, v)
                        is Number -> dataMap.putDouble(k, v.toDouble())
                        is Boolean -> dataMap.putBoolean(k, v)
                        else -> dataMap.putString(k, v.toString())
                    }
                }
                putMap("data", dataMap)
            }

            message.actions?.let { actions ->
                val actionsArray = Arguments.createArray()
                actions.forEach { action ->
                    val actionMap = Arguments.createMap().apply {
                        putString("id", action.id)
                        putString("title", action.title)
                        action.action?.let { putString("action", it) }
                        action.icon?.let { putString("icon", it) }
                    }
                    actionsArray.pushMap(actionMap)
                }
                putArray("actions", actionsArray)
            }
        }
    }

    private fun inAppMessageToMap(message: InAppMessage): WritableMap {
        return Arguments.createMap().apply {
            putString("id", message.id)
            putString("name", message.name)
            putString("type", message.type.value)
            putMap("content", inAppContentToMap(message.content))
            putString("triggerType", message.triggerType.value)
            message.triggerEvent?.let { putString("triggerEvent", it) }
            message.startDate?.let { putDouble("startDate", it.toDouble()) }
            message.endDate?.let { putDouble("endDate", it.toDouble()) }
            putInt("maxImpressions", message.maxImpressions)
            putInt("minSessionCount", message.minSessionCount)
            putInt("delaySeconds", message.delaySeconds)
            putInt("priority", message.priority)
        }
    }

    private fun inAppContentToMap(content: ir.abrova.push.sdk.inapp.InAppMessageContent): WritableMap {
        return Arguments.createMap().apply {
            putString("title", content.title)
            putString("body", content.body)
            content.imageUrl?.let { putString("imageUrl", it) }
            content.backgroundColor?.let { putString("backgroundColor", it) }
            content.textColor?.let { putString("textColor", it) }

            val buttonsArray = Arguments.createArray()
            content.buttons.forEach { button ->
                buttonsArray.pushMap(inAppButtonToMap(button))
            }
            putArray("buttons", buttonsArray)
        }
    }

    private fun inAppButtonToMap(button: InAppButton): WritableMap {
        return Arguments.createMap().apply {
            putString("id", button.id)
            putString("text", button.text)
            putString("action", button.action.value)
            button.value?.let { putString("value", it) }
            putString("style", button.style.value)
        }
    }

    private fun inboxMessageToMap(message: InboxMessage): WritableMap {
        return Arguments.createMap().apply {
            putString("id", message.id)
            message.userId?.let { putString("userId", it) }
            message.deviceId?.let { putString("deviceId", it) }

            val contentMap = Arguments.createMap().apply {
                putString("title", message.content.title)
                putString("body", message.content.body)
                message.content.imageUrl?.let { putString("imageUrl", it) }
                message.content.iconUrl?.let { putString("iconUrl", it) }
                message.content.deepLink?.let { putString("deepLink", it) }
                message.content.data?.let { data ->
                    val dataMap = Arguments.createMap()
                    data.forEach { (k, v) ->
                        when (v) {
                            is String -> dataMap.putString(k, v)
                            is Number -> dataMap.putDouble(k, v.toDouble())
                            is Boolean -> dataMap.putBoolean(k, v)
                            else -> dataMap.putString(k, v.toString())
                        }
                    }
                    putMap("data", dataMap)
                }
            }
            putMap("content", contentMap)

            putString("status", message.status.name.lowercase())
            message.category?.let { putString("category", it) }
            message.expiresAt?.let { putString("expiresAt", it) }
            message.readAt?.let { putString("readAt", it) }
            putString("createdAt", message.createdAt)
            message.updatedAt?.let { putString("updatedAt", it) }
        }
    }

    private fun abTestSummaryToMap(summary: ABTestSummary): WritableMap {
        return Arguments.createMap().apply {
            putString("id", summary.id)
            putString("name", summary.name)
            putInt("variantCount", summary.variantCount)
            putBoolean("hasControlGroup", summary.hasControlGroup)
        }
    }

    private fun abTestVariantToMap(variant: ABTestVariant): WritableMap {
        return Arguments.createMap().apply {
            putString("testId", variant.testId)
            putString("variantId", variant.variantId)
            putString("variantName", variant.variantName)
            putBoolean("isControlGroup", variant.isControlGroup)
            variant.content?.let { content ->
                val contentMap = Arguments.createMap().apply {
                    content.title?.let { putString("title", it) }
                    content.body?.let { putString("body", it) }
                    content.imageUrl?.let { putString("imageUrl", it) }
                    content.deepLink?.let { putString("deepLink", it) }
                    content.data?.let { data ->
                        val dataMap = Arguments.createMap()
                        data.forEach { (k, v) ->
                            when (v) {
                                is String -> dataMap.putString(k, v)
                                is Number -> dataMap.putDouble(k, v.toDouble())
                                is Boolean -> dataMap.putBoolean(k, v)
                                else -> dataMap.putString(k, v.toString())
                            }
                        }
                        putMap("data", dataMap)
                    }
                    content.actions?.let { actions ->
                        val actionsArray = Arguments.createArray()
                        actions.forEach { action ->
                            val actionMap = Arguments.createMap().apply {
                                putString("id", action.id)
                                putString("title", action.title)
                                putString("action", action.action)
                            }
                            actionsArray.pushMap(actionMap)
                        }
                        putArray("actions", actionsArray)
                    }
                }
                putMap("content", contentMap)
            }
        }
    }

    override fun invalidate() {
        super.invalidate()
        // JS can no longer answer: the native SDK goes on with the token it has.
        if (tokenProviderOwner === this) {
            tokenProviderOwner = null
            AbrovaPush.setBlockingTokenProvider(null)
        }
        failPendingTokenRequests("React Native bridge invalidated")
        AbrovaPush.setCurrentActivity(null)
        reactApplicationContext.removeActivityEventListener(this)
    }
}
