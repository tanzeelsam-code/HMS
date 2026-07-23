import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  Copy,
  Database,
  Download,
  FileJson,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  Webhook,
  Workflow,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api';

type PortalTab = 'overview' | 'api' | 'events' | 'webhooks';

interface DeveloperStatus {
  contractVersion: string;
  generatedAt: string;
  businessDate: string;
  environment: string;
  actor: {
    role: string;
    authenticatedBy: string;
    grantedPlatformScopes: string[];
  };
  authentication: {
    cookie: { ready: boolean; name: string; httpOnly: boolean; sameSite: string };
    bearer: { ready: boolean; format: string };
    sessionTtlHours: number;
  };
  database: {
    ready: boolean;
    driver: string;
    schemaMigrationsVersioned: boolean;
  };
  openApi: {
    ready: boolean;
    version: string;
    format: string;
    url: string;
    uriVersioned: boolean;
    documentedOperations: number;
    documentedSurface: string[];
  };
  webhooks: {
    schemaReady: boolean;
    emittedEventTypes: string[];
    signature: string;
    encryptionKey: string;
    subscriptionEndpointsReady: boolean;
    manualDrainEndpointReady: boolean;
    backgroundDeliveryWorkerStartedByThisServer: boolean;
  };
  workflows: {
    schemaReady: boolean;
    eventTriggers: string[];
    versionedTemplates: boolean;
    idempotentRuns: boolean;
    approvalGates: boolean;
  };
  audit: {
    schemaReady: boolean;
    appendOnlyChain: boolean;
    signingKey: string;
  };
  http: {
    credentialedCors: boolean;
    configuredOriginCount: number;
    requestIds: boolean;
    authenticatedRateLimit: string;
    publicBookingRateLimit: string;
  };
  limitations: string[];
}

interface EventPayloadContract {
  required: string[];
  optional: string[];
}

interface OutboundEvent {
  type: string;
  description: string;
  emittedBy: string[];
  payload: EventPayloadContract;
}

interface WorkflowEventTrigger {
  type: string;
  description: string;
  dispatchedBy: string[];
  contextFields: string[];
}

interface EventCatalog {
  catalogVersion: string;
  generatedAt: string;
  transport: {
    protocol: string;
    contentType: string;
    envelope: { fields: string[]; payloadVersionField: boolean };
    headers: string[];
    signature: {
      version: string;
      algorithm: string;
      signedInput: string;
      headerFormat: string;
      recommendedToleranceSeconds: number;
    };
    retryPolicy: {
      successStatuses: string;
      defaultMaximumAttempts: number;
      initialDelaySeconds: number;
      strategy: string;
    };
    currentDeliveryMode: string;
  };
  outboundEvents: OutboundEvent[];
  workflowEventTriggers: WorkflowEventTrigger[];
}

interface ApiParameter {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
}

interface ApiOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: ApiParameter[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  'x-required-roles'?: string[];
  'x-required-scopes'?: string[];
}

interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    summary?: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, ApiOperation>>;
}

interface OperationView extends ApiOperation {
  method: string;
  path: string;
  tag: string;
}

