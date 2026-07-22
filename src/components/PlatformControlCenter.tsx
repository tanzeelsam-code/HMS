import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Clock3,
  Eye,
  EyeOff,
  FileKey2,
  Fingerprint,
  KeyRound,
  Link2,
  ListRestart,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  ShieldX,
  Webhook,
  X,
} from 'lucide-react';
import { api, AuthUser } from '../api';

type PlatformTab = 'audit' | 'webhooks' | 'deliveries';
type AuditOutcome = 'success' | 'failure' | 'denied';
type DeliveryStatus = 'Pending' | 'Delivering' | 'Succeeded' | 'Failed';

interface AuditEvent {
  sequence: number;
  id: string;
  occurredAt: string;
  requestId: string | null;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  outcome: AuditOutcome;
  source: string;
  networkHash: string | null;
  metadata: Record<string, unknown> | null;
  previousHash: string | null;
  eventHash: string;
}

interface AuditPage {
  events: AuditEvent[];
  nextBeforeSequence: number | null;
}

interface AuditVerification {
  valid: boolean;
  checked: number;
  lastSequence?: number | null;
  lastHash?: string | null;
  firstInvalidSequence?: number;
  reason?: string;
}

interface WebhookSubscription {
  id: string;
  url: string;
  description: string | null;
  eventTypes: string[];
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface WebhookMutationResult {
  subscription: WebhookSubscription;
  signingSecret?: string;
}

interface DeliveryAttempt {
  id: string;
  eventId: string;
  eventType: string;
  subscriptionId: string;
  subscriptionUrl: string;
  attemptNumber: number;
  status: DeliveryStatus;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  signatureVersion: string | null;
  createdAt: string;
}

interface DeliverySummary {
  claimed: number;
  succeeded: number;
  failed: number;
  retried: number;
}

interface SecretNotice {
  subscriptionId: string;
  value: string;
  reason: 'created' | 'rotated';
}

interface SubscriptionDraft {
  url: string;
  description: string;
  eventTypes: string;
}

interface PlatformControlCenterProps {
  user: AuthUser;
}

const emptyDraft = (): SubscriptionDraft => ({
  url: '',
  description: '',
  eventTypes: 'reservation.created, reservation.updated',
});

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
};

const compactHash = (value: string | null) => value
  ? `${value.slice(0, 10)}…${value.slice(-8)}`
  : 'Genesis';

const describeDestination = (value: string) => {
  try {
    const destination = new URL(value);
    return `${destination.hostname}${destination.pathname === '/' ? '' : destination.pathname}`;
  } catch {
    return value;
  }
};

const parseEventTypes = (value: string) => [...new Set(
  value.split(/[\n,]/).map((item) => item.trim().toLowerCase()).filter(Boolean),
)];

const outcomeStyle: Record<AuditOutcome, string> = {
  success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  failure: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  denied: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
};

