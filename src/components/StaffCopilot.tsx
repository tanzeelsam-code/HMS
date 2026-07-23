import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Database,
  Lightbulb,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../api';
import { AiOperationsBriefing, CopilotResponse } from '../types';
import { ActiveTab } from './Sidebar';

interface StaffCopilotProps {
  onDataChanged: () => void | Promise<void>;
  onNavigate: (tab: ActiveTab) => void;
  userName: string;
  userRole: string;
}

interface ChatMessage {
  sender: 'user' | 'copilot';
  text: string;
  source?: 'openai' | 'rules';
}

interface PendingAction {
  message: string;
  proposals: string[];
}

const routeLabels: Record<string, string> = {
  reservations: 'Reservations',
  housekeeping: 'Housekeeping',
  maintenance: 'Maintenance',
  procurement: 'Procurement',
  'ai-revenue': 'Revenue management',
  'tape-chart': 'Room plan',
};

export const StaffCopilot: React.FC<StaffCopilotProps> = ({
  onDataChanged,
  onNavigate,
  userName,
  userRole,
}) => {
  const [briefing, setBriefing] = useState<AiOperationsBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'copilot',
      text: `Hello ${userName.split(' ')[0]}. I can explain live property conditions, create a shift handover, and prepare operational changes. Any database change will be shown for your approval before it runs.`,
      source: 'rules',
    },
  ]);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [thinking, setThinking] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const basePrompts = [
    'What needs attention right now?',
    'Draft the morning shift handover',
    'What is occupancy today?',
    ...(userRole === 'Housekeeping' ? ['Clean floor 1'] : []),
    ...(['General Manager', 'Finance'].includes(userRole) ? ['Explain today’s revenue position'] : []),
    ...(['General Manager', 'Front Desk'].includes(userRole) ? ['Assign VIP arrivals to high floors'] : []),
  ];

  const loadBriefing = useCallback(async () => {
    setBriefingLoading(true);
    setBriefingError('');
    try {
      setBriefing(await api.get<AiOperationsBriefing>('/ai/briefing'));
    } catch (error) {
      setBriefingError(error instanceof Error ? error.message : 'Could not prepare the briefing');
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking, pendingAction]);

  const runQuery = async (queryText: string, confirmActions = false, appendUser = true) => {
    if (!queryText.trim() || thinking) return;
    const text = queryText.trim();
    setInputQuery('');
    setPendingAction(null);
    if (appendUser) setMessages((previous) => [...previous, { sender: 'user', text }]);
    setThinking(true);

    try {
      const response = await api.post<CopilotResponse>('/ai/copilot', {
        message: text,
        confirmActions,
      });
      setMessages((previous) => [...previous, {
        sender: 'copilot',
        text: response.reply || response.answer || 'Request processed.',
        source: response.generatedBy,
      }]);
      if (response.requiresConfirmation && response.proposedActions?.length) {
        setPendingAction({
          message: response.confirmationMessage || text,
          proposals: response.proposedActions,
        });
      }
      if (response.suggestedFollowUps?.length) {
        setSuggestedPrompts(response.suggestedFollowUps);
      }
      if (response.actions?.length) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setActionLog((previous) => [
          ...response.actions!.map((action) => `${timestamp} — ${action}`),
          ...previous,
        ]);
        await onDataChanged();
        await loadBriefing();
      }
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          sender: 'copilot',
          text: `I could not complete that request: ${error instanceof Error ? error.message : 'Copilot request failed'}`,
          source: 'rules',
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const visiblePrompts = [...suggestedPrompts, ...basePrompts]
    .filter((prompt, index, prompts) => prompts.indexOf(prompt) === index)
    .slice(0, 6);

  return (
    <div className="page-shell animate-slide-up">
      <header className="page-header">
        <div>
          <div className="page-eyebrow">AI operations</div>
          <h1 className="page-title">Property intelligence and copilot</h1>
          <p className="page-subtitle">
            A grounded daily briefing, natural-language analysis, and approval-controlled operational actions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="status-pill badge-occupied">
            <ShieldCheck className="h-3.5 w-3.5" />
            Role-safe data
          </span>
          <span className="status-pill badge-vacant">
            <Database className="h-3.5 w-3.5" />
            Live property context
          </span>
        </div>
      </header>

      <section className="surface-panel overflow-hidden" aria-labelledby="ai-briefing-title">
        <div className="flex flex-col gap-4 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="ai-briefing-title" className="section-heading flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-amber-300" />
                Daily operations briefing
              </h2>
              {briefing && (
                <span className={`status-pill ${briefing.generatedBy === 'openai' ? 'badge-reserved' : 'badge-vacant'}`}>
                  {briefing.generatedBy === 'openai' ? `Enhanced AI · ${briefing.model}` : 'Verified rules'}
                </span>
              )}
            </div>
            <p className="section-copy">Generated only from aggregate live property data available to your role.</p>
          </div>
          <button type="button" onClick={() => void loadBriefing()} disabled={briefingLoading} className="btn-secondary">
            <RefreshCw className={`h-4 w-4 ${briefingLoading ? 'animate-spin' : ''}`} />
            Refresh briefing
          </button>
        </div>

        {briefingLoading && (
          <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-400" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
            Reading the current property picture…
          </div>
        )}
        {briefingError && (
          <div className="m-5 flex items-start gap-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-200" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {briefingError}
          </div>
        )}
        {briefing && !briefingLoading && (
          <div className="p-5 sm:p-6">
            <p className="max-w-4xl text-base font-medium leading-7 text-slate-200">{briefing.summary}</p>
            {briefing.providerNotice && <p className="mt-2 text-xs text-amber-200">{briefing.providerNotice}</p>}
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {briefing.priorities.map((priority) => (
                <button
                  type="button"
                  key={`${priority.route}-${priority.title}`}
                  onClick={() => onNavigate(priority.route as ActiveTab)}
                  className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-left transition-colors hover:border-amber-300/25 hover:bg-white/[0.045]"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      priority.urgency === 'critical' ? 'bg-rose-400' : priority.urgency === 'high' ? 'bg-amber-300' : 'bg-blue-400'
                    }`} />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm font-semibold text-slate-100">{priority.title}</strong>
                      <span className="mt-1 block text-xs leading-5 text-slate-400">{priority.reason}</span>
                      <span className="mt-3 block text-xs font-medium text-slate-200">{priority.nextStep}</span>
                      <span className="mt-3 flex flex-wrap gap-1.5">
                        {priority.evidence.map((evidence) => (
                          <span key={evidence} className="rounded-full bg-white/[0.045] px-2 py-1 text-[10px] text-slate-500">{evidence}</span>
                        ))}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-200">
                      {routeLabels[priority.route] || 'Open'}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {briefing.opportunities.length > 0 && (
              <div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.045] p-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">
                  <Lightbulb className="h-4 w-4" />
                  Opportunities
                </h3>
                <ul className="mt-3 grid gap-2 text-xs leading-5 text-slate-300 md:grid-cols-2">
                  {briefing.opportunities.map((opportunity) => <li key={opportunity}>• {opportunity}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="surface-panel flex min-h-[590px] flex-col p-5" aria-labelledby="copilot-chat-title">
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-4">
            <div>
              <h2 id="copilot-chat-title" className="section-heading flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-300" />
                Ask the property copilot
              </h2>
              <p className="section-copy">Analysis is read-only. Operational changes always require your approval.</p>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto py-5 pr-1">
            {messages.map((message, index) => (
              <div key={`${message.sender}-${index}`} className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.sender === 'copilot' && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-300/[0.08] text-amber-300">
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-xs leading-5 ${
                  message.sender === 'user'
                    ? 'rounded-tr-sm bg-amber-300 font-medium text-slate-950'
                    : 'rounded-tl-sm border border-white/[0.08] bg-[#0d1522] text-slate-200'
                }`}>
                  {message.text}
                  {message.sender === 'copilot' && message.source && (
                    <span className="mt-2 block text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      {message.source === 'openai' ? 'Enhanced AI · grounded response' : 'Verified operational logic'}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex items-center gap-2 text-xs font-medium text-amber-200" role="status">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reviewing live property evidence…
              </div>
            )}
            {pendingAction && (
              <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-100">Approval required</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Nothing has changed yet. Review what will happen:</p>
                    <ul className="mt-3 space-y-2 text-xs text-slate-200">
                      {pendingAction.proposals.map((proposal) => <li key={proposal}>• {proposal}</li>)}
                    </ul>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void runQuery(pendingAction.message, true, false)}
                        className="btn-primary"
                      >
                        <Zap className="h-4 w-4" />
                        Approve and run
                      </button>
                      <button type="button" onClick={() => setPendingAction(null)} className="btn-secondary">
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          <div className="border-t border-white/[0.07] pt-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {visiblePrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void runQuery(prompt)}
                  disabled={thinking}
                  className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-left text-[10px] font-medium text-slate-400 transition-colors hover:border-amber-300/25 hover:text-amber-200 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void runQuery(inputQuery);
              }}
            >
              <label htmlFor="ai-copilot-input" className="sr-only">Ask the property copilot</label>
              <input
                id="ai-copilot-input"
                type="text"
                placeholder="Ask about today, request a handover, or prepare an action…"
                value={inputQuery}
                onChange={(event) => setInputQuery(event.target.value)}
                disabled={thinking}
                className="field-control flex-1"
              />
              <button type="submit" disabled={thinking || !inputQuery.trim()} className="btn-primary">
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Ask</span>
              </button>
            </form>
          </div>
        </section>

        <aside className="surface-panel p-5" aria-labelledby="ai-action-log-title">
          <h2 id="ai-action-log-title" className="section-heading flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-300" />
            Approved actions
          </h2>
          <p className="section-copy">Only changes explicitly approved in this session appear here.</p>
          <div className="mt-5 space-y-3">
            {actionLog.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.018] px-4 py-8 text-center">
                <ShieldCheck className="mx-auto h-6 w-6 text-slate-600" />
                <p className="mt-3 text-xs font-medium text-slate-400">No AI-assisted changes approved</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-600">Analysis and briefings never change property data.</p>
              </div>
            ) : (
              actionLog.map((log) => (
                <div key={log} className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Applied after approval
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-slate-300">{log}</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