interface DeveloperPortalProps {
  openApiUrl?: string;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

const METHOD_STYLE: Record<string, string> = {
  GET: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  POST: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  PUT: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  PATCH: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  DELETE: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

const WEBHOOK_CREATE_SNIPPET = `curl -X POST "$NEXUSHOS_URL/api/platform/webhooks" \\
  -H "Authorization: Bearer $NEXUSHOS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/webhooks/nexushos",
    "description": "Reservation events",
    "eventTypes": ["reservation.created"]
  }'`;

const WEBHOOK_TEST_SNIPPET = `curl -X POST \\
  "$NEXUSHOS_URL/api/platform/webhooks/$SUBSCRIPTION_ID/test" \\
  -H "Authorization: Bearer $NEXUSHOS_TOKEN"`;

const WEBHOOK_DRAIN_SNIPPET = `curl -X POST \\
  "$NEXUSHOS_URL/api/platform/webhook-deliveries/process" \\
  -H "Authorization: Bearer $NEXUSHOS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"limit": 25}'`;

const VERIFY_SIGNATURE_SNIPPET = `import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyNexusWebhook(rawBody, headers, secret) {
  const timestamp = headers['x-nexus-timestamp'];
  const deliveryId = headers['x-nexus-delivery-id'];
  const supplied = headers['x-nexus-signature'] || '';
  const signed = timestamp + '.' + deliveryId + '.' + rawBody;
  const expected = 'v1=' + createHmac('sha256', secret)
    .update(signed)
    .digest('hex');

  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}`;

const formatDateTime = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
};

const titleCase = (value: string) => value
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[-_]/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const badgeStyle = (ready: boolean) => ready
  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  : 'border-amber-500/30 bg-amber-500/10 text-amber-300';

const ReadinessCard: React.FC<{
  icon: LucideIcon;
  label: string;
  detail: string;
  ready: boolean;
}> = ({ icon: Icon, label, detail, ready }) => (
  <article className="glass-card rounded-2xl p-4">
    <div className="flex items-start justify-between gap-3">
      <span className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-gray-300">
        <Icon size={18} />
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${badgeStyle(ready)}`}>
        {ready ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
        {ready ? 'Ready' : 'Attention'}
      </span>
    </div>
    <h3 className="mt-4 text-sm font-bold text-gray-100">{label}</h3>
    <p className="mt-1 text-xs leading-5 text-gray-500">{detail}</p>
  </article>
);

const CodeBlock: React.FC<{
  label: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}> = ({ label, code, copied, onCopy }) => (
  <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#080b12]">
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
        <Terminal size={13} /> {label}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-400 transition hover:bg-white/5 hover:text-gray-100"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
    <pre className="overflow-x-auto p-4 text-xs leading-6 text-slate-300"><code>{code}</code></pre>
  </div>
);

export const DeveloperPortal: React.FC<DeveloperPortalProps> = ({
  openApiUrl = '/openapi.json',
}) => {
  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [status, setStatus] = useState<DeveloperStatus | null>(null);
  const [catalog, setCatalog] = useState<EventCatalog | null>(null);
  const [openApi, setOpenApi] = useState<OpenApiDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('All');
  const [copiedKey, setCopiedKey] = useState('');

  const loadPortal = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const specRequest = api.get<OpenApiDocument>(openApiUrl);
      const [nextStatus, nextCatalog, nextOpenApi] = await Promise.all([
        api.get<DeveloperStatus>('/developer/status'),
        api.get<EventCatalog>('/developer/events/catalog'),
        specRequest,
      ]);
      setStatus(nextStatus);
      setCatalog(nextCatalog);
      setOpenApi(nextOpenApi);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Developer resources could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [openApiUrl]);

  useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  const operations = useMemo<OperationView[]>(() => {
    if (!openApi) return [];
    return Object.entries(openApi.paths).flatMap(([path, pathItem]) =>
      Object.entries(pathItem)
        .filter(([method]) => HTTP_METHODS.has(method.toLowerCase()))
        .map(([method, operation]) => ({
          ...operation,
          method: method.toUpperCase(),
          path,
          tag: operation.tags?.[0] || 'Other',
        })),
    );
  }, [openApi]);

  const tags = useMemo(() => ['All', ...Array.from(new Set(operations.map((operation) => operation.tag)))], [operations]);

  const filteredOperations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return operations.filter((operation) => {
      if (tagFilter !== 'All' && operation.tag !== tagFilter) return false;
      if (!needle) return true;
      return [operation.method, operation.path, operation.summary, operation.description, operation.tag]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [operations, search, tagFilter]);

  const publicOperationCount = operations.filter((operation) => !operation.security?.length).length;

  const copyCode = async (key: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => current === key ? '' : current), 1800);
    } catch {
      setCopiedKey('blocked');
    }
  };

  const downloadOpenApi = () => {
    if (!openApi) return;
    const blob = new Blob([`${JSON.stringify(openApi, null, 2)}\n`], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `nexushos-openapi-${openApi.info.version}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  };

