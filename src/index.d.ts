/**
 * AbrovaPush React Native SDK
 * Push notifications that work everywhere - Firebase alternative
 */

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
  /** iOS only. App Group shared with a Notification Service Extension, used to confirm notification delivery. */
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
 */
export interface AuthErrorEvent {
  /** `token_invalid`, `token_required`, `token_expired`, `token_mismatch` or `token_provider_failed`. */
  code: string;
  message: string;
  /** What the token provider threw, when `code` is `token_provider_failed`. */
  error?: unknown;
}

/**
 * Push notification message
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

export type OnMessageCallback = (message: AbrovaPushMessage) => void;
export type OnConnectionStateCallback = (connected: boolean) => void;
export type OnRegisteredCallback = (deviceId: string) => void;
export type OnErrorCallback = (error: string) => void;
export type OnDetailedErrorCallback = (error: AbrovaPushError) => void;
export type OnReconnectingCallback = (state: ReconnectionState) => void;
export type OnNetworkStateCallback = (state: NetworkState) => void;
export type OnAppStateCallback = (state: AppState) => void;
export type OnAppUpdatedCallback = (info: AppUpdateInfo) => void;
export type OnAuthErrorCallback = (event: AuthErrorEvent) => void;

declare class AbrovaPush {
  /**
   * Initialize the AbrovaPush SDK
   */
  init(config: AbrovaPushConfig): Promise<void>;

  /**
   * Register device for push notifications
   */
  register(options?: {
    userId?: string;
    metadata?: Record<string, string>;
  }): Promise<void>;

  /**
   * Unregister device and stop push service
   */
  unregister(): Promise<void>;

  /**
   * Subscribe to a topic
   */
  subscribeTopic(topic: string): Promise<void>;

  /**
   * Unsubscribe from a topic
   */
  unsubscribeTopic(topic: string): Promise<void>;

  /**
   * Check if MQTT connection is active
   */
  isConnected(): Promise<boolean>;

  /**
   * Get current device ID
   */
  getDeviceId(): Promise<string | null>;

  /**
   * Get the per-install subscription ID issued by the server during registration.
   * Returns `null` until registration succeeds at least once.
   */
  getSubscriptionId(): Promise<string | null>;

  /**
   * Set user ID for current device
   */
  setUserId(userId: string): Promise<void>;

  /**
   * Clear user ID
   */
  clearUserId(): Promise<void>;

  /**
   * Set, replace or remove (null) the signed user token provider
   */
  setTokenProvider(provider: TokenProvider | null): Promise<void>;

  /**
   * Hand the SDK a signed user token you fetched yourself (null forgets it)
   */
  setUserToken(token: string | null): Promise<void>;

  /**
   * Set callback for identity errors (signed user tokens)
   */
  onAuthError(callback: OnAuthErrorCallback): () => void;

  /**
   * Get the message that launched the app
   */
  getInitialMessage(): Promise<AbrovaPushMessage | null>;

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): Promise<void>;

  /**
   * Set callback for receiving push messages
   */
  onMessage(callback: OnMessageCallback): () => void;

  /**
   * Set callback for connection state changes
   */
  onConnectionState(callback: OnConnectionStateCallback): () => void;

  /**
   * Set callback for registration success
   */
  onRegistered(callback: OnRegisteredCallback): () => void;

  /**
   * Set callback for errors
   */
  onError(callback: OnErrorCallback): () => void;

  /**
   * Set callback for detailed errors
   */
  onDetailedError(callback: OnDetailedErrorCallback): () => void;

  /**
   * Set callback for reconnection state
   */
  onReconnecting(callback: OnReconnectingCallback): () => void;

  /**
   * Set callback for network state changes
   */
  onNetworkState(callback: OnNetworkStateCallback): () => void;

  /**
   * Set callback for app state changes
   */
  onAppState(callback: OnAppStateCallback): () => void;

  /**
   * Set callback for app update detection
   */
  onAppUpdated(callback: OnAppUpdatedCallback): () => void;

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void;
}

declare const abrovaPush: AbrovaPush;
/** Version of this package, reported to the server as the SDK version. */
export declare const SDK_VERSION: string;

export default abrovaPush;
export { AbrovaPush };
