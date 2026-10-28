# Changelog

## [0.1.19] - 2026-10-28

Requires `abrova-push-android:0.1.19` and `AbrovaPushSDK ~> 0.1.18`.

### Added
- `showNotificationInForeground` in the config (default `true`): set it to `false` to receive foreground messages only through `onMessage`.
- Opened, clicked and dismissed tracking from the native Android and iOS SDKs: tapping a notification is reported as `opened`, an action button as `clicked`, a swipe-away (Android) as `dismissed`.

### Fixed
- `trackABTestConverted()` and `trackABTestConversion()` no longer fail: the native modules now implement them.
- Android: action buttons open the app on Android 12 and later (from the native SDK).

## [0.1.18] - 2026-10-14

### Added
- `sendDiagnostics` (default `true`): the SDK sends counts of its own errors, by error code, with its requests. Counts only, no personal data. Requires `abrova-push-android:0.1.18` and `AbrovaPushSDK` 0.1.17.

## [0.1.17] - 2026-10-10

### Fixed
- Android 12+: a crash when registration finished while the app was not in the foreground. Requires `abrova-push-android:0.1.17`.

## [0.1.16] - 2026-10-08

### Fixed
- Android: a crash when the connection was closed while it was still opening, for example on a device with no internet. Requires `abrova-push-android:0.1.16`.

## [0.1.15] - 2026-10-02

### Changed
- iOS: requires `AbrovaPushSDK ~> 0.1.16`, which keeps the signed user token in the Keychain instead of UserDefaults.

## [0.1.14] - 2026-10-02

### Added
- Signed user tokens (optional): `tokenProvider` in the `init()` config, `setTokenProvider()`, `setUserToken()` and `onAuthError()`. The same provider you pass to Abrova Chat works here. Without a provider nothing changes.

### Fixed
- iOS: `onNotificationTapped` is now delivered, and `getSubscriptionId()` works.

### Changed
- Requires `AbrovaPushSDK ~> 0.1.15` (iOS) and `abrova-push-android:0.1.15`.

## [0.1.13] - 2026-09-29

### Changed
- Uses native Android 0.1.14 and iOS 0.1.14: faster reconnects (retry capped at 60 s), 30 s keepalive, reconnect when the network returns or the app opens, and optional server-provided connection endpoints.
- Android: native SDK resolved from Maven Central only.

### Fixed
- iOS: the connection now reopens when the app returns from the background.

## [0.1.12] - 2026-09-18

### Added
- A reinstall no longer leaves a ghost device behind: the native SDKs send a hashed per-install
  fingerprint, so the server retires the row the previous install left active.
- Android: optional Firebase Cloud Messaging bridge (`ir.abrova:abrova-push-fcm`).

### Changed
- Requires `AbrovaPushSDK ~> 0.1.13` (iOS) and `abrova-push-android:0.1.13`.

## [0.1.11] - 2026-09-14

### Added
- `autoRefresh` on the `init()` config (default `true`): keeps a registered device up to date on launch.
- The package reports itself as `react-native` with its version (`SDK_VERSION` export).
- iOS: delivery confirmation for foreground notifications.

### Changed
- Requires `AbrovaPushSDK ~> 0.1.12` (iOS) and `abrova-push-android:0.1.12`.

### Fixed
- Android: delivery confirmations were never sent (the package used an older Android SDK).
- Podspec `source` pointed to a non-existent repository.

## [0.1.10] - 2026-08-23

### Added
- The app build number (Android `versionCode` / iOS `CFBundleVersion`) is now sent as a separate device attribute on every `register()` call. Filter on it in the dashboard's segment builder to target specific builds within the same release — useful for hotfix rollouts and staged releases.

## [0.1.9] - 2026-08-23

### Added
- Device attributes (app version, OS version, device model, language, country, timezone) are now sent automatically on every `register()` call. Use them as preset filters in the dashboard's segment builder to target specific app releases, OS versions, locales, or regions — no need to populate metadata yourself.

## [0.1.8] - 2026-08-18

### Fixed
- Android <14: crash on start (0.1.7 regression). Bumped native SDK to 0.1.8.

## [0.1.7] - 2026-08-17

### Fixed
- Android 15+: app crashed at boot (`ForegroundServiceStartNotAllowedException`). Bumped native Android SDK to 0.1.7 which switches the foreground service to `specialUse`.
