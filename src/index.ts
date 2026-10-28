/**
 * AbrovaPush React Native SDK
 * Push notifications that work everywhere - Firebase alternative
 *
 * @packageDocumentation
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { SDK_NAME, SDK_VERSION } from './version';

const LINKING_ERROR =
  `The package '@abrova/push-react-native' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go (Expo Go does not support native modules)';

const AbrovaPushNative = NativeModules.AbrovaPushReactNative
  ? NativeModules.AbrovaPushReactNative
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

// NativeEventEmitter for events from native side
const eventEmitter = new NativeEventEmitter(AbrovaPushNative);


// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for initializing AbrovaPush SDK
 *
 * Only apiKey is required. MQTT configuration is automatically
 * fetched from the server during initialization.
 */
export interface AbrovaPushConfig {
  /** Your AbrovaPush API key (starts with ab_live_) */
  apiKey: string;
  /** Android notification icon resource name (e.g., "ic_notification") */
  notificationIcon?: string;
  /** Enable PushKit VoIP for iOS (default: true for calling apps) */
  usePushKit?: boolean;
  /** Show persistent foreground service notification on Android (default: true) */
  showServiceNotification?: boolean;
  /**
   * Show notifications while the app is in the foreground (default: true).
   * Set to false to receive foreground messages only through `onMessage`.
   */
  showNotificationInForeground?: boolean;
  /**
   * iOS only. App Group shared with a Notification Service Extension, used to
   * confirm notification delivery (e.g. "group.com.example.app").
   *
   * An extension runs in its own process and cannot read the app's storage, so
   * delivery confirmation needs a shared container. Enable the same App Group
   * on both targets and pass it here. Ignored on Android, where the SDK
   * confirms delivery directly.
   */
  appGroup?: string;
  /**
   * Refresh this device's registration automatically on launch (default: true).
   *
   * Only applies to installs that registered before. The native SDK
   * re-registers in the background when 24 hours have passed or the app
   * version, SDK version or user id changed. It never prompts for permission.
   * An explicit `register()` always registers.
   */
  autoRefresh?: boolean;
  /**
   * Send counts of the SDK's own errors, by error code, with its requests
   * (default: true). Counts only, no personal data.
   */
  sendDiagnostics?: boolean;
  /**
   * Returns the signed user token for the signed-in user, or null when no
   * user is signed in (optional). The same function you pass to Abrova Chat
   * works here. Can also be set later with `setTokenProvider()`.
   */
  tokenProvider?: TokenProvider;
}

/**
 * Returns the Abrova user token for the signed-in user, issued by your
 * server, or null when no user is signed in.
 */
export type TokenProvider = () => Promise<string | null | undefined>;

/**
 * The server refused the user's identity, or the token provider failed.
 * Typically: send the user to login.
 *
 * Informational: the request's own error callback is still called as before.
 */
export interface AuthErrorEvent {
  /**
   * `token_invalid`, `token_required`, `token_expired` (after a failed
   * refresh), `token_mismatch` (the user id given to the SDK is not the
   * token's user) or `token_provider_failed`.
   */
  code: string;
  message: string;
  /** What the token provider threw, when `code` is `token_provider_failed`. */
  error?: unknown;
}

/**
 * Action button for notifications
 */
export interface NotificationAction {
  /** Unique action identifier */
  id: string;
  /** Button text */
  title: string;
  /** Deep link or action identifier */
  action?: string;
  /** Icon name (Android) */
  icon?: string;
  /** Show as destructive/red (iOS) */
  destructive?: boolean;
  /** Requires device unlock (iOS) */
  authRequired?: boolean;
}

/**
 * Localized content for notifications
 */
export interface LocalizedContent {
  /** Locale code (e.g., 'en', 'fa', 'de') */
  locale: string;
  /** Localized title */
  title: string;
  /** Localized body */
  body: string;
}

/**
 * Push notification message with rich notification support
 */
export interface AbrovaPushMessage {
  /** Notification title */
  title: string;
  /** Notification body */
  body: string;
  /** Custom data payload */
  data?: Record<string, any>;
  /** If true, message was delivered silently without notification */
  silent?: boolean;

  // === Rich Notification Fields ===

  /** Large image URL to display in notification */
  imageUrl?: string;
  /** Small icon URL (Android) */
  iconUrl?: string;
  /** Action buttons (max 3) */
  actions?: NotificationAction[];
  /** Deep link URL to open when notification is tapped */
  deepLink?: string;
  /** Badge count to set on app icon */
  badge?: number;
  /** Badge action type: 'set', 'increment', 'decrement', 'clear' */
  badgeAction?: 'set' | 'increment' | 'decrement' | 'clear';
  /** Sound file name or 'default' */
  sound?: string;
  /** Thread ID for grouping notifications (iOS) */
  threadId?: string;
  /** Collapse key - replaces previous notification with same key (Android) */
  collapseKey?: string;
  /** iOS notification category for action buttons */
  category?: string;
  /** Notification priority: 'default', 'high', 'low' */
  priority?: 'default' | 'high' | 'low';
  /** Time to live in seconds */
  ttl?: number;
  /** Localized versions of title and body */
  localizations?: LocalizedContent[];
  /** IANA timezone for device-local delivery */
  timezone?: string;
  /** Message ID for tracking */
  messageId?: string;
  /** Campaign ID for analytics */
  campaignId?: string;
}