const deliveryStyle: Record<DeliveryStatus, string> = {
  Pending: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Delivering: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Succeeded: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  Failed: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

export const PlatformControlCenter: React.FC<PlatformControlCenterProps> = ({ user }) => {
  const isGeneralManager = user.role === 'General Manager';
  const canReadAudit = isGeneralManager || user.role === 'Finance';
  const [activeTab, setActiveTab] = useState<PlatformTab>('audit');

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditCursor, setAuditCursor] = useState<number | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditOutcome, setAuditOutcome] = useState<'all' | AuditOutcome>('all');
  const [verification, setVerification] = useState<AuditVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [subscriptions, setSubscriptions] = useState<WebhookSubscription[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createDraft, setCreateDraft] = useState<SubscriptionDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SubscriptionDraft>(emptyDraft);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [deliveries, setDeliveries] = useState<DeliveryAttempt[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<'all' | DeliveryStatus>('all');
  const [processingDeliveries, setProcessingDeliveries] = useState(false);
  const [lastDeliverySummary, setLastDeliverySummary] = useState<DeliverySummary | null>(null);

  const [secretNotice, setSecretNotice] = useState<SecretNotice | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [platformError, setPlatformError] = useState('');

  const loadAudit = useCallback(async (beforeSequence?: number) => {
    const query = new URLSearchParams({ limit: '50' });
    if (beforeSequence) query.set('beforeSequence', String(beforeSequence));
    const page = await api.get<AuditPage>(`/platform/audit-events?${query.toString()}`);
    setAuditEvents((previous) => beforeSequence ? [...previous, ...page.events] : page.events);
    setAuditCursor(page.nextBeforeSequence);
  }, []);

  const loadSubscriptions = useCallback(async () => {
    if (!isGeneralManager) return;
    setSubscriptions(await api.get<WebhookSubscription[]>('/platform/webhooks'));
  }, [isGeneralManager]);

  const loadDeliveries = useCallback(async () => {
    if (!isGeneralManager) return;
    setDeliveries(await api.get<DeliveryAttempt[]>('/platform/webhook-deliveries?limit=100'));
  }, [isGeneralManager]);

  const refreshPlatformData = useCallback(async () => {
    if (!isGeneralManager) return;
    setPlatformError('');
    setSubscriptionsLoading(true);
    setDeliveriesLoading(true);
    try {
      await Promise.all([loadSubscriptions(), loadDeliveries()]);
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : 'Unable to load platform controls');
    } finally {
      setSubscriptionsLoading(false);
      setDeliveriesLoading(false);
    }
  }, [isGeneralManager, loadDeliveries, loadSubscriptions]);

  useEffect(() => {
    if (!canReadAudit) {
      setAuditLoading(false);
      return;
    }
    let mounted = true;
    setAuditLoading(true);
    setAuditError('');
    void loadAudit()
      .catch((error) => {
        if (mounted) setAuditError(error instanceof Error ? error.message : 'Unable to load audit events');
      })
      .finally(() => {
        if (mounted) setAuditLoading(false);
      });
    return () => { mounted = false; };
  }, [canReadAudit, loadAudit]);

  useEffect(() => {
    if (isGeneralManager) void refreshPlatformData();
  }, [isGeneralManager, refreshPlatformData]);

  useEffect(() => {
    if (!isGeneralManager && activeTab !== 'audit') setActiveTab('audit');
  }, [activeTab, isGeneralManager]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!secretNotice) return;
    // Signing secrets stay in component memory only and expire from view even
    // if an administrator leaves this workspace open.
    const timer = window.setTimeout(() => {
      setSecretNotice(null);
      setSecretVisible(false);
    }, 5 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [secretNotice]);

  const filteredAuditEvents = useMemo(() => {
    const needle = auditSearch.trim().toLowerCase();
    return auditEvents.filter((event) => {
      if (auditOutcome !== 'all' && event.outcome !== auditOutcome) return false;
      if (!needle) return true;
      return [
        event.action,
        event.actorId,
        event.actorRole,
        event.resourceType,
        event.resourceId,
        event.requestId,
        event.id,
      ].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [auditEvents, auditOutcome, auditSearch]);

  const filteredDeliveries = useMemo(() => deliveryStatus === 'all'
    ? deliveries
    : deliveries.filter((attempt) => attempt.status === deliveryStatus), [deliveries, deliveryStatus]);

  const handleRefreshAudit = async () => {
    setAuditLoading(true);
    setAuditError('');
    try {
      await loadAudit();
      setNotice({ tone: 'success', message: 'Audit events refreshed.' });
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'Unable to refresh audit events');
    } finally {
      setAuditLoading(false);
    }
  };

  const handleLoadOlder = async () => {
    if (!auditCursor) return;
    setAuditLoadingMore(true);
    setAuditError('');
    try {
      await loadAudit(auditCursor);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'Unable to load older events');
    } finally {
      setAuditLoadingMore(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    setAuditError('');
    try {
      setVerification(await api.get<AuditVerification>('/platform/audit-events/verify'));
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'Unable to verify the audit chain');
    } finally {
      setVerifying(false);
    }
  };

  const validateDraft = (draft: SubscriptionDraft) => {
    let destination: URL;
    try {
      destination = new URL(draft.url);
    } catch {
      throw new Error('Enter a valid absolute webhook URL.');
    }
    if (destination.protocol !== 'https:') throw new Error('Webhook destinations must use HTTPS.');
    const eventTypes = parseEventTypes(draft.eventTypes);
    if (eventTypes.length === 0) throw new Error('Add at least one event type.');
    return eventTypes;
  };

  const exposeSecret = (result: WebhookMutationResult, reason: SecretNotice['reason']) => {
    if (!result.signingSecret) return;
    setSecretNotice({
      subscriptionId: result.subscription.id,
      value: result.signingSecret,
      reason,
    });
    setSecretVisible(false);
  };

  const handleCreateSubscription = async (event: React.FormEvent) => {
    event.preventDefault();
    setPlatformError('');
    setSavingSubscription(true);
    try {
      const eventTypes = validateDraft(createDraft);
      const result = await api.post<WebhookMutationResult>('/platform/webhooks', {
        url: createDraft.url.trim(),
        description: createDraft.description.trim() || null,
        eventTypes,
      });
      exposeSecret(result, 'created');
      setCreateDraft(emptyDraft());
      setShowCreateForm(false);
      await loadSubscriptions();
      setNotice({ tone: 'success', message: 'Webhook subscription created. Save its signing secret now.' });
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : 'Unable to create webhook subscription');
    } finally {
      setSavingSubscription(false);
    }
  };

  const beginEdit = (subscription: WebhookSubscription) => {
    setEditingId(subscription.id);
    setEditDraft({
      url: subscription.url,
      description: subscription.description || '',
      eventTypes: subscription.eventTypes.join(', '),
    });
  };

  const handleUpdateSubscription = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setPlatformError('');
    setSavingSubscription(true);
    try {
      const eventTypes = validateDraft(editDraft);
      await api.patch<WebhookMutationResult>(`/platform/webhooks/${encodeURIComponent(editingId)}`, {
        url: editDraft.url.trim(),
        description: editDraft.description.trim() || null,
        eventTypes,
      });
      setEditingId(null);
      await loadSubscriptions();
      setNotice({ tone: 'success', message: 'Webhook subscription updated.' });
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : 'Unable to update webhook subscription');
    } finally {
      setSavingSubscription(false);
    }
  };

  const handleToggleSubscription = async (subscription: WebhookSubscription) => {
    setPlatformError('');
    try {
      await api.patch(`/platform/webhooks/${encodeURIComponent(subscription.id)}`, {
        active: !subscription.active,
      });
      await loadSubscriptions();
      setNotice({
        tone: 'success',
        message: `Webhook ${subscription.active ? 'disabled' : 'enabled'}.`,
      });
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : 'Unable to change webhook status');
    }
  };

  const handleRotateSecret = async (subscription: WebhookSubscription) => {
    const confirmed = window.confirm(
      `Rotate the signing secret for ${describeDestination(subscription.url)}? The previous secret will stop working immediately.`,
    );
    if (!confirmed) return;
    setPlatformError('');
    try {
      const result = await api.patch<WebhookMutationResult>(
        `/platform/webhooks/${encodeURIComponent(subscription.id)}`,
        { rotateSecret: true },
      );
      exposeSecret(result, 'rotated');
      await loadSubscriptions();
      setNotice({ tone: 'success', message: 'Signing secret rotated. Update the receiver before dismissing it.' });
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : 'Unable to rotate signing secret');
    }
  };

  const handleTestSubscription = async (subscription: WebhookSubscription) => {
    setTestingId(subscription.id);
    setPlatformError('');
    try {
      await api.post(`/platform/webhooks/${encodeURIComponent(subscription.id)}/test`);
      const summary = await api.post<DeliverySummary>('/platform/webhook-deliveries/process', { limit: 25 });
      setLastDeliverySummary(summary);
      await loadDeliveries();
      setActiveTab('deliveries');
      setNotice({
        tone: summary.failed > 0 ? 'error' : 'success',
        message: summary.failed > 0
          ? 'Test was sent but the receiver did not accept it. Review the delivery attempt.'
          : 'Signed test webhook delivered successfully.',
      });
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : 'Unable to test webhook subscription');
    } finally {
      setTestingId(null);
    }
  };

  const handleProcessDeliveries = async () => {
    setProcessingDeliveries(true);
    setPlatformError('');
    try {
      const summary = await api.post<DeliverySummary>('/platform/webhook-deliveries/process', { limit: 50 });
      setLastDeliverySummary(summary);
      await loadDeliveries();
      setNotice({
        tone: summary.failed > 0 ? 'error' : 'success',
        message: summary.claimed === 0
          ? 'No webhook deliveries were due.'
          : `Processed ${summary.claimed} delivery attempt(s).`,
      });
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : 'Unable to process webhook deliveries');
    } finally {
      setProcessingDeliveries(false);
    }
  };

  const handleCopySecret = async () => {
    if (!secretNotice) return;
    try {
      await navigator.clipboard.writeText(secretNotice.value);
      setNotice({ tone: 'success', message: 'Signing secret copied to the clipboard.' });
    } catch {
      setNotice({ tone: 'error', message: 'Clipboard access was blocked. Reveal and copy the secret manually.' });
      setSecretVisible(true);
    }
  };

  if (!canReadAudit) {
    return (
      <div className="glass-panel p-8 text-center space-y-3 animate-slide-up" role="alert">
        <ShieldX className="w-10 h-10 text-rose-400 mx-auto" />
        <h2 className="text-lg font-bold text-gray-100">Platform controls are restricted</h2>
        <p className="text-sm text-gray-400 max-w-xl mx-auto">
          Audit records require Finance or General Manager access. Webhook administration requires a General Manager.
        </p>
      </div>
    );
  }

  const tabs: { id: PlatformTab; label: string; icon: React.ReactNode }[] = [
    { id: 'audit', label: 'Audit integrity', icon: <ShieldCheck className="w-4 h-4" /> },
    ...(isGeneralManager ? [
      { id: 'webhooks' as const, label: 'Webhook endpoints', icon: <Webhook className="w-4 h-4" /> },
      { id: 'deliveries' as const, label: 'Delivery operations', icon: <Activity className="w-4 h-4" /> },
    ] : []),
  ];

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="glass-panel p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Platform Control Center</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              {isGeneralManager ? 'Platform administrator' : 'Audit read-only'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-3xl">
            Inspect tamper-evident security events and manage signed outbound integrations. Authorization is enforced again by the API.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Fingerprint className="w-4 h-4 text-amber-400" />
          <span>{user.name}</span>
          <span aria-hidden="true">•</span>
          <span>{user.role}</span>
        </div>
      </div>

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-start gap-2 ${
            notice.tone === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
          }`}
        >
          {notice.tone === 'success'
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          <span>{notice.message}</span>
        </div>
      )}

      {platformError && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{platformError}</span>
        </div>
      )}

      {secretNotice && (
        <section className="glass-panel-gold rounded-xl p-4 space-y-3" aria-labelledby="signing-secret-title">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <KeyRound className="w-5 h-5 text-amber-300 mt-0.5 flex-shrink-0" />
              <div>
                <h3 id="signing-secret-title" className="text-sm font-bold text-amber-200">
                  One-time signing secret {secretNotice.reason === 'created' ? 'created' : 'rotated'}
                </h3>
                <p className="text-xs text-gray-300 mt-1">
                  Save this in the receiver&apos;s secret manager. NexusHOS will not show it again, and this panel clears after five minutes.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setSecretNotice(null); setSecretVisible(false); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              aria-label="Dismiss signing secret"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="sr-only" htmlFor="one-time-signing-secret">One-time signing secret</label>
            <input
              id="one-time-signing-secret"
              readOnly
              type={secretVisible ? 'text' : 'password'}
              value={secretNotice.value}
              onFocus={(event) => event.currentTarget.select()}
              className="flex-1 min-w-0 rounded-lg border border-amber-500/30 bg-slate-950 px-3 py-2 text-xs font-mono text-amber-100 outline-none focus:border-amber-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSecretVisible((visible) => !visible)}
                className="btn-secondary text-xs px-3 py-2"
                aria-pressed={secretVisible}
              >
                {secretVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {secretVisible ? 'Hide' : 'Reveal'}
              </button>
              <button type="button" onClick={() => void handleCopySecret()} className="btn-primary text-xs px-3 py-2">
                <Clipboard className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 font-mono break-all">Subscription: {secretNotice.subscriptionId}</p>
        </section>
      )}

      <div className="glass-panel p-2 overflow-x-auto">
        <div className="flex min-w-max gap-1" role="tablist" aria-label="Platform control sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`platform-tab-${tab.id}`}
              aria-controls={`platform-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
                  : 'text-gray-400 border border-transparent hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'audit' && (
        <section
          id="platform-panel-audit"
          role="tabpanel"
          aria-labelledby="platform-tab-audit"
          className="space-y-4"
        >
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="glass-panel p-5 xl:col-span-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    <FileKey2 className="w-4 h-4 text-amber-400" /> Immutable security events
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Append-only records are linked by signed hashes. Event payloads exclude request bodies and credentials.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRefreshAudit()}
                  disabled={auditLoading}
                  className="btn-secondary text-xs px-3 py-2 disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>
            </div>

            <div className={`glass-panel p-5 border ${
              verification == null
                ? 'border-white/10'
                : verification.valid ? 'border-emerald-500/30' : 'border-rose-500/40'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Chain integrity</div>
                  <div className={`text-sm font-bold mt-1 ${
                    verification == null
                      ? 'text-gray-200'
                      : verification.valid ? 'text-emerald-300' : 'text-rose-300'
                  }`}>
                    {verification == null
                      ? (isGeneralManager ? 'Not verified this session' : 'GM verification required')
                      : verification.valid ? 'Signature chain valid' : 'Integrity failure detected'}
                  </div>
                  {verification && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      {verification.checked} event(s) checked
                      {verification.reason ? ` • ${verification.reason}` : ''}
                    </p>
                  )}
                </div>
                {verification?.valid
                  ? <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  : verification
                    ? <ShieldX className="w-6 h-6 text-rose-400" />
                    : <Fingerprint className="w-6 h-6 text-gray-500" />}
              </div>
              {isGeneralManager && (
                <button
                  type="button"
                  onClick={() => void handleVerifyChain()}
                  disabled={verifying}
                  className="btn-primary text-xs px-3 py-2 mt-3 w-full disabled:opacity-60"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {verifying ? 'Verifying…' : 'Verify entire chain'}
                </button>
              )}
            </div>
          </div>

          {auditError && (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              {auditError}
            </div>
          )}

          <div className="glass-panel p-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-end">
              <label className="flex-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Search loaded events
                <span className="relative block mt-1.5">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
                  <input
                    value={auditSearch}
                    onChange={(event) => setAuditSearch(event.target.value)}
                    placeholder="Action, actor, resource, request ID…"
                    className="w-full rounded-lg border border-white/10 bg-slate-950 pl-9 pr-3 py-2 text-xs text-gray-200 normal-case tracking-normal outline-none focus:border-amber-400"
                  />
                </span>
              </label>
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Outcome
                <select
                  value={auditOutcome}
                  onChange={(event) => setAuditOutcome(event.target.value as 'all' | AuditOutcome)}
                  className="block mt-1.5 min-w-40 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-gray-200 normal-case tracking-normal outline-none focus:border-amber-400"
                >
                  <option value="all">All outcomes</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                  <option value="denied">Denied</option>
                </select>
              </label>
              <div className="text-xs text-gray-500 pb-2 md:text-right">
                {filteredAuditEvents.length} of {auditEvents.length} loaded
              </div>
            </div>

            {auditLoading && auditEvents.length === 0 ? (
              <div role="status" className="py-12 flex items-center justify-center text-sm text-gray-400">
                <RefreshCw className="w-4 h-4 mr-2 animate-spin text-amber-400" /> Loading immutable events…
              </div>
            ) : filteredAuditEvents.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">No audit events match these filters.</div>
            ) : (
              <div className="space-y-2">
                {filteredAuditEvents.map((event) => (
                  <article key={event.id} className="rounded-xl border border-white/10 bg-slate-950/70 p-3.5 hover:border-white/20 transition-colors">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-500">#{event.sequence}</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${outcomeStyle[event.outcome]}`}>
                            {event.outcome}
                          </span>
                          <span className="text-xs font-bold text-gray-100 break-all">{event.action}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
                          <span>{formatDateTime(event.occurredAt)}</span>
                          <span>Actor: <strong className="text-gray-300 font-medium">{event.actorId || 'system'}</strong></span>
                          {event.actorRole && <span>{event.actorRole}</span>}
                          {event.resourceType && (
                            <span>Resource: <strong className="text-gray-300 font-medium">{event.resourceType}/{event.resourceId || '—'}</strong></span>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-gray-500 lg:text-right flex-shrink-0">
                        <div title={event.eventHash}>Hash {compactHash(event.eventHash)}</div>
                        <div title={event.previousHash || undefined}>Prev {compactHash(event.previousHash)}</div>
                      </div>
                    </div>
                    <details className="mt-3 text-xs group">
                      <summary className="cursor-pointer text-amber-300 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded w-fit">
                        Technical evidence
                      </summary>
                      <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <dl className="rounded-lg border border-white/10 bg-slate-950 p-3 space-y-1 text-[11px]">
                          <div><dt className="inline text-gray-500">Event ID: </dt><dd className="inline font-mono text-gray-300 break-all">{event.id}</dd></div>
                          <div><dt className="inline text-gray-500">Request ID: </dt><dd className="inline font-mono text-gray-300 break-all">{event.requestId || '—'}</dd></div>
                          <div><dt className="inline text-gray-500">Source: </dt><dd className="inline text-gray-300">{event.source}</dd></div>
                          <div><dt className="inline text-gray-500">Network hash: </dt><dd className="inline font-mono text-gray-300 break-all">{event.networkHash || '—'}</dd></div>
                        </dl>
                        <pre className="rounded-lg border border-white/10 bg-slate-950 p-3 text-[10px] text-gray-400 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                          {JSON.stringify(event.metadata || {}, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            )}

            {auditCursor && (
              <button
                type="button"
                onClick={() => void handleLoadOlder()}
                disabled={auditLoadingMore}
                className="btn-secondary text-xs px-4 py-2 mx-auto disabled:opacity-60"
              >
                <Clock3 className="w-3.5 h-3.5" /> {auditLoadingMore ? 'Loading…' : 'Load older events'}
              </button>
            )}
          </div>
        </section>
      )}

      {isGeneralManager && activeTab === 'webhooks' && (
        <section
          id="platform-panel-webhooks"
          role="tabpanel"
          aria-labelledby="platform-tab-webhooks"
          className="space-y-4"
        >
          <div className="glass-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                <Webhook className="w-4 h-4 text-amber-400" /> Signed outbound endpoints
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Secrets are encrypted at rest. HTTPS destinations receive an HMAC signature and stable event ID on every attempt.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void refreshPlatformData()}
                disabled={subscriptionsLoading}
                className="btn-secondary text-xs px-3 py-2 disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${subscriptionsLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm((shown) => !shown)}
                className="btn-primary text-xs px-3 py-2"
                aria-expanded={showCreateForm}
                aria-controls="new-webhook-form"
              >
                <Plus className="w-3.5 h-3.5" /> New endpoint
              </button>
            </div>
          </div>

          {showCreateForm && (
            <form id="new-webhook-form" onSubmit={(event) => void handleCreateSubscription(event)} className="glass-panel-gold rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-amber-200">Create webhook subscription</h4>
                  <p className="text-[11px] text-gray-400 mt-1">The signing secret is shown once after creation.</p>
                </div>
                <button type="button" onClick={() => setShowCreateForm(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Close new webhook form">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <SubscriptionFields draft={createDraft} onChange={setCreateDraft} prefix="create-webhook" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreateForm(false)} className="btn-secondary text-xs px-4 py-2">Cancel</button>
                <button type="submit" disabled={savingSubscription} className="btn-primary text-xs px-4 py-2 disabled:opacity-60">
                  <Save className="w-3.5 h-3.5" /> {savingSubscription ? 'Creating…' : 'Create endpoint'}
                </button>
              </div>
            </form>
          )}

          {subscriptionsLoading && subscriptions.length === 0 ? (
            <div className="glass-panel py-12 flex items-center justify-center text-sm text-gray-400" role="status">
              <RefreshCw className="w-4 h-4 mr-2 animate-spin text-amber-400" /> Loading webhook subscriptions…
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="glass-panel p-10 text-center space-y-2">
              <Link2 className="w-8 h-8 text-gray-600 mx-auto" />
              <p className="text-sm font-semibold text-gray-300">No outbound endpoints configured</p>
              <p className="text-xs text-gray-500">Create an HTTPS receiver to begin publishing operational events.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {subscriptions.map((subscription) => (
                <article key={subscription.id} className={`glass-panel p-5 space-y-4 border ${
                  subscription.active ? 'border-white/10' : 'border-rose-500/20 opacity-80'
                }`}>
                  {editingId === subscription.id ? (
                    <form onSubmit={(event) => void handleUpdateSubscription(event)} className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-bold text-gray-100">Edit endpoint</h4>
                        <button type="button" onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Cancel webhook editing">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <SubscriptionFields draft={editDraft} onChange={setEditDraft} prefix={`edit-${subscription.id}`} />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingId(null)} className="btn-secondary text-xs px-3 py-2">Cancel</button>
                        <button type="submit" disabled={savingSubscription} className="btn-primary text-xs px-3 py-2 disabled:opacity-60">
                          <Save className="w-3.5 h-3.5" /> {savingSubscription ? 'Saving…' : 'Save changes'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${subscription.active ? 'bg-emerald-400' : 'bg-rose-400'}`} aria-hidden="true" />
                            <h4 className="text-sm font-bold text-gray-100 truncate" title={subscription.url}>
                              {subscription.description || describeDestination(subscription.url)}
                            </h4>
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                              subscription.active
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                            }`}>
                              {subscription.active ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-gray-400 mt-2 break-all">{subscription.url}</p>
                        </div>
                        <Webhook className="w-5 h-5 text-amber-400 flex-shrink-0" />
                      </div>

                      <div className="flex flex-wrap gap-1.5" aria-label="Subscribed event types">
                        {subscription.eventTypes.map((eventType) => (
                          <span key={eventType} className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] font-mono text-blue-200">
                            {eventType}
                          </span>
                        ))}
                      </div>

                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-500 border-t border-white/10 pt-3">
                        <div><dt className="inline">Created: </dt><dd className="inline text-gray-300">{formatDateTime(subscription.createdAt)}</dd></div>
                        <div><dt className="inline">Updated: </dt><dd className="inline text-gray-300">{formatDateTime(subscription.updatedAt)}</dd></div>
                        <div className="sm:col-span-2"><dt className="inline">ID: </dt><dd className="inline font-mono text-gray-400 break-all">{subscription.id}</dd></div>
                      </dl>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button type="button" onClick={() => beginEdit(subscription)} className="btn-secondary text-[11px] px-2 py-2">Edit</button>
                        <button
                          type="button"
                          onClick={() => void handleTestSubscription(subscription)}
                          disabled={!subscription.active || testingId !== null}
                          className="btn-secondary text-[11px] px-2 py-2 disabled:opacity-50"
                        >
                          <Send className={`w-3 h-3 ${testingId === subscription.id ? 'animate-pulse' : ''}`} /> Test
                        </button>
                        <button type="button" onClick={() => void handleRotateSecret(subscription)} className="btn-secondary text-[11px] px-2 py-2">
                          <RotateCcw className="w-3 h-3" /> Rotate key
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleSubscription(subscription)}
                          className={`text-[11px] px-2 py-2 rounded-lg border font-bold transition-colors ${
                            subscription.active
                              ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                          }`}
                        >
                          {subscription.active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {isGeneralManager && activeTab === 'deliveries' && (
        <section
          id="platform-panel-deliveries"
          role="tabpanel"
          aria-labelledby="platform-tab-deliveries"
          className="space-y-4"
        >
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="glass-panel p-5 xl:col-span-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" /> Delivery attempt ledger
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Every send is recorded separately. Failed deliveries are retried with bounded exponential backoff.
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void loadDeliveries()} disabled={deliveriesLoading} className="btn-secondary text-xs px-3 py-2 disabled:opacity-60">
                  <RefreshCw className={`w-3.5 h-3.5 ${deliveriesLoading ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <button type="button" onClick={() => void handleProcessDeliveries()} disabled={processingDeliveries} className="btn-primary text-xs px-3 py-2 disabled:opacity-60">
                  <ListRestart className="w-3.5 h-3.5" /> {processingDeliveries ? 'Processing…' : 'Process due'}
                </button>
              </div>
            </div>

            <div className="glass-panel p-5">
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Last worker run</div>
              {lastDeliverySummary ? (
                <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                  {([
                    ['Claimed', lastDeliverySummary.claimed],
                    ['Success', lastDeliverySummary.succeeded],
                    ['Failed', lastDeliverySummary.failed],
                    ['Retried', lastDeliverySummary.retried],
                  ] as const).map(([label, value]) => (
                    <div key={label}>
                      <div className="text-base font-extrabold text-gray-100">{value}</div>
                      <div className="text-[9px] uppercase text-gray-500">{label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 mt-2">No delivery batch has been run in this session.</p>
              )}
            </div>
          </div>

          <div className="glass-panel p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Status
                <select
                  value={deliveryStatus}
                  onChange={(event) => setDeliveryStatus(event.target.value as 'all' | DeliveryStatus)}
                  className="block mt-1.5 min-w-44 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-gray-200 normal-case tracking-normal outline-none focus:border-amber-400"
                >
                  <option value="all">All attempts</option>
                  <option value="Pending">Pending</option>
                  <option value="Delivering">Delivering</option>
                  <option value="Succeeded">Succeeded</option>
                  <option value="Failed">Failed</option>
                </select>
              </label>
              <div className="text-xs text-gray-500">Showing {filteredDeliveries.length} of {deliveries.length} recent attempts</div>
            </div>

            {deliveriesLoading && deliveries.length === 0 ? (
              <div role="status" className="py-12 flex items-center justify-center text-sm text-gray-400">
                <RefreshCw className="w-4 h-4 mr-2 animate-spin text-amber-400" /> Loading delivery attempts…
              </div>
            ) : filteredDeliveries.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">No delivery attempts match this status.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[920px] text-xs">
                  <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-3 py-3 text-left font-bold">Status</th>
                      <th className="px-3 py-3 text-left font-bold">Event</th>
                      <th className="px-3 py-3 text-left font-bold">Destination</th>
                      <th className="px-3 py-3 text-left font-bold">Attempt</th>
                      <th className="px-3 py-3 text-left font-bold">Response</th>
                      <th className="px-3 py-3 text-left font-bold">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeliveries.map((attempt) => (
                      <tr key={attempt.id} className="border-t border-white/5 hover:bg-white/[0.03] align-top">
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${deliveryStyle[attempt.status]}`}>
                            {attempt.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono text-gray-200">{attempt.eventType}</div>
                          <div className="text-[10px] text-gray-600 mt-1 font-mono" title={attempt.eventId}>{compactHash(attempt.eventId)}</div>
                        </td>
                        <td className="px-3 py-3 max-w-xs">
                          <div className="text-gray-300 truncate" title={attempt.subscriptionUrl}>{describeDestination(attempt.subscriptionUrl)}</div>
                          <div className="text-[10px] text-gray-600 mt-1 font-mono truncate" title={attempt.subscriptionId}>{attempt.subscriptionId}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-gray-200">#{attempt.attemptNumber}</div>
                          <div className="text-[10px] text-gray-600 mt-1 font-mono">{attempt.signatureVersion || 'unsigned'}</div>
                        </td>
                        <td className="px-3 py-3 max-w-sm">
                          <div className={attempt.responseStatus && attempt.responseStatus >= 200 && attempt.responseStatus < 300 ? 'text-emerald-300' : 'text-gray-300'}>
                            {attempt.responseStatus ? `HTTP ${attempt.responseStatus}` : 'No HTTP response'}
                          </div>
                          {(attempt.error || attempt.responseBody) && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[10px] text-amber-300">View detail</summary>
                              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] text-gray-500">{attempt.error || attempt.responseBody}</pre>
                            </details>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-400 whitespace-nowrap">{formatDateTime(attempt.completedAt || attempt.scheduledAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

interface SubscriptionFieldsProps {
  draft: SubscriptionDraft;
  onChange: (draft: SubscriptionDraft) => void;
  prefix: string;
}

const SubscriptionFields: React.FC<SubscriptionFieldsProps> = ({ draft, onChange, prefix }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <label htmlFor={`${prefix}-url`} className="text-[11px] font-bold uppercase tracking-wider text-gray-400 lg:col-span-2">
      HTTPS destination
      <input
        id={`${prefix}-url`}
        type="url"
        required
        autoComplete="url"
        placeholder="https://integrations.example.com/nexushos"
        value={draft.url}
        onChange={(event) => onChange({ ...draft, url: event.target.value })}
        className="block mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-gray-200 normal-case tracking-normal outline-none focus:border-amber-400"
      />
    </label>
    <label htmlFor={`${prefix}-description`} className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
      Description
      <input
        id={`${prefix}-description`}
        maxLength={500}
        placeholder="Revenue data warehouse"
        value={draft.description}
        onChange={(event) => onChange({ ...draft, description: event.target.value })}
        className="block mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-gray-200 normal-case tracking-normal outline-none focus:border-amber-400"
      />
    </label>
    <label htmlFor={`${prefix}-events`} className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
      Event types
      <input
        id={`${prefix}-events`}
        required
        placeholder="reservation.*, folio.posted"
        value={draft.eventTypes}
        onChange={(event) => onChange({ ...draft, eventTypes: event.target.value })}
        aria-describedby={`${prefix}-events-help`}
        className="block mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs font-mono text-gray-200 normal-case tracking-normal outline-none focus:border-amber-400"
      />
      <span id={`${prefix}-events-help`} className="block mt-1 text-[10px] normal-case tracking-normal font-normal text-gray-500">
        Comma-separated exact types or wildcards such as reservation.*
      </span>
    </label>
  </div>
);
