import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Alert,
  TextInput,
  FlatList,
  Switch,
  Platform,
  RefreshControl,
} from 'react-native';
import AbrovaPush, {
  LogLevel,
  type AbrovaPushMessage,
  type InboxMessage,
  InboxMessageStatus,
  type ABTestSummary,
  type ABTestVariant,
  type InAppMessage,
} from '../src/index';
import AbrovaPushVoip, {type CallData} from '@abrova/push-react-native-voip';

// Replace with your API key from Abrova Push dashboard
const API_KEY = 'ab_live_your_api_key_here';

type Screen =
  | 'home'
  | 'push'
  | 'inapp'
  | 'inbox'
  | 'abtest'
  | 'voip'
  | 'settings';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);

  useEffect(() => {
    initSDK();
    return () => {
      AbrovaPush.removeAllListeners();
    };
  }, []);

  const refreshUnreadCount = async () => {
    try {
      const count = await AbrovaPush.getInboxUnreadCount();
      setInboxUnreadCount(count);
    } catch (_) {}
  };

  const initSDK = async () => {
    try {
      await AbrovaPush.setLogLevel(LogLevel.DEBUG);

      AbrovaPush.onConnectionState(connected => setIsConnected(connected));
      AbrovaPush.onRegistered(id => setDeviceId(id));
      AbrovaPush.onMessage(() => refreshUnreadCount());

      await AbrovaPush.init({
        apiKey: API_KEY,
        notificationIcon: 'ic_notification',
        showServiceNotification: false,
        usePushKit: true,
      });

      setIsInitialized(true);
      await AbrovaPush.register();

      // Connection happens asynchronously after register,
      // poll briefly to catch the initial state
      const pollConnection = async (attempts: number) => {
        for (let i = 0; i < attempts; i++) {
          const c = await AbrovaPush.isConnected();
          if (c) { setIsConnected(true); break; }
          await new Promise(r => setTimeout(r, 1000));
        }
      };
      pollConnection(5);

      const id = await AbrovaPush.getDeviceId();
      if (id) setDeviceId(id);

      refreshUnreadCount();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const renderScreen = () => {
    switch (screen) {
      case 'push':
        return <PushScreen />;
      case 'inapp':
        return <InAppScreen />;
      case 'inbox':
        return <InboxScreen />;
      case 'abtest':
        return <ABTestScreen />;
      case 'voip':
        return <VoIPScreen />;
      case 'settings':
        return <SettingsScreen isConnected={isConnected} deviceId={deviceId} />;
      default:
        return (
          <HomeScreen
            isInitialized={isInitialized}
            isConnected={isConnected}
            deviceId={deviceId}
            error={error}
            inboxUnreadCount={inboxUnreadCount}
            onNavigate={setScreen}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      {screen !== 'home' && (
        <TouchableOpacity style={styles.backButton} onPress={() => { setScreen('home'); refreshUnreadCount(); }}>
          <Text style={styles.backText}>{'<'} Back</Text>
        </TouchableOpacity>
      )}
      {renderScreen()}
    </SafeAreaView>
  );
}

// =============================================================================
// Home Screen
// =============================================================================

function HomeScreen({
  isInitialized,
  isConnected,
  deviceId,
  error,
  inboxUnreadCount,
  onNavigate,
}: {
  isInitialized: boolean;
  isConnected: boolean;
  deviceId: string | null;
  error: string | null;
  inboxUnreadCount: number;
  onNavigate: (screen: Screen) => void;
}) {
  const features: {title: string; sub: string; color: string; screen: Screen}[] = [
    {title: 'Push Notifications', sub: 'Receive and inspect messages', color: '#3B82F6', screen: 'push'},
    {title: 'In-App Messages', sub: 'Trigger and display messages', color: '#8B5CF6', screen: 'inapp'},
    {title: 'Inbox', sub: 'Browse message inbox', color: '#F59E0B', screen: 'inbox'},
    {title: 'A/B Testing', sub: 'View experiments and variants', color: '#14B8A6', screen: 'abtest'},
    {title: 'VoIP Calls', sub: 'Native incoming call UI', color: '#22C55E', screen: 'voip'},
    {title: 'Settings', sub: 'SDK configuration and debug', color: '#6B7280', screen: 'settings'},
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>AbrovaPush Example</Text>

      {error && (
        <View style={[styles.card, {backgroundColor: '#FEE2E2'}]}>
          <Text style={{color: '#EF4444', fontWeight: '600'}}>Error: {error}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>SDK Status</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Initialized</Text>
          <Text style={isInitialized ? styles.statusOk : styles.statusError}>
            {isInitialized ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Connected</Text>
          <Text style={isConnected ? styles.statusOk : styles.statusError}>
            {isConnected ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Device ID</Text>
          <Text style={styles.mono} numberOfLines={1}>
            {deviceId ?? 'Not registered'}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>SDK Features</Text>
      {features.map((item, i) => (
        <TouchableOpacity key={i} style={styles.featureCard} onPress={() => onNavigate(item.screen)}>
          <View style={[styles.featureIcon, {backgroundColor: item.color + '20'}]}>
            <View style={[styles.featureDot, {backgroundColor: item.color}]} />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>{item.title}</Text>
            <Text style={styles.featureSubtitle}>{item.sub}</Text>
          </View>
          {item.screen === 'inbox' && inboxUnreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{inboxUnreadCount}</Text>
            </View>
          ) : (
            <Text style={styles.chevron}>{'>'}</Text>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// =============================================================================
// Push Notifications Screen
// =============================================================================

function PushScreen() {
  const [messages, setMessages] = useState<AbrovaPushMessage[]>([]);
  const [topic, setTopic] = useState('');

  useEffect(() => {
    const unsub = AbrovaPush.onMessage(msg => {
      setMessages(prev => [msg, ...prev]);
    });

    AbrovaPush.getInitialMessage().then(msg => {
      if (msg) setMessages(prev => [msg, ...prev]);
    });

    return unsub;
  }, []);

  const subscribeTopic = async () => {
    if (!topic.trim()) return;
    try {
      await AbrovaPush.subscribeTopic(topic.trim());
      Alert.alert('Subscribed', `Subscribed to "${topic.trim()}"`);
      setTopic('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const unsubscribeTopic = async () => {
    if (!topic.trim()) return;
    try {
      await AbrovaPush.unsubscribeTopic(topic.trim());
      Alert.alert('Unsubscribed', `Unsubscribed from "${topic.trim()}"`);
      setTopic('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Push Notifications</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Topic Subscription</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter topic name..."
          value={topic}
          onChangeText={setTopic}
          autoCapitalize="none"
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={subscribeTopic}>
            <Text style={styles.buttonTextLight}>Subscribe</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={unsubscribeTopic}>
            <Text style={styles.buttonTextDark}>Unsubscribe</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Received Messages ({messages.length})</Text>
      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>Send a push from the AbrovaPush dashboard</Text>
        </View>
      ) : (
        messages.map((msg, i) => (
          <View key={i} style={styles.card}>
            <Text style={styles.cardTitle}>{msg.title}</Text>
            <Text style={styles.cardBody}>{msg.body}</Text>
            {msg.imageUrl && <Text style={styles.metaText}>Image: {msg.imageUrl}</Text>}
            {msg.deepLink && <Text style={styles.metaText}>Deep Link: {msg.deepLink}</Text>}
            {msg.data && (
              <Text style={styles.metaText}>Data: {JSON.stringify(msg.data)}</Text>
            )}
            {msg.silent && <Text style={styles.metaBadge}>Silent</Text>}
          </View>
        ))
      )}
    </ScrollView>
  );
}

// =============================================================================
// In-App Messages Screen
// =============================================================================

function InAppScreen() {
  const [messages, setMessages] = useState<InAppMessage[]>([]);
  const [eventName, setEventName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMessages();

    const unsub1 = AbrovaPush.onInAppMessageReady(msg => {
      Alert.alert('In-App Ready', `"${msg.content.title}" (${msg.type})`);
    });
    const unsub2 = AbrovaPush.onInAppButtonClick((msg, btn) => {
      Alert.alert('Button Clicked', `"${btn.text}" on "${msg.content.title}"`);
    });
    const unsub3 = AbrovaPush.onInAppMessageDismissed(msg => {
      Alert.alert('Dismissed', `"${msg.content.title}"`);
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const msgs = await AbrovaPush.fetchInAppMessages();
      setMessages(msgs);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const triggerAppOpen = async () => {
    try {
      await AbrovaPush.triggerInAppOnAppOpen();
      Alert.alert('Triggered', 'App open trigger sent');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const triggerSessionStart = async () => {
    try {
      await AbrovaPush.triggerInAppOnSessionStart();
      Alert.alert('Triggered', 'Session start trigger sent');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const triggerEvent = async () => {
    if (!eventName.trim()) return;
    try {
      await AbrovaPush.triggerInAppEvent(eventName.trim());
      Alert.alert('Triggered', `Event "${eventName.trim()}" sent`);
      setEventName('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>In-App Messages</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Triggers</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={triggerAppOpen}>
            <Text style={styles.buttonTextLight}>App Open</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={triggerSessionStart}>
            <Text style={styles.buttonTextDark}>Session Start</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={[styles.input, {marginTop: 12}]}
          placeholder="Custom event name..."
          value={eventName}
          onChangeText={setEventName}
          autoCapitalize="none"
        />
        <TouchableOpacity style={[styles.button, styles.buttonPrimary, {marginTop: 8}]} onPress={triggerEvent}>
          <Text style={styles.buttonTextLight}>Trigger Event</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Messages ({messages.length})</Text>
        <TouchableOpacity onPress={fetchMessages}>
          <Text style={styles.linkText}>{loading ? 'Loading...' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No in-app messages</Text>
          <Text style={styles.emptySubtext}>Create one in the AbrovaPush dashboard</Text>
        </View>
      ) : (
        messages.map((msg, i) => (
          <TouchableOpacity
            key={i}
            style={styles.card}
            onPress={() => AbrovaPush.showInAppMessage(msg.id)}
          >
            <View style={styles.statusRow}>
              <Text style={styles.cardTitle}>{msg.content.title}</Text>
              <Text style={styles.metaBadge}>{msg.type}</Text>
            </View>
            <Text style={styles.cardBody}>{msg.content.body}</Text>
            <Text style={styles.metaText}>
              Trigger: {msg.triggerType} | Priority: {msg.priority}
            </Text>
            <Text style={styles.linkText}>Tap to show</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

// =============================================================================
// Inbox Screen
// =============================================================================

function InboxScreen() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInbox = useCallback(async () => {
    try {
      const result = await AbrovaPush.getInboxMessages();
      setMessages(result.messages);
      setUnreadCount(result.unreadCount);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchInbox().finally(() => setLoading(false));
  }, [fetchInbox]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchInbox();
    setRefreshing(false);
  };

  const markAsRead = async (id: string) => {
    try {
      await AbrovaPush.markInboxMessageAsRead(id);
      await fetchInbox();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const archiveMessage = async (id: string) => {
    try {
      await AbrovaPush.archiveInboxMessage(id);
      await fetchInbox();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const deleteMessage = async (id: string) => {
    try {
      await AbrovaPush.deleteInboxMessage(id);
      await fetchInbox();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const markAllRead = async () => {
    try {
      await AbrovaPush.markAllInboxMessagesAsRead();
      await fetchInbox();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={[styles.screen, {flex: 1}]}>
      <View style={styles.scrollContent}>
        <View style={styles.sectionHeader}>
          <Text style={styles.title}>Inbox</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        {messages.length > 0 && (
          <TouchableOpacity onPress={markAllRead} style={{marginBottom: 12}}>
            <Text style={styles.linkText}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Inbox is empty</Text>
          <Text style={styles.emptySubtext}>Messages will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 32}}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({item}) => (
            <View style={[styles.card, item.status === InboxMessageStatus.UNREAD && styles.cardUnread]}>
              <View style={styles.statusRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.content.title}</Text>
                {item.status === InboxMessageStatus.UNREAD && (
                  <View style={styles.unreadDot} />
                )}
              </View>
              <Text style={styles.cardBody} numberOfLines={2}>{item.content.body}</Text>
              <Text style={styles.metaText}>
                {new Date(item.createdAt).toLocaleDateString()} | {item.status}
              </Text>
              <View style={[styles.buttonRow, {marginTop: 8}]}>
                {item.status === InboxMessageStatus.UNREAD && (
                  <TouchableOpacity
                    style={[styles.buttonSmall, styles.buttonPrimary]}
                    onPress={() => markAsRead(item.id)}
                  >
                    <Text style={styles.buttonTextLight}>Read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.buttonSmall, styles.buttonSecondary]}
                  onPress={() => archiveMessage(item.id)}
                >
                  <Text style={styles.buttonTextDark}>Archive</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.buttonSmall, {backgroundColor: '#FEE2E2'}]}
                  onPress={() => deleteMessage(item.id)}
                >
                  <Text style={{color: '#EF4444', fontSize: 13, fontWeight: '600'}}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// =============================================================================
// A/B Testing Screen
// =============================================================================

function ABTestScreen() {
  const [tests, setTests] = useState<ABTestSummary[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<ABTestVariant | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTests();

    const unsub = AbrovaPush.onABTestVariantAssigned(variant => {
      Alert.alert('Variant Assigned', `Test: ${variant.testId}\nVariant: ${variant.variantName}`);
    });

    return unsub;
  }, []);

  const fetchTests = async () => {
    setLoading(true);
    try {
      const result = await AbrovaPush.getActiveABTests();
      setTests(result);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const getVariant = async (testId: string) => {
    try {
      const variant = await AbrovaPush.getABTestVariant(testId);
      setSelectedVariant(variant);
      if (variant) {
        await AbrovaPush.trackABTestImpression(testId, variant.variantId);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const trackConversion = async (testId: string) => {
    try {
      await AbrovaPush.trackABTestConversion(testId);
      Alert.alert('Tracked', 'Conversion tracked');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>A/B Testing</Text>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Active Tests ({tests.length})</Text>
        <TouchableOpacity onPress={fetchTests}>
          <Text style={styles.linkText}>{loading ? 'Loading...' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {tests.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No active A/B tests</Text>
          <Text style={styles.emptySubtext}>Create one in the AbrovaPush dashboard</Text>
        </View>
      ) : (
        tests.map((test, i) => (
          <View key={i} style={styles.card}>
            <Text style={styles.cardTitle}>{test.name}</Text>
            <Text style={styles.metaText}>
              {test.variantCount} variants | Control: {test.hasControlGroup ? 'Yes' : 'No'}
            </Text>
            <View style={[styles.buttonRow, {marginTop: 8}]}>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={() => getVariant(test.id)}
              >
                <Text style={styles.buttonTextLight}>Get Variant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => trackConversion(test.id)}
              >
                <Text style={styles.buttonTextDark}>Convert</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {selectedVariant && (
        <>
          <Text style={styles.sectionTitle}>Assigned Variant</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{selectedVariant.variantName}</Text>
            <Text style={styles.metaText}>Test: {selectedVariant.testId}</Text>
            <Text style={styles.metaText}>Variant: {selectedVariant.variantId}</Text>
            <Text style={styles.metaText}>
              Control Group: {selectedVariant.isControlGroup ? 'Yes' : 'No'}
            </Text>
            {selectedVariant.content && (
              <View style={styles.variantContent}>
                {selectedVariant.content.title && (
                  <Text style={styles.cardTitle}>{selectedVariant.content.title}</Text>
                )}
                {selectedVariant.content.body && (
                  <Text style={styles.cardBody}>{selectedVariant.content.body}</Text>
                )}
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

// =============================================================================
// VoIP Screen
// =============================================================================

function VoIPScreen() {
  const [isVoipEnabled, setIsVoipEnabled] = useState(false);
  const [voipStatus, setVoipStatus] = useState('Not Initialized');
  const [statusColor, setStatusColor] = useState('#9CA3AF');
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    restoreVoipState();
    return () => {
      AbrovaPushVoip.removeAllListeners();
    };
  }, []);

  const addLog = (text: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-49), `[${time}] ${text}`]);
  };

  const updateStatus = (initialized: boolean) => {
    if (initialized) {
      setVoipStatus('VoIP Active');
      setStatusColor('#22C55E');
    } else {
      setVoipStatus('VoIP Disabled');
      setStatusColor('#9CA3AF');
    }
  };

  const restoreVoipState = async () => {
    if (AbrovaPushVoip.isInitialized()) {
      setIsVoipEnabled(true);
      updateStatus(true);
    } else {
      updateStatus(false);
    }
  };

  const initializeVoip = async () => {
    try {
      await AbrovaPushVoip.init({
        appName: 'AbrovaPush Example',
        callTimeout: 30,
      });

      AbrovaPushVoip.onCallAccepted((call: CallData) => {
        addLog(`Call accepted: ${call.callerName}`);
        Alert.alert('Call Accepted', call.callerName);
      });
      AbrovaPushVoip.onCallDeclined((call: CallData) => {
        addLog(`Call declined: ${call.callerName}`);
      });
      AbrovaPushVoip.onCallTimeout((call: CallData) => {
        addLog(`Call timed out: ${call.callerName}`);
      });
      AbrovaPushVoip.onError((error: string) => {
        addLog(`Error: ${error}`);
      });

      const deviceId = await AbrovaPush.getDeviceId();
      await AbrovaPushVoip.setApiKey({
        apiKey: API_KEY,
        deviceId: deviceId ?? undefined,
      });

      addLog('VoIP initialized + API key set');
      setIsVoipEnabled(true);
      updateStatus(true);
    } catch (e: any) {
      addLog(`Init error: ${e.message}`);
    }
  };

  const toggleVoip = async (enabled: boolean) => {
    setIsVoipEnabled(enabled);
    if (enabled) {
      await initializeVoip();
    } else {
      addLog('VoIP disabled');
      updateStatus(false);
    }
  };

  const simulateCall = () => {
    if (!AbrovaPushVoip.isInitialized()) {
      Alert.alert('Error', 'Initialize VoIP first');
      return;
    }
    const callData: CallData = {
      callId: Date.now().toString(),
      callerName: 'Test Caller',
      callType: 'audio',
      timestamp: Date.now(),
    };
    AbrovaPushVoip.showIncomingCall(callData);
    addLog(`Simulated call: ${callData.callId}`);
  };

  const checkStatus = () => {
    Alert.alert('VoIP Status', `Initialized: ${AbrovaPushVoip.isInitialized()}`);
    addLog('Status checked');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>VoIP Calls</Text>

      <View style={styles.card}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor, marginRight: 10}} />
          <Text style={[styles.cardTitle, {marginBottom: 0}]}>{voipStatus}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.featureTitle}>Enable VoIP</Text>
          <Switch value={isVoipEnabled} onValueChange={toggleVoip} />
        </View>
        <Text style={styles.featureSubtitle}>
          Initialize VoIP SDK for incoming call handling. Required for apps with real calling features.
        </Text>
        <Text style={{fontSize: 11, color: '#F59E0B', marginTop: 4}}>
          Requires real calling feature for App Store.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Actions</Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, {backgroundColor: '#22C55E20'}]} onPress={simulateCall}>
          <Text style={{color: '#22C55E', fontWeight: '600', fontSize: 14}}>Simulate Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, {backgroundColor: '#14B8A620'}]} onPress={checkStatus}>
          <Text style={{color: '#14B8A6', fontWeight: '600', fontSize: 14}}>Check Status</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, {marginTop: 16}]}>
        <Text style={styles.cardTitle}>How VoIP Works</Text>
        {[
          {title: 'Standard APNs', desc: 'Regular notifications. 100% App Store compliant.', color: '#3B82F6'},
          {title: 'VoIP Push', desc: 'Instant delivery when app killed. Requires real calling feature.', color: '#22C55E'},
          {title: 'CallKit (iOS)', desc: 'Native incoming call UI. Required by Apple since iOS 13.', color: '#F59E0B'},
          {title: 'CallStyle (Android)', desc: 'Full-screen incoming call notification on Android 12+.', color: '#8B5CF6'},
        ].map((item, i) => (
          <View key={i} style={{flexDirection: 'row', marginTop: 8}}>
            <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: item.color, marginTop: 5, marginRight: 10}} />
            <View style={{flex: 1}}>
              <Text style={{fontSize: 13, fontWeight: '600', color: item.color}}>{item.title}</Text>
              <Text style={styles.featureSubtitle}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Call Log</Text>
        <TouchableOpacity onPress={() => setLogs([])}>
          <Text style={styles.linkText}>Clear</Text>
        </TouchableOpacity>
      </View>
      <View style={{backgroundColor: '#F3F4F6', borderRadius: 10, padding: 10, minHeight: 120}}>
        <ScrollView nestedScrollEnabled>
          <Text style={{fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: '#374151'}}>
            {logs.length === 0 ? 'No logs yet' : logs.join('\n')}
          </Text>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

// =============================================================================
// Settings Screen
// =============================================================================

function SettingsScreen({isConnected, deviceId}: {isConnected: boolean; deviceId: string | null}) {
  const [userId, setUserId] = useState('');
  const [logLevel, setLogLevel] = useState<LogLevel>(LogLevel.DEBUG);
  const [serviceHidden, setServiceHidden] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      AbrovaPush.isServiceNotificationHidden().then(setServiceHidden);
    }
  }, []);

  const updateUserId = async () => {
    if (!userId.trim()) return;
    try {
      await AbrovaPush.setUserId(userId.trim());
      Alert.alert('Updated', `User ID set to "${userId.trim()}"`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const clearUser = async () => {
    try {
      await AbrovaPush.clearUserId();
      setUserId('');
      Alert.alert('Cleared', 'User ID cleared');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const changeLogLevel = async (level: LogLevel) => {
    try {
      await AbrovaPush.setLogLevel(level);
      setLogLevel(level);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const unregister = async () => {
    Alert.alert('Unregister', 'This will stop push notifications. Continue?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Unregister',
        style: 'destructive',
        onPress: async () => {
          try {
            await AbrovaPush.unregister();
            Alert.alert('Done', 'Device unregistered');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connection</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={isConnected ? styles.statusOk : styles.statusError}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Device ID</Text>
          <Text style={styles.mono} numberOfLines={1}>{deviceId ?? 'N/A'}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>User ID</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter user ID..."
          value={userId}
          onChangeText={setUserId}
          autoCapitalize="none"
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={updateUserId}>
            <Text style={styles.buttonTextLight}>Set User ID</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={clearUser}>
            <Text style={styles.buttonTextDark}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Log Level</Text>
        <View style={styles.logLevelRow}>
          {Object.values(LogLevel).map(level => (
            <TouchableOpacity
              key={level}
              style={[styles.logLevelButton, logLevel === level && styles.logLevelActive]}
              onPress={() => changeLogLevel(level)}
            >
              <Text
                style={[styles.logLevelText, logLevel === level && styles.logLevelTextActive]}
              >
                {level}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {Platform.OS === 'android' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service Notification</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Hidden by user</Text>
            <Text style={styles.mono}>{serviceHidden ? 'Yes' : 'No'}</Text>
          </View>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, {marginTop: 8}]}
            onPress={() => AbrovaPush.openServiceNotificationSettings()}
          >
            <Text style={styles.buttonTextDark}>Open Channel Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cache</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={async () => {
              await AbrovaPush.clearInboxCache();
              Alert.alert('Cleared', 'Inbox cache cleared');
            }}
          >
            <Text style={styles.buttonTextDark}>Clear Inbox</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={async () => {
              await AbrovaPush.clearABTestCache();
              Alert.alert('Cleared', 'A/B test cache cleared');
            }}
          >
            <Text style={styles.buttonTextDark}>Clear A/B Tests</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={[styles.card, {backgroundColor: '#FEE2E2'}]} onPress={unregister}>
        <Text style={{color: '#EF4444', fontWeight: '600', textAlign: 'center'}}>
          Unregister Device
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F9FAFB'},
  screen: {flex: 1},
  scrollContent: {padding: 16, paddingBottom: 32},
  backButton: {paddingHorizontal: 16, paddingVertical: 8},
  backText: {fontSize: 16, color: '#3B82F6', fontWeight: '600'},
  title: {fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#111827'},
  sectionTitle: {fontSize: 18, fontWeight: '600', marginTop: 24, marginBottom: 12, color: '#111827'},
  sectionHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  cardUnread: {borderLeftWidth: 3, borderLeftColor: '#3B82F6'},
  cardTitle: {fontSize: 16, fontWeight: '600', marginBottom: 4, color: '#374151'},
  cardBody: {fontSize: 14, color: '#6B7280', marginBottom: 4},

  statusRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4},
  statusLabel: {fontSize: 14, color: '#374151'},
  statusOk: {color: '#10B981', fontWeight: '600'},
  statusError: {color: '#EF4444', fontWeight: '600'},
  mono: {fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: '#6B7280', flexShrink: 1},

  featureCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  featureIcon: {width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  featureDot: {width: 16, height: 16, borderRadius: 8},
  featureContent: {flex: 1, marginLeft: 12},
  featureTitle: {fontSize: 15, fontWeight: '600', color: '#111827'},
  featureSubtitle: {fontSize: 13, color: '#6B7280', marginTop: 2},
  chevron: {fontSize: 20, color: '#D1D5DB'},

  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#F9FAFB',
    color: '#111827',
  },

  buttonRow: {flexDirection: 'row', gap: 8, marginTop: 12},
  button: {flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center'},
  buttonSmall: {paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, alignItems: 'center'},
  buttonPrimary: {backgroundColor: '#3B82F6'},
  buttonSecondary: {backgroundColor: '#F3F4F6'},
  buttonTextLight: {color: '#fff', fontWeight: '600', fontSize: 14},
  buttonTextDark: {color: '#374151', fontWeight: '600', fontSize: 14},

  linkText: {color: '#3B82F6', fontWeight: '600', fontSize: 14},
  metaText: {fontSize: 12, color: '#9CA3AF', marginTop: 2},
  metaBadge: {fontSize: 11, color: '#8B5CF6', fontWeight: '600', backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: 'hidden'},

  emptyState: {alignItems: 'center', paddingVertical: 32},
  emptyText: {fontSize: 16, color: '#9CA3AF', fontWeight: '600'},
  emptySubtext: {fontSize: 13, color: '#D1D5DB', marginTop: 4},

  badge: {backgroundColor: '#EF4444', borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6},
  badgeText: {color: '#fff', fontSize: 12, fontWeight: 'bold'},
  unreadDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6'},

  logLevelRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8},
  logLevelButton: {paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#F3F4F6'},
  logLevelActive: {backgroundColor: '#3B82F6'},
  logLevelText: {fontSize: 12, color: '#374151', fontWeight: '600'},
  logLevelTextActive: {color: '#fff'},

  variantContent: {marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB'},
});