/**
 * Get the localized title for the given locale
 */
export function getLocalizedTitle(message: AbrovaPushMessage, locale: string): string {
  if (!message.localizations) return message.title;
  const localized = message.localizations.find(l => l.locale === locale);
  return localized?.title ?? message.title;
}

/**
 * Get the localized body for the given locale
 */
export function getLocalizedBody(message: AbrovaPushMessage, locale: string): string {
  if (!message.localizations) return message.body;
  const localized = message.localizations.find(l => l.locale === locale);
  return localized?.body ?? message.body;
}

/**
 * Error from AbrovaPush SDK
 */
export interface AbrovaPushError {
  /** Error code for programmatic handling */
  code: number;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: string;
}

/**
 * Reconnection state during auto-retry
 */
export interface ReconnectionState {
  /** Current retry attempt number */
  retryAttempt: number;
  /** Time until next retry in milliseconds */
  nextRetryMs: number;
}

/**
 * Network state information
 */
export interface NetworkState {
  /** Whether network is available */
  isAvailable: boolean;
  /** Type of network connection */
  networkType: 'wifi' | 'cellular' | 'ethernet' | 'unknown' | 'none';
}

/**
 * App state information
 */
export interface AppState {
  /** Whether app is in foreground */
  isInForeground: boolean;
}

/**
 * App update information
 */
export interface AppUpdateInfo {
  /** Previous app version */
  previousVersion: string;
  /** Current app version */
  currentVersion: string;
  /** Whether re-registration is needed */
  needsReregistration: boolean;
}

/**
 * Event fired when a notification action button is tapped
 */
export interface NotificationActionEvent {
  /** The action ID that was tapped */
  actionId: string;
  /** The notification title */
  title?: string;
  /** The notification body */
  body?: string;
  /** Custom data payload from the notification */
  data?: Record<string, any>;
  /** Message ID for tracking */
  messageId?: string;
}

/**
 * Log levels for SDK logging
 */
export enum LogLevel {
  /** No logging */
  NONE = 'none',
  /** Only errors */
  ERROR = 'error',
  /** Errors and warnings */
  WARNING = 'warning',
  /** Errors, warnings, and info */
  INFO = 'info',
  /** All messages including debug */
  DEBUG = 'debug',
  /** Everything including traces */
  VERBOSE = 'verbose',
}

// ============================================================================
// In-App Message Types
// ============================================================================

// ============================================================================
// Inbox Message Types
// ============================================================================

/**
 * Status of an inbox message
 */