  const tabs: Array<{ id: PortalTab; label: string; icon: LucideIcon }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'api', label: 'API reference', icon: Code2 },
    { id: 'events', label: 'Event catalog', icon: Workflow },
    { id: 'webhooks', label: 'Webhook quick-start', icon: Webhook },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center p-6" role="status">
        <div className="text-center">
          <RefreshCw size={30} className="mx-auto animate-spin text-amber-300" />
          <p className="mt-4 text-sm font-semibold text-gray-300">Loading the live API contract…</p>
          <p className="mt-1 text-xs text-gray-600">OpenAPI, events, and environment readiness</p>
        </div>
      </div>
    );
  }

  if (error || !status || !catalog || !openApi) {
    return (
      <div className="flex min-h-[520px] items-center justify-center p-6">
        <div className="glass-panel max-w-lg p-7 text-center">
          <XCircle size={34} className="mx-auto text-rose-400" />
          <h2 className="mt-4 text-lg font-bold text-gray-100">Developer resources are unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">{error || 'The API returned an incomplete discovery response.'}</p>
          <button type="button" onClick={() => void loadPortal()} className="btn-primary mt-5">
            <RefreshCw size={15} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 md:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.09] via-slate-900/80 to-sky-500/[0.06] p-5 shadow-2xl md:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-300/[0.08] blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-300">
                <FileJson size={13} /> OpenAPI {openApi.openapi}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                Contract v{status.contractVersion}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                {status.environment}
              </span>
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-white md:text-3xl">
              NexusHOS <span className="text-gold-gradient">Developer Portal</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Live contracts for the implemented booking, platform, webhook, and workflow surfaces—plus the operational readiness facts needed to integrate safely.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadPortal()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs font-bold text-gray-300 transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              <RefreshCw size={15} /> Refresh
            </button>
            <button type="button" onClick={downloadOpenApi} className="btn-primary text-xs">
              <Download size={15} /> Download OpenAPI
            </button>
          </div>
        </div>
      </header>

      <nav className="mt-5 overflow-x-auto" aria-label="Developer portal sections">
        <div className="inline-flex min-w-full gap-1 rounded-2xl border border-white/10 bg-white/[0.025] p-1.5 sm:min-w-0" role="tablist">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                activeTab === id
                  ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20'
                  : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-200'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mt-5">
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Environment readiness">
              <ReadinessCard icon={FileJson} label="OpenAPI contract" detail={`${status.openApi.documentedOperations} implemented operations`} ready={status.openApi.ready} />
              <ReadinessCard icon={Database} label="Database" detail={status.database.driver} ready={status.database.ready} />
              <ReadinessCard icon={Webhook} label="Webhook schema" detail={`${status.webhooks.emittedEventTypes.length} outbound event types`} ready={status.webhooks.schemaReady} />
              <ReadinessCard icon={Workflow} label="Workflow engine" detail={`${status.workflows.eventTriggers.length} event triggers`} ready={status.workflows.schemaReady} />
              <ReadinessCard icon={ShieldCheck} label="Audit evidence" detail="Append-only HMAC chain" ready={status.audit.schemaReady && status.audit.appendOnlyChain} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
              <article className="glass-panel p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-sky-500/10 p-2.5 text-sky-300"><KeyRound size={18} /></span>
                  <div>
                    <h2 className="text-base font-bold text-gray-100">Authentication & transport</h2>
                    <p className="text-xs text-gray-500">One session, two supported client transports</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-200"><LockKeyhole size={15} className="text-amber-300" /> Browser cookie</div>
                    <p className="mt-2 text-xs leading-5 text-gray-500">HttpOnly <code className="text-gray-300">{status.authentication.cookie.name}</code>, SameSite={status.authentication.cookie.sameSite}. Sent automatically by this same-origin portal.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-200"><Terminal size={15} className="text-sky-300" /> Bearer token</div>
                    <p className="mt-2 text-xs leading-5 text-gray-500">Opaque token returned by <code className="text-gray-300">POST /api/auth/login</code>. Both session forms expire after {status.authentication.sessionTtlHours} hours.</p>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-black/15 p-3"><dt className="text-gray-600">Signed in as</dt><dd className="mt-1 font-semibold text-gray-300">{status.actor.role}</dd></div>
                  <div className="rounded-xl bg-black/15 p-3"><dt className="text-gray-600">Auth transport</dt><dd className="mt-1 font-semibold text-gray-300">{status.actor.authenticatedBy}</dd></div>
                  <div className="rounded-xl bg-black/15 p-3"><dt className="text-gray-600">Business date</dt><dd className="mt-1 font-semibold text-gray-300">{status.businessDate}</dd></div>
                  <div className="rounded-xl bg-black/15 p-3"><dt className="text-gray-600">Allowed origins</dt><dd className="mt-1 font-semibold text-gray-300">{status.http.configuredOriginCount}</dd></div>
                </dl>
              </article>

              <aside className="glass-panel p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-300"><AlertTriangle size={18} /></span>
                  <div>
                    <h2 className="text-base font-bold text-gray-100">Current boundaries</h2>
                    <p className="text-xs text-gray-500">Visible by design, not hidden in marketing copy</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-3">
                  {status.limitations.map((limitation) => (
                    <li key={limitation} className="flex gap-2.5 text-xs leading-5 text-gray-400">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" /> {limitation}
                    </li>
                  ))}
                </ul>
              </aside>
            </section>

            <section className="glass-panel p-5">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <h2 className="text-sm font-bold text-gray-100">Documented surface</h2>
                  <p className="mt-1 text-xs text-gray-500">The contract is deliberately scoped to implemented discovery and integration endpoints.</p>
                </div>
                <span className="text-[11px] text-gray-600">Readiness sampled {formatDateTime(status.generatedAt)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {status.openApi.documentedSurface.map((surface) => (
                  <span key={surface} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-gray-400">{titleCase(surface)}</span>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-4">
            <section className="glass-panel p-4 md:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-bold text-gray-100"><BookOpen size={18} className="text-amber-300" /> API reference</h2>
                  <p className="mt-1 text-xs text-gray-500">{operations.length} documented operations · {publicOperationCount} public · {operations.length - publicOperationCount} authenticated</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="relative min-w-[260px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <span className="sr-only">Search API operations</span>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search paths or operations"
                      className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-xs text-gray-200 outline-none transition placeholder:text-gray-700 focus:border-amber-400/40"
                    />
                  </label>
                  <label>
                    <span className="sr-only">Filter by API tag</span>
                    <select
                      value={tagFilter}
                      onChange={(event) => setTagFilter(event.target.value)}
                      className="h-full min-h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-xs font-semibold text-gray-300 outline-none focus:border-amber-400/40"
                    >
                      {tags.map((tag) => <option key={tag}>{tag}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            </section>

            <section className="space-y-2" aria-live="polite">
              {filteredOperations.length === 0 && (
                <div className="glass-panel p-10 text-center text-sm text-gray-500">No operations match the current filters.</div>
              )}
              {filteredOperations.map((operation) => {
                const securedOperation = !!operation.security?.length;
                const headerParameters = operation.parameters?.filter((parameter) => parameter.in === 'header') || [];
                return (
                  <details key={`${operation.method}:${operation.path}`} className="group glass-card overflow-hidden rounded-2xl">
                    <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <span className={`w-fit min-w-[68px] rounded-lg border px-2.5 py-1.5 text-center font-mono text-[11px] font-black ${METHOD_STYLE[operation.method] || 'border-white/10 bg-white/5 text-gray-300'}`}>{operation.method}</span>
                      <code className="min-w-0 flex-1 break-all text-xs font-semibold text-gray-200 sm:text-sm">{operation.path}</code>
                      <span className="text-xs text-gray-500 sm:max-w-[36%] sm:text-right">{operation.summary || operation.operationId}</span>
                      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${securedOperation ? 'border-violet-500/30 bg-violet-500/10 text-violet-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                        {securedOperation ? <LockKeyhole size={11} /> : <CheckCircle2 size={11} />}
                        {securedOperation ? 'Auth' : 'Public'}
                      </span>
                    </summary>
                    <div className="border-t border-white/10 bg-black/10 p-4 sm:p-5">
                      <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">{operation.tag}</span>
                          <p className="mt-2 max-w-3xl text-xs leading-6 text-gray-400">{operation.description || operation.summary || 'No additional description.'}</p>
                          {headerParameters.length > 0 && (
                            <div className="mt-4">
                              <h3 className="text-xs font-bold text-gray-300">Header contract</h3>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {headerParameters.map((parameter) => (
                                  <span key={parameter.name} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-2.5 py-1.5 font-mono text-[11px] text-amber-200">
                                    {parameter.name}{parameter.required ? ' · required' : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <dl className="min-w-[220px] space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
                          <div><dt className="text-gray-600">Operation ID</dt><dd className="mt-1 font-mono text-gray-300">{operation.operationId || '—'}</dd></div>
                          <div><dt className="text-gray-600">Required roles</dt><dd className="mt-1 text-gray-300">{operation['x-required-roles']?.join(', ') || 'Not role-specific'}</dd></div>
                          <div><dt className="text-gray-600">Required scopes</dt><dd className="mt-1 text-gray-300">{operation['x-required-scopes']?.join(', ') || 'None declared'}</dd></div>
                          <div><dt className="text-gray-600">Request body</dt><dd className="mt-1 text-gray-300">{operation.requestBody ? 'JSON contract defined' : 'None'}</dd></div>
                          <div><dt className="text-gray-600">Responses</dt><dd className="mt-1 font-mono text-gray-300">{Object.keys(operation.responses || {}).join(', ') || '—'}</dd></div>
                        </dl>
                      </div>
                    </div>
                  </details>
                );
              })}
            </section>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-5">
            <section className="grid gap-4 lg:grid-cols-3">
              <article className="glass-panel p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-100"><ShieldCheck size={17} className="text-emerald-300" /> Signature</div>
                <p className="mt-3 text-xs leading-5 text-gray-500">{catalog.transport.signature.algorithm} over <code className="text-gray-300">{catalog.transport.signature.signedInput}</code></p>
                <p className="mt-2 font-mono text-[11px] text-emerald-300">{catalog.transport.signature.headerFormat}</p>
              </article>
              <article className="glass-panel p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-100"><RefreshCw size={17} className="text-sky-300" /> Delivery retry</div>
                <p className="mt-3 text-xs leading-5 text-gray-500">{catalog.transport.retryPolicy.defaultMaximumAttempts} attempts, starting after {catalog.transport.retryPolicy.initialDelaySeconds}s, with {catalog.transport.retryPolicy.strategy}.</p>
              </article>
              <article className="glass-panel p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-100"><Server size={17} className="text-amber-300" /> Current worker mode</div>
                <p className="mt-3 text-xs leading-5 text-gray-500">{catalog.transport.currentDeliveryMode}</p>
              </article>
            </section>

            <section>
              <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <h2 className="text-base font-bold text-gray-100">Outbound webhook events</h2>
                  <p className="mt-1 text-xs text-gray-500">Committed product events currently enqueued for subscribed destinations.</p>
                </div>
                <span className="text-xs font-semibold text-gray-600">Catalog v{catalog.catalogVersion}</span>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {catalog.outboundEvents.map((event) => (
                  <article key={event.type} className="glass-card rounded-2xl p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="rounded-lg bg-violet-500/10 px-2.5 py-1.5 text-xs font-bold text-violet-300">{event.type}</code>
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">Webhook</span>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-gray-400">{event.description}</p>
                    <div className="mt-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">Emitted by</h3>
                      <div className="mt-2 flex flex-wrap gap-1.5">{event.emittedBy.map((source) => <code key={source} className="rounded-md bg-black/20 px-2 py-1 text-[10px] text-gray-400">{source}</code>)}</div>
                    </div>
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">Required data</h3>
                      <div className="mt-2 flex flex-wrap gap-1.5">{event.payload.required.map((field) => <code key={field} className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-1 text-[10px] text-emerald-300">{field}</code>)}</div>
                      {event.payload.optional.length > 0 && <p className="mt-2 text-[10px] text-gray-600">Optional: {event.payload.optional.join(', ')}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-3">
                <h2 className="text-base font-bold text-gray-100">Workflow trigger events</h2>
                <p className="mt-1 text-xs text-gray-500">Internal events that can start matching active workflow templates.</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {catalog.workflowEventTriggers.map((trigger) => (
                  <article key={trigger.type} className="glass-panel p-5">
                    <code className="text-sm font-bold text-sky-300">{trigger.type}</code>
                    <p className="mt-2 text-xs leading-5 text-gray-400">{trigger.description}</p>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">Context</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">{trigger.contextFields.map((field) => <code key={field} className="rounded-md bg-sky-500/[0.07] px-2 py-1 text-[10px] text-sky-300">{field}</code>)}</div>
                    <p className="mt-3 text-[10px] text-gray-600">Dispatch: {trigger.dispatchedBy.join('; ')}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'webhooks' && (
          <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
            <section className="space-y-3">
              <div className="glass-panel p-5">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-300"><Webhook size={18} /></span>
                  <div>
                    <h2 className="text-base font-bold text-gray-100">Integration checklist</h2>
                    <p className="text-xs text-gray-500">From subscription to verified delivery</p>
                  </div>
                </div>
                <ol className="mt-5 space-y-4">
                  {[
                    ['Create a subscription', 'Use a public HTTPS endpoint and select only the event types you consume. Requires platform:webhooks:write.'],
                    ['Store the signing secret', 'The secret is returned once on create or rotation. Store it outside source control.'],
                    ['Verify before parsing', 'Use the untouched request bytes, timestamp, and delivery ID. Reject stale timestamps and compare digests in constant time.'],
                    ['Test and process', 'Queue a test, then invoke the operator drain. A dedicated background worker is not started by this API server.'],
                  ].map(([title, detail], index) => (
                    <li key={title} className="flex gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-xs font-black text-amber-300">{index + 1}</span>
                      <div><h3 className="text-xs font-bold text-gray-200">{title}</h3><p className="mt-1 text-xs leading-5 text-gray-500">{detail}</p></div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-5">
                <div className="flex gap-3">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-100">Operational ownership required</h3>
                    <p className="mt-1 text-xs leading-5 text-amber-100/60">The process endpoint is deliberately bounded to 100 due deliveries. Production needs a supervised worker or scheduler that calls the delivery engine continuously.</p>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-100"><Clipboard size={16} className="text-sky-300" /> Delivery headers</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {catalog.transport.headers.map((header) => <code key={header} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-gray-400">{header}</code>)}
                </div>
                <p className="mt-3 text-xs leading-5 text-gray-600">Accept {catalog.transport.retryPolicy.successStatuses}. Recommended replay window: {catalog.transport.signature.recommendedToleranceSeconds} seconds.</p>
              </div>
            </section>

            <section className="space-y-4">
              {copiedKey === 'blocked' && (
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3 text-xs text-rose-300">Clipboard access was blocked. Select the code manually.</div>
              )}
              <CodeBlock label="1 · Create subscription" code={WEBHOOK_CREATE_SNIPPET} copied={copiedKey === 'create'} onCopy={() => void copyCode('create', WEBHOOK_CREATE_SNIPPET)} />
              <CodeBlock label="2 · Verify HMAC in Node.js" code={VERIFY_SIGNATURE_SNIPPET} copied={copiedKey === 'verify'} onCopy={() => void copyCode('verify', VERIFY_SIGNATURE_SNIPPET)} />
              <div className="grid gap-4 lg:grid-cols-2">
                <CodeBlock label="3 · Queue test" code={WEBHOOK_TEST_SNIPPET} copied={copiedKey === 'test'} onCopy={() => void copyCode('test', WEBHOOK_TEST_SNIPPET)} />
                <CodeBlock label="4 · Process due deliveries" code={WEBHOOK_DRAIN_SNIPPET} copied={copiedKey === 'drain'} onCopy={() => void copyCode('drain', WEBHOOK_DRAIN_SNIPPET)} />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default DeveloperPortal;
