# AbrovaPush React Native SDK

Real-time push notifications, in-app messages, inbox, A/B testing, and more for React Native apps. No Firebase dependency.

## Features

- Push Notifications (Android & iOS)
- In-App Messages (modal, banner, fullscreen)
- Inbox (persistent message center with read/archive)
- A/B Testing (experiments and variant assignment)
- Topic Subscriptions
- Silent Messages
- Notification Tap Handling
- Auto-reconnection with exponential backoff
- TypeScript support

## Installation

The package is published on [Abrova Center](https://center.abrova.ir). Add this line to your project's `.npmrc`:

```ini
@abrova:registry=https://center.abrova.ir/api/packages/abrova/npm/
```

Then install:

```bash
npm install @abrova/push-react-native
# or
yarn add @abrova/push-react-native
```

### Android Setup

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

#### Optional: Firebase (Android)

Android may close the Abrova connection to save battery. Adding Firebase gives a
second delivery path, so pushes still arrive. Devices where Google services are
blocked or missing keep using the Abrova connection.

1. Add `google-services.json` to `android/app/` and apply the Google services plugin.
2. Add the add-on in `android/app/build.gradle`:

```gradle
dependencies {
    implementation("ir.abrova:abrova-push-fcm:0.1.0")
}
```

3. Upload your Firebase service account in Abrova Console under Push -> Settings.

Nothing else changes: messages arriving over both paths are shown once.

### iOS Setup

Add the native Abrova Push SDK from Abrova Center to your app target in `ios/Podfile`:

```ruby
pod 'PNProtocol', :git => 'https://center.abrova.ir/abrova/pn-protocol-ios.git', :tag => '0.2.2'
pod 'AbrovaPushSDK', :git => 'https://center.abrova.ir/abrova/abrova-push-ios-sdk.git', :tag => '0.1.19'
```

```bash
cd ios && pod install
```

Enable in Xcode -> Signing & Capabilities:
- Push Notifications
- Background Modes -> Remote notifications

## Quick Start

```typescript
import AbrovaPush from '@abrova/push-react-native';

// Initialize on app start
await AbrovaPush.init({
  apiKey: 'ab_live_your_api_key',  // Get from Abrova Console
});

// Listen for messages
const unsubscribe = AbrovaPush.onMessage((message) => {
  console.log('Title:', message.title);
  console.log('Body:', message.body);
  console.log('Data:', message.data);
});

// Register device
await AbrovaPush.register({ userId: 'user_123' });

// Clean up when done
unsubscribe();
```

## Configuration

```typescript
await AbrovaPush.init({
  apiKey: 'ab_live_...',              // Required - from Abrova Console
  notificationIcon: 'ic_notification', // Optional - Android notification icon
  usePushKit: false,                   // Optional - iOS VoIP mode for calling apps
  showServiceNotification: true,       // Optional - foreground service notification (Android)
  autoRefresh: true,                   // Optional - refresh the registration on launch (24h or app/SDK/user change)
  sendDiagnostics: true,               // Optional - send counts of the SDK's own errors (no personal data)
});
```

> **Note:** Connection configuration is automatically fetched from the server using your API key. No manual setup needed.

> **iOS silent pushes:** to confirm delivery of background (`content-available`) pushes, call `AbrovaPush.shared.handleRemoteNotification(userInfo: userInfo)` from your AppDelegate's `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`. Foreground and tapped notifications are confirmed automatically.

## React Hook Example

```typescript
import { useEffect, useState } from 'react';
import AbrovaPush from '@abrova/push-react-native';

export function useAbrovaPush(userId: string) {
  const [connected, setConnected] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    const unsubMessage = AbrovaPush.onMessage((msg) => {
      console.log('Message:', msg);
    });

    const unsubConnection = AbrovaPush.onConnectionState(setConnected);
    const unsubRegistered = AbrovaPush.onRegistered(setDeviceId);

    AbrovaPush.register({ userId });

    return () => {
      unsubMessage();
      unsubConnection();
      unsubRegistered();
    };
  }, [userId]);

  return { connected, deviceId };
}
```

## Callbacks

All event handlers return an unsubscribe function for proper cleanup.

```typescript
// Receive push messages
const unsub = AbrovaPush.onMessage((message) => {
  console.log(message.title, message.body);
  console.log('Data:', message.data);
  console.log('Silent:', message.silent);
});

// Connection status
AbrovaPush.onConnectionState((connected) => {});

// Registration complete
AbrovaPush.onRegistered((deviceId) => {});

// Errors
AbrovaPush.onError((error) => {});

// Detailed errors with codes
AbrovaPush.onDetailedError((error) => {
  console.log('Code:', error.code, 'Message:', error.message);
});

// Reconnection attempts
AbrovaPush.onReconnecting((state) => {
  console.log('Attempt:', state.retryAttempt, 'Next in:', state.nextRetryMs, 'ms');
});

// Network state changes
AbrovaPush.onNetworkState((state) => {
  console.log('Available:', state.isAvailable, 'Type:', state.networkType);
});

// App foreground/background
AbrovaPush.onAppState((state) => {
  console.log('Foreground:', state.isInForeground);
});

// Notification tap handling
AbrovaPush.onNotificationAction((event) => {
  console.log('Action:', event.actionId);
});
```

## Notification Tap Handling

```typescript
// Get the message that launched the app (from notification tap)
const message = await AbrovaPush.getInitialMessage();
if (message) {
  // Navigate based on message.data
}
```

## Topics

```typescript
await AbrovaPush.subscribeTopic('news');
await AbrovaPush.subscribeTopic('promotions');
await AbrovaPush.unsubscribeTopic('promotions');
```

## User Management

```typescript
// Set user ID after login
await AbrovaPush.setUserId('user_123');

// Clear user ID on logout
await AbrovaPush.clearUserId();

// Register with user ID and metadata
await AbrovaPush.register({
  userId: 'user_123',
  metadata: { appVersion: '1.0.0', language: 'en' },
});
```

## Signed User Tokens

Optional. If your server issues Abrova user tokens, give the SDK a `tokenProvider` and every request is
sent on behalf of that signed-in user. It is the same token (and can be the same function) you pass to
Abrova Chat. Without a provider the SDK works exactly as before.

```typescript
const fetchAbrovaToken = async () => {
  const res = await myApi.post('/abrova/token'); // your server mints the token
  return res.data.token as string;
};

await AbrovaPush.init({
  apiKey: 'ab_live_your_api_key',
  tokenProvider: fetchAbrovaToken, // return null when no user is signed in
});

AbrovaPush.onAuthError((event) => {
  // token_invalid, token_required, token_expired, token_mismatch, token_provider_failed
  console.log('Auth error:', event.code);
});
```

`AbrovaPush.setTokenProvider(...)` sets or removes the provider later, and `AbrovaPush.setUserToken(token)`
hands over a token you fetched yourself.

## In-App Messages

```typescript
// Trigger in-app messages on app open
await AbrovaPush.triggerInAppOnAppOpen();

// Trigger custom event
await AbrovaPush.triggerInAppEvent('purchase_complete', { amount: 29.99 });

// Listen for in-app messages
AbrovaPush.onInAppMessageReady((message) => {
  console.log('In-app message:', message.name);
});

AbrovaPush.onInAppButtonClick((message, button) => {
  console.log('Button clicked:', button.text);
});

// Fetch, show, dismiss
const messages = await AbrovaPush.fetchInAppMessages();
await AbrovaPush.showInAppMessage(messageId);
await AbrovaPush.dismissInAppMessage();
```

## Inbox

```typescript
// Get inbox messages
const response = await AbrovaPush.getInboxMessages({
  status: InboxMessageStatus.UNREAD,
  limit: 50,
});

// Mark as read
await AbrovaPush.markInboxMessageAsRead(messageId);

// Archive
await AbrovaPush.archiveInboxMessage(messageId);

// Get unread count
const count = await AbrovaPush.getInboxUnreadCount();

// Mark all as read
await AbrovaPush.markAllInboxMessagesAsRead();
```

## A/B Testing

```typescript
// Get active tests
const tests = await AbrovaPush.getActiveABTests();

// Get variant for a test
const variant = await AbrovaPush.getABTestVariant('test_id');
if (variant) {
  console.log('Variant:', variant.variantName);
  console.log('Control:', variant.isControlGroup);
}

// Track events
await AbrovaPush.trackABTestImpression('test_id', 'variant_id');
await AbrovaPush.trackABTestClicked('test_id', 'variant_id');

// Listen for variant assignments
AbrovaPush.onABTestVariantAssigned((variant) => {
  console.log('Assigned to:', variant.variantName);
});
```

## Log Levels

```typescript
import { LogLevel } from '@abrova/push-react-native';

await AbrovaPush.setLogLevel(LogLevel.DEBUG);   // Development
await AbrovaPush.setLogLevel(LogLevel.ERROR);   // Production

// Available: NONE, ERROR, WARNING, INFO, DEBUG, VERBOSE
```

## Utilities

```typescript
const connected = await AbrovaPush.isConnected();
const deviceId = await AbrovaPush.getDeviceId();
await AbrovaPush.unregister();
AbrovaPush.removeAllListeners();
```

## Example

See the [example](example/) directory for a complete working app with all features demonstrated.

The Push SDK works independently without VoIP. To trigger VoIP incoming call UI, send push with data:

```json
{
  "type": "voip_call",
  "callerName": "John Doe",
  "callerId": "user_456",
  "callerAvatar": "https://example.com/avatar.jpg",
  "callType": "video"
}
```

The `type: "voip_call"` is the system trigger (fixed). Caller data keys are configurable via VoIP SDK config.

## Links

- [Abrova Push](https://abrova.ir/cloud/abrova-push) - Learn more about Abrova Push
- [Documentation](https://abrova.ir/cloud/abrova-push/docs/quick-start) - Full documentation and guides
- [Abrova Console](https://console.abrova.ir) - Manage your push notifications

## License

MIT License - see [LICENSE](LICENSE) for details.