export enum InboxMessageStatus {
  UNREAD = 'unread',
  READ = 'read',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

/**
 * Inbox message content
 */
export interface InboxContent {
  /** Message title */
  title: string;
  /** Message body */
  body: string;
  /** Image URL to display */
  imageUrl?: string;
  /** Icon URL */
  iconUrl?: string;
  /** Deep link URL */
  deepLink?: string;
  /** Custom data payload */
  data?: Record<string, any>;
}

/**
 * Inbox message
 */
export interface InboxMessage {
  /** Unique message identifier */
  id: string;
  /** User ID */
  userId?: string;
  /** Device ID */
  deviceId?: string;
  /** Message content */
  content: InboxContent;
  /** Message status */
  status: InboxMessageStatus;
  /** Message category */
  category?: string;
  /** Expiration date */
  expiresAt?: string;
  /** When the message was read */
  readAt?: string;
  /** When the message was created */
  createdAt: string;
  /** When the message was last updated */
  updatedAt?: string;
}

/**
 * Response from getInboxMessages
 */
export interface InboxMessagesResponse {
  /** List of messages */
  messages: InboxMessage[];
  /** Total number of messages */
  total: number;
  /** Number of unread messages */
  unreadCount: number;
}

/**
 * Filter options for fetching inbox messages
 */
export interface InboxFilter {
  /** Filter by status */
  status?: InboxMessageStatus;
  /** Filter by category */
  category?: string;
  /** Maximum number of messages to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ============================================================================
// A/B Testing Types
// ============================================================================

/**
 * A/B test variant assignment
 */
export interface ABTestVariant {
  /** A/B test ID */
  testId: string;
  /** Variant ID */
  variantId: string;
  /** Variant name */
  variantName: string;
  /** Whether this is a control group (no message sent) */
  isControlGroup: boolean;
  /** Optional variant content */
  content?: ABTestContent;
}

/**
 * Content for an A/B test variant
 */
export interface ABTestContent {
  /** Content title */
  title?: string;
  /** Content body */
  body?: string;
  /** Image URL */
  imageUrl?: string;
  /** Deep link URL */
  deepLink?: string;
  /** Custom data payload */
  data?: Record<string, any>;
  /** Action buttons */
  actions?: ABTestAction[];
}

/**
 * Action button for an A/B test variant
 */
export interface ABTestAction {
  /** Action ID */
  id: string;
  /** Action title/label */
  title: string;
  /** Action to perform */
  action: string;
}

/**
 * Summary of an active A/B test
 */
export interface ABTestSummary {
  /** Test ID */
  id: string;
  /** Test name */
  name: string;
  /** Number of variants */
  variantCount: number;
  /** Whether test has a control group */
  hasControlGroup: boolean;
}

/**
 * A/B test tracking event types
 */
export enum ABTestEvent {
  IMPRESSION = 'impression',
  OPENED = 'opened',
  CLICKED = 'clicked',
  CONVERTED = 'converted',
}

/**
 * Statistical results for an A/B test
 */
export interface ABTestStatistics {
  /** Whether results are statistically significant */
  isSignificant: boolean;
  /** Confidence level (0.90, 0.95, 0.99) */
  confidenceLevel: number;
  /** P-value for significance test */
  pValue: number;
  /** Percentage lift of winner vs control */
  lift: number;
  /** Recommended sample size for statistical power */
  sampleSizeRecommendation?: number;
}

/**
 * Confidence interval for a metric
 */
export interface ConfidenceInterval {
  /** Lower bound */
  lower: number;
  /** Upper bound */
  upper: number;
}

/**
 * Variant statistics with confidence intervals
 */
export interface ABTestVariantStats {
  /** Variant ID */
  id: string;
  /** Variant name */
  name: string;
  /** Whether this is the control group */
  isControlGroup: boolean;
  /** Traffic percentage allocated to this variant */
  trafficPercentage: number;
  /** Number of messages sent */
  sentCount: number;
  /** Number of messages delivered */
  deliveredCount: number;
  /** Number of messages opened */
  openedCount: number;
  /** Number of clicks */
  clickedCount: number;
  /** Number of conversions */
  convertedCount: number;
  /** Number of failures */
  failedCount: number;
  /** Delivery rate percentage */
  deliveryRate: number;
  /** Open rate percentage */
  openRate: number;
  /** Click rate percentage */
  clickRate: number;
  /** Conversion rate percentage */
  conversionRate: number;
  /** Confidence interval for the metric */
  confidenceInterval?: ConfidenceInterval;
  /** Improvement percentage vs control */
  improvementVsControl?: number;
  /** Whether difference from control is significant */
  isSignificantVsControl?: boolean;
  /** P-value vs control */
  pValueVsControl?: number;
}

// ============================================================================
// In-App Message Types
// ============================================================================

/**
 * In-App Message display types
 */
export enum InAppMessageType {
  MODAL = 'modal',
  BANNER = 'banner',
  FULLSCREEN = 'fullscreen',
  CARD = 'card',
}

/**
 * In-App Message trigger types
 */
export enum InAppTriggerType {
  ON_APP_OPEN = 'on_app_open',
  ON_EVENT = 'on_event',
  ON_SESSION_START = 'on_session_start',
  SCHEDULED = 'scheduled',
  MANUAL = 'manual',
}

/**
 * In-App button styles
 */
export enum InAppButtonStyle {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
  TEXT = 'text',
  DESTRUCTIVE = 'destructive',
}

/**
 * In-App button action types
 */
export enum InAppButtonAction {
  DISMISS = 'dismiss',
  DEEP_LINK = 'deep_link',
  URL = 'url',
  CUSTOM = 'custom',
}

/**
 * In-App message button
 */
export interface InAppButton {
  /** Unique button identifier */
  id: string;
  /** Button text */
  text: string;
  /** Action to perform when clicked */
  action: InAppButtonAction;
  /** Value for the action (URL, deep link, or custom identifier) */
  value?: string;
  /** Button style */
  style: InAppButtonStyle;
}

/**
 * In-App message content
 */
export interface InAppMessageContent {
  /** Message title */
  title: string;
  /** Message body */
  body: string;
  /** Image URL to display */
  imageUrl?: string;
  /** Background color (hex) */
  backgroundColor?: string;
  /** Text color (hex) */
  textColor?: string;
  /** Action buttons */
  buttons: InAppButton[];
}

/**
 * In-App message
 */
export interface InAppMessage {
  /** Unique message identifier */
  id: string;
  /** Message name (for reference) */
  name: string;
  /** Display type */
  type: InAppMessageType;
  /** Message content */
  content: InAppMessageContent;
  /** Trigger type */
  triggerType: InAppTriggerType;
  /** Event name (for ON_EVENT trigger) */
  triggerEvent?: string;
  /** Start date (timestamp) */
  startDate?: number;
  /** End date (timestamp) */
  endDate?: number;
  /** Maximum number of times to show */
  maxImpressions: number;
  /** Minimum session count before showing */
  minSessionCount: number;
  /** Delay in seconds before showing */
  delaySeconds: number;
  /** Priority (higher = more important) */
  priority: number;
}

// ============================================================================
// Callback Types
// ============================================================================

export type OnMessageCallback = (message: AbrovaPushMessage) => void;
export type OnConnectionStateCallback = (connected: boolean) => void;
export type OnRegisteredCallback = (deviceId: string) => void;
export type OnErrorCallback = (error: string) => void;
export type OnDetailedErrorCallback = (error: AbrovaPushError) => void;
export type OnReconnectingCallback = (state: ReconnectionState) => void;
export type OnNetworkStateCallback = (state: NetworkState) => void;
export type OnAppStateCallback = (state: AppState) => void;
export type OnAppUpdatedCallback = (info: AppUpdateInfo) => void;
export type OnNotificationTappedCallback = (message: AbrovaPushMessage) => void;
export type OnAuthErrorCallback = (event: AuthErrorEvent) => void;

// In-App Message Callbacks
export type OnInAppMessageReadyCallback = (message: InAppMessage) => void;
export type OnInAppButtonClickCallback = (message: InAppMessage, button: InAppButton) => void;
export type OnInAppMessageDismissedCallback = (message: InAppMessage) => void;

// Notification Action Callback
export type OnNotificationActionCallback = (event: NotificationActionEvent) => void;

// A/B Testing Callbacks
export type OnABTestVariantAssignedCallback = (variant: ABTestVariant) => void;
export type OnABTestErrorCallback = (testId: string, error: string) => void;

// ============================================================================
// Event Subscriptions Storage
// ============================================================================

type EventSubscription = { remove: () => void };

const subscriptions: Map<string, EventSubscription> = new Map();

// ============================================================================
// AbrovaPush Class
// ============================================================================

/**
 * AbrovaPush SDK - Push notifications that work everywhere
 *
 * @example
 * ```typescript
 * import AbrovaPushSDK from '@abrova/push-react-native';
 *
 * // Initialize - only API key is required
 * await AbrovaPush.init({
 *   apiKey: 'ab_live_your_api_key',
 * });
 *
 * // Set up callbacks
 * AbrovaPush.onMessage((message) => {
 *   console.log('Received:', message.title);
 * });
 *
 * // Register device
 * await AbrovaPush.register({ userId: 'user123' });
 * ```
 */
class AbrovaPush {
  private initialized = false;

  /** The app's token provider, asked by the native SDK through `getUserToken`. */
  private tokenProvider: TokenProvider | null = null;
  private tokenRequestSubscription: EventSubscription | null = null;
  /** What the provider last threw, attached to the auth error that follows. */
  private tokenProviderError: unknown = undefined;

  /**
   * Initialize the AbrovaPush SDK
   * Must be called before any other method
   */
  async init(config: AbrovaPushConfig): Promise<void> {
    if (this.initialized) {
      console.warn('[AbrovaPush] Already initialized');
      return;
    }

    const nativeConfig = {
      apiKey: config.apiKey,
      notificationIcon: config.notificationIcon ?? null,
      usePushKit: config.usePushKit ?? true,
      showServiceNotification: config.showServiceNotification ?? true,
      showNotificationInForeground: config.showNotificationInForeground ?? true,
      appGroup: config.appGroup ?? null,
      autoRefresh: config.autoRefresh ?? true,
      sendDiagnostics: config.sendDiagnostics ?? true,
      wrapperSdkName: SDK_NAME,
      wrapperSdkVersion: SDK_VERSION,
    };

    // Before init, so the first registration already carries the token.
    if (config.tokenProvider) {
      await this.setTokenProvider(config.tokenProvider);
    }

    await AbrovaPushNative.init(nativeConfig);
    this.initialized = true;
  }

  /**
   * Register device for push notifications
   * @param options.userId - Optional user identifier to associate with device
   * @param options.metadata - Optional metadata dictionary
   */
  async register(options?: {
    userId?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.register(options?.userId ?? null, options?.metadata ?? null);
  }

  /**
   * Unregister device and stop push service
   */
  async unregister(): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.unregister();
  }

  /**
   * Subscribe to a topic to receive targeted messages
   * @param topic - Topic name to subscribe to
   */
  async subscribeTopic(topic: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.subscribeTopic(topic);
  }

  /**
   * Unsubscribe from a topic
   * @param topic - Topic name to unsubscribe from
   */
  async unsubscribeTopic(topic: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.unsubscribeTopic(topic);
  }

  /**
   * Check if MQTT connection is active
   */
  async isConnected(): Promise<boolean> {
    this.checkInitialized();
    return await AbrovaPushNative.isConnected();
  }

  /**
   * Get current device ID
   */
  async getDeviceId(): Promise<string | null> {
    this.checkInitialized();
    return await AbrovaPushNative.getDeviceId();
  }

  /**
   * Get the per-install subscription ID issued by the server during registration.
   * This is the canonical addressing key for inbox / A-B / in-app calls and the
   * new MQTT topic. Returns `null` until registration succeeds at least once.
   */
  async getSubscriptionId(): Promise<string | null> {
    this.checkInitialized();
    return await AbrovaPushNative.getSubscriptionId();
  }

  /**
   * Set or update user ID for current device
   * Call this after user login to associate device with user
   */
  async setUserId(userId: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.setUserId(userId);
  }

  /**
   * Clear user ID (call on logout)
   */
  async clearUserId(): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.clearUserId();
  }

  // ==========================================================================
  // Signed User Tokens
  // ==========================================================================

  /**
   * Set, replace or remove (null) the signed user token provider.
   * Same as `tokenProvider` in the `init()` config; may be called before `init()`.
   *
   * The provider is asked whenever the SDK needs a fresh token. If it throws
   * or does not answer within 10 seconds, the request is sent without a token
   * and `onAuthError` reports `token_provider_failed`.
   */
  async setTokenProvider(provider: TokenProvider | null): Promise<void> {
    this.tokenProvider = provider;
    this.tokenProviderError = undefined;

    if (provider && !this.tokenRequestSubscription) {
      this.tokenRequestSubscription = eventEmitter.addListener('getUserToken', (data: any) => {
        this.answerTokenRequest(data?.requestId);
      });
    } else if (!provider && this.tokenRequestSubscription) {
      this.tokenRequestSubscription.remove();
      this.tokenRequestSubscription = null;
    }

    await AbrovaPushNative.setTokenProvider(provider != null);
  }

  /**
   * Hand the SDK a signed user token you fetched yourself (null forgets it).
   *
   * Without a token provider the SDK cannot renew it: call this again
   * whenever you refresh the token.
   */
  async setUserToken(token: string | null): Promise<void> {
    await AbrovaPushNative.setUserToken(token ? token : null);
  }

  /**
   * Set callback for identity errors: the server refused the user token, or
   * the token provider failed. Typically: send the user to login.
   */
  onAuthError(callback: OnAuthErrorCallback): () => void {
    return this.addEventListener('onAuthError', (data: any) => {
      const code = data?.code || '';
      const event: AuthErrorEvent = {
        code,
        message: data?.message || 'Authentication failed',
      };
      if (code === 'token_provider_failed' && this.tokenProviderError !== undefined) {
        event.error = this.tokenProviderError;
        this.tokenProviderError = undefined;
      }
      callback(event);
    });
  }

  /** Answers the native SDK's request for a user token. */
  private async answerTokenRequest(requestId: string): Promise<void> {
    if (!requestId) return;
    const provider = this.tokenProvider;
    if (!provider) {
      // Not "signed out": the native SDK keeps the token it already has.
      AbrovaPushNative.answerUserToken(requestId, null, 'No tokenProvider set');
      return;
    }
    let token: string | null | undefined;
    try {
      token = await provider();
    } catch (e) {
      this.tokenProviderError = e;
      AbrovaPushNative.answerUserToken(requestId, null, `tokenProvider failed: ${e}`);
      return;
    }
    AbrovaPushNative.answerUserToken(requestId, token ? token : null, null);
  }

  /**
   * Get the message that launched the app (from notification tap)
   * Returns null if app was not launched from notification
   */
  async getInitialMessage(): Promise<AbrovaPushMessage | null> {
    this.checkInitialized();
    const message = await AbrovaPushNative.getInitialMessage();
    return message ? this.parseMessage(message) : null;
  }

  /**
   * Set log level for native SDK logging
   * @param level - Log level to set
   */
  async setLogLevel(level: LogLevel): Promise<void> {
    await AbrovaPushNative.setLogLevel(level);
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================

  /**
   * Set callback for receiving push messages
   */
  onMessage(callback: OnMessageCallback): () => void {
    return this.addEventListener('onMessage', (data: any) => {
      callback(this.parseMessage(data));
    });
  }

  /**
   * Set callback for connection state changes
   */
  onConnectionState(callback: OnConnectionStateCallback): () => void {
    return this.addEventListener('onConnectionState', callback);
  }

  /**
   * Set callback for registration success
   */
  onRegistered(callback: OnRegisteredCallback): () => void {
    return this.addEventListener('onRegistered', callback);
  }

  /**
   * Set callback for errors
   */
  onError(callback: OnErrorCallback): () => void {
    return this.addEventListener('onError', callback);
  }

  /**
   * Set callback for detailed errors with codes
   */
  onDetailedError(callback: OnDetailedErrorCallback): () => void {
    return this.addEventListener('onDetailedError', (data: any) => {
      callback({
        code: data.code,
        message: data.message,
        details: data.details,
      });
    });
  }

  /**
   * Set callback for reconnection state changes
   */
  onReconnecting(callback: OnReconnectingCallback): () => void {
    return this.addEventListener('onReconnecting', (data: any) => {
      callback({
        retryAttempt: data.retryAttempt,
        nextRetryMs: data.nextRetryMs,
      });
    });
  }

  /**
   * Set callback for network state changes
   */
  onNetworkState(callback: OnNetworkStateCallback): () => void {
    return this.addEventListener('onNetworkState', (data: any) => {
      callback({
        isAvailable: data.isAvailable,
        networkType: data.networkType,
      });
    });
  }

  /**
   * Set callback for app state changes (foreground/background)
   */
  onAppState(callback: OnAppStateCallback): () => void {
    return this.addEventListener('onAppState', (data: any) => {
      callback({
        isInForeground: data.isInForeground,
      });
    });
  }

  /**
   * Set callback for notification taps. Fires when the user taps a
   * notification from the system tray / status-bar shade and the app comes
   * to the foreground. For cold-start taps use {@link getInitialMessage}
   * (the SDK persists the tapped message until it is read once).
   */
  onNotificationTapped(callback: OnNotificationTappedCallback): () => void {
    return this.addEventListener('onNotificationTapped', (data: any) => {
      callback(this.parseMessage(data));
    });
  }

  /**
   * Set callback for app update detection
   */
  onAppUpdated(callback: OnAppUpdatedCallback): () => void {
    return this.addEventListener('onAppUpdated', (data: any) => {
      callback({
        previousVersion: data.previousVersion,
        currentVersion: data.currentVersion,
        needsReregistration: data.needsReregistration,
      });
    });
  }

  /**
   * Set callback for notification action button taps
   * Called when user taps an action button on a notification.
   *
   * @example
   * ```typescript
   * AbrovaPush.onNotificationAction((event) => {
   *   console.log('Action tapped:', event.actionId);
   *   if (event.actionId === 'view') {
   *     navigation.navigate('Product', { id: event.data?.productId });
   *   }
   * });
   * ```
   */
  onNotificationAction(callback: OnNotificationActionCallback): () => void {
    return this.addEventListener('onNotificationAction', (data: any) => {
      callback({
        actionId: data.actionId || '',
        title: data.title,
        body: data.body,
        data: data.data,
        messageId: data.messageId,
      });
    });
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    subscriptions.forEach((sub) => sub.remove());
    subscriptions.clear();
  }

  // ==========================================================================
  // In-App Messages
  // ==========================================================================

  /**
   * Fetch in-app messages from the server
   * @returns List of available in-app messages
   */
  async fetchInAppMessages(): Promise<InAppMessage[]> {
    this.checkInitialized();
    const messages = await AbrovaPushNative.fetchInAppMessages();
    return messages.map((msg: any) => this.parseInAppMessage(msg));
  }

  /**
   * Trigger in-app messages for app open event
   * Call this when your app becomes active
   */
  async triggerInAppOnAppOpen(): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.triggerInAppOnAppOpen();
  }

  /**
   * Trigger in-app messages for a custom event
   * @param eventName - Name of the event
   * @param properties - Optional properties for the event
   */
  async triggerInAppEvent(eventName: string, properties?: Record<string, any>): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.triggerInAppEvent(eventName, properties ?? null);
  }

  /**
   * Trigger in-app messages for session start
   * Call this when a new session begins
   */
  async triggerInAppOnSessionStart(): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.triggerInAppOnSessionStart();
  }

  /**
   * Show a specific in-app message by ID
   * @param messageId - ID of the message to show
   */
  async showInAppMessage(messageId: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.showInAppMessage(messageId);
  }

  /**
   * Dismiss the currently displayed in-app message
   */
  async dismissInAppMessage(): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.dismissInAppMessage();
  }

  /**
   * Set callback for when an in-app message is ready to be displayed
   */
  onInAppMessageReady(callback: OnInAppMessageReadyCallback): () => void {
    return this.addEventListener('onInAppMessageReady', (data: any) => {
      callback(this.parseInAppMessage(data));
    });
  }

  /**
   * Set callback for when an in-app message button is clicked
   */
  onInAppButtonClick(callback: OnInAppButtonClickCallback): () => void {
    return this.addEventListener('onInAppButtonClick', (data: any) => {
      const message = this.parseInAppMessage(data.message);
      const button = this.parseInAppButton(data.button);
      callback(message, button);
    });
  }

  /**
   * Set callback for when an in-app message is dismissed
   */
  onInAppMessageDismissed(callback: OnInAppMessageDismissedCallback): () => void {
    return this.addEventListener('onInAppMessageDismissed', (data: any) => {
      callback(this.parseInAppMessage(data));
    });
  }

  // ==========================================================================
  // Inbox
  // ==========================================================================

  /**
   * Get inbox messages with optional filters
   * @param filter - Optional filter options
   * @returns Promise with messages response
   */
  async getInboxMessages(filter?: InboxFilter): Promise<InboxMessagesResponse> {
    this.checkInitialized();
    const result = await AbrovaPushNative.getInboxMessages(filter ?? null);
    return {
      messages: (result.messages || []).map((msg: any) => this.parseInboxMessage(msg)),
      total: result.total || 0,
      unreadCount: result.unreadCount || 0,
    };
  }

  /**
   * Get a single inbox message by ID
   * @param messageId - ID of the message to get
   */
  async getInboxMessage(messageId: string): Promise<InboxMessage | null> {
    this.checkInitialized();
    const result = await AbrovaPushNative.getInboxMessage(messageId);
    return result ? this.parseInboxMessage(result) : null;
  }

  /**
   * Mark an inbox message as read
   * @param messageId - ID of the message to mark as read
   */
  async markInboxMessageAsRead(messageId: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.markInboxMessageAsRead(messageId);
  }

  /**
   * Archive an inbox message
   * @param messageId - ID of the message to archive
   */
  async archiveInboxMessage(messageId: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.archiveInboxMessage(messageId);
  }

  /**
   * Delete an inbox message
   * @param messageId - ID of the message to delete
   */
  async deleteInboxMessage(messageId: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.deleteInboxMessage(messageId);
  }

  /**
   * Mark multiple inbox messages with a status
   * @param messageIds - IDs of messages to mark
   * @param status - Status to set
   */
  async markMultipleInboxMessages(
    messageIds: string[],
    status: InboxMessageStatus
  ): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.markMultipleInboxMessages(messageIds, status);
  }

  /**
   * Mark all inbox messages as read
   */
  async markAllInboxMessagesAsRead(): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.markAllInboxMessagesAsRead();
  }

  /**
   * Get unread inbox count (from cache)
   */
  async getInboxUnreadCount(): Promise<number> {
    this.checkInitialized();
    return await AbrovaPushNative.getInboxUnreadCount();
  }

  /**
   * Fetch unread inbox count from server
   */
  async fetchInboxUnreadCount(): Promise<number> {
    this.checkInitialized();
    return await AbrovaPushNative.fetchInboxUnreadCount();
  }

  /**
   * Get cached inbox messages without network call
   */
  async getCachedInboxMessages(): Promise<InboxMessage[]> {
    this.checkInitialized();
    const result = await AbrovaPushNative.getCachedInboxMessages();
    return (result || []).map((msg: any) => this.parseInboxMessage(msg));
  }

  /**
   * Clear inbox cache
   */
  async clearInboxCache(): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.clearInboxCache();
  }

  // ==========================================================================
  // A/B Testing
  // ==========================================================================

  /**
   * Get active A/B tests for the app
   * @returns List of active A/B tests
   */
  async getActiveABTests(): Promise<ABTestSummary[]> {
    this.checkInitialized();
    const tests = await AbrovaPushNative.getActiveABTests();
    return (tests || []).map((test: any) => this.parseABTestSummary(test));
  }

  /**
   * Get variant assignment for a specific A/B test
   * @param testId - A/B test ID
   * @param forceRefresh - Force fetch from server (default: false)
   * @returns Assigned variant or null
   */
  async getABTestVariant(testId: string, forceRefresh: boolean = false): Promise<ABTestVariant | null> {
    this.checkInitialized();
    const variant = await AbrovaPushNative.getABTestVariant(testId, forceRefresh);
    return variant ? this.parseABTestVariant(variant) : null;
  }

  /**
   * Get cached variant for an A/B test (no network call)
   * @param testId - A/B test ID
   * @returns Cached variant or null
   */
  async getCachedABTestVariant(testId: string): Promise<ABTestVariant | null> {
    this.checkInitialized();
    const variant = await AbrovaPushNative.getCachedABTestVariant(testId);
    return variant ? this.parseABTestVariant(variant) : null;
  }

  /**
   * Track A/B test impression
   * @param testId - A/B test ID
   * @param variantId - Variant ID that was shown
   */
  async trackABTestImpression(testId: string, variantId: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.trackABTestImpression(testId, variantId);
  }

  /**
   * Track A/B test opened
   * @param testId - A/B test ID
   * @param variantId - Variant ID that was viewed
   */
  async trackABTestOpened(testId: string, variantId: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.trackABTestOpened(testId, variantId);
  }

  /**
   * Track A/B test clicked
   * @param testId - A/B test ID
   * @param variantId - Variant ID where CTA was clicked
   */
  async trackABTestClicked(testId: string, variantId: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.trackABTestClicked(testId, variantId);
  }

  /**
   * Track display of an A/B test variant (impression + opened)
   * @param variant - Variant that was displayed
   */
  async trackABTestDisplay(variant: ABTestVariant): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.trackABTestDisplay(variant.testId, variant.variantId);
  }

  /**
   * Track A/B test conversion (user completed desired action)
   * @param testId - A/B test ID
   * @param variantId - Variant ID where conversion happened
   */
  async trackABTestConverted(testId: string, variantId: string): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.trackABTestConverted(testId, variantId);
  }

  /**
   * Track conversion using cached variant
   * @param testId - A/B test ID
   */
  async trackABTestConversion(testId: string): Promise<void> {
    this.checkInitialized();
    const variant = await this.getCachedABTestVariant(testId);
    if (variant) {
      await this.trackABTestConverted(testId, variant.variantId);
    } else {
      throw new Error(`No cached variant found for test ${testId}`);
    }
  }

  /**
   * Check if device is in control group for a test
   * @param testId - A/B test ID
   * @returns True if device is in control group
   */
  async isInControlGroup(testId: string): Promise<boolean> {
    this.checkInitialized();
    const variant = await this.getCachedABTestVariant(testId);
    return variant?.isControlGroup ?? false;
  }

  /**
   * Clear A/B test cache
   */
  async clearABTestCache(): Promise<void> {
    this.checkInitialized();
    await AbrovaPushNative.clearABTestCache();
  }

  /**
   * Set callback for A/B test variant assignment
   */
  onABTestVariantAssigned(callback: OnABTestVariantAssignedCallback): () => void {
    return this.addEventListener('onABTestVariantAssigned', (data: any) => {
      callback(this.parseABTestVariant(data));
    });
  }

  /**
   * Set callback for A/B test errors
   */
  onABTestError(callback: OnABTestErrorCallback): () => void {
    return this.addEventListener('onABTestError', (data: any) => {
      callback(data.testId || '', data.error || 'Unknown error');
    });
  }

  // ==========================================================================
  // Service Notification
  // ==========================================================================

  /**
   * Check if the service notification is currently hidden.
   * Returns true if the user has disabled the notification channel.
   * On Android 8.0+, users can disable individual notification channels.
   * When the push service channel is disabled, the notification disappears
   * but the foreground service keeps running.
   */
  async isServiceNotificationHidden(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    return await AbrovaPushNative.isServiceNotificationHidden();
  }

  /**
   * Open system settings for the push service notification channel.
   * The user can toggle the channel off to hide the persistent notification
   * while keeping the push service alive in the background.
   * Only works on Android 8.0+ (API 26+). No-op on iOS.
   */
  async openServiceNotificationSettings(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await AbrovaPushNative.openServiceNotificationSettings();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private checkInitialized(): void {
    if (!this.initialized) {
      throw new Error('[AbrovaPush] SDK not initialized. Call AbrovaPush.init() first.');
    }
  }

  private addEventListener(event: string, callback: (data: any) => void): () => void {
    // Remove existing subscription for this event
    const existing = subscriptions.get(event);
    if (existing) {
      existing.remove();
    }

    // Add new subscription
    const subscription = eventEmitter.addListener(event, callback);
    subscriptions.set(event, subscription);

    // Return unsubscribe function
    return () => {
      subscription.remove();
      subscriptions.delete(event);
    };
  }

  private parseMessage(data: any): AbrovaPushMessage {
    return {
      title: data.title || '',
      body: data.body || '',
      data: data.data || undefined,
      silent: data.silent || false,
      imageUrl: data.imageUrl,
      iconUrl: data.iconUrl,
      deepLink: data.deepLink,
      badge: data.badge,
      badgeAction: data.badgeAction,
      sound: data.sound,
      threadId: data.threadId,
      collapseKey: data.collapseKey,
      category: data.category,
      priority: data.priority,
      ttl: data.ttl,
      messageId: data.messageId,
      campaignId: data.campaignId,
      actions: data.actions,
      localizations: data.localizations,
    };
  }

  private parseInAppMessage(data: any): InAppMessage {
    return {
      id: data.id || '',
      name: data.name || '',
      type: data.type as InAppMessageType || InAppMessageType.MODAL,
      content: this.parseInAppContent(data.content),
      triggerType: data.triggerType as InAppTriggerType || InAppTriggerType.ON_APP_OPEN,
      triggerEvent: data.triggerEvent,
      startDate: data.startDate,
      endDate: data.endDate,
      maxImpressions: data.maxImpressions || 1,
      minSessionCount: data.minSessionCount || 0,
      delaySeconds: data.delaySeconds || 0,
      priority: data.priority || 0,
    };
  }

  private parseInAppContent(data: any): InAppMessageContent {
    return {
      title: data?.title || '',
      body: data?.body || '',
      imageUrl: data?.imageUrl,
      backgroundColor: data?.backgroundColor,
      textColor: data?.textColor,
      buttons: (data?.buttons || []).map((btn: any) => this.parseInAppButton(btn)),
    };
  }

  private parseInAppButton(data: any): InAppButton {
    return {
      id: data.id || '',
      text: data.text || '',
      action: data.action as InAppButtonAction || InAppButtonAction.DISMISS,
      value: data.value,
      style: data.style as InAppButtonStyle || InAppButtonStyle.PRIMARY,
    };
  }

  private parseInboxMessage(data: any): InboxMessage {
    return {
      id: data.id || '',
      userId: data.userId,
      deviceId: data.deviceId,
      content: {
        title: data.content?.title || '',
        body: data.content?.body || '',
        imageUrl: data.content?.imageUrl,
        iconUrl: data.content?.iconUrl,
        deepLink: data.content?.deepLink,
        data: data.content?.data,
      },
      status: (data.status as InboxMessageStatus) || InboxMessageStatus.UNREAD,
      category: data.category,
      expiresAt: data.expiresAt,
      readAt: data.readAt,
      createdAt: data.createdAt || '',
      updatedAt: data.updatedAt,
    };
  }

  private parseABTestSummary(data: any): ABTestSummary {
    return {
      id: data.id || '',
      name: data.name || '',
      variantCount: data.variantCount || 0,
      hasControlGroup: data.hasControlGroup || false,
    };
  }

  private parseABTestVariant(data: any): ABTestVariant {
    return {
      testId: data.testId || '',
      variantId: data.variantId || '',
      variantName: data.variantName || '',
      isControlGroup: data.isControlGroup || false,
      content: data.content ? this.parseABTestContent(data.content) : undefined,
    };
  }

  private parseABTestContent(data: any): ABTestContent {
    return {
      title: data.title,
      body: data.body,
      imageUrl: data.imageUrl,
      deepLink: data.deepLink,
      data: data.data,
      actions: data.actions?.map((action: any) => this.parseABTestAction(action)),
    };
  }

  private parseABTestAction(data: any): ABTestAction {
    return {
      id: data.id || '',
      title: data.title || '',
      action: data.action || '',
    };
  }
}

// Export singleton instance
/** Version of this package, reported to the server as the SDK version. */
export { SDK_VERSION };

export default new AbrovaPush();

// Also export the class for testing
export { AbrovaPush };
