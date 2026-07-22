import React, { useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  KeyRound,
  LockKeyhole,
  MessageCircle,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
  Wifi,
  Zap
} from 'lucide-react';

type PortalView = 'verify' | 'key' | 'chat';

const portalTabs: Array<{ id: PortalView; label: string; icon: React.ElementType }> = [
  { id: 'chat', label: 'Concierge', icon: MessageCircle },
  { id: 'key', label: 'Mobile key', icon: KeyRound },
  { id: 'verify', label: 'Check-in', icon: UserCheck }
];

export const GuestPortalSimulator: React.FC = () => {
  const [activeStep, setActiveStep] = useState<PortalView>('chat');
  const [digitalKeyGenerated, setDigitalKeyGenerated] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hello Mr. Wright! Welcome to Aura Luxury Resort. Your room #101 is pre-assigned. How can I assist your stay today?' },
    { sender: 'guest', text: 'What is the high-speed Wi-Fi password?' },
    { sender: 'ai', text: 'Prototype response: the sample Wi-Fi network is "Aura_Guest_5G". No real network credentials are stored here.' }
  ]);
  const [inputMessage, setInputMessage] = useState('');

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const userText = inputMessage.trim();
    const newMessages = [...messages, { sender: 'guest', text: userText }];
    setMessages(newMessages);
    setInputMessage('');

    setTimeout(() => {
      let reply = "I've logged your request with our 24/7 Butler Service desk. Is there anything else you need?";
      const lower = userText.toLowerCase();

      if (lower.includes('breakfast') || lower.includes('food') || lower.includes('eat')) {
        reply = 'Savor Fine Dining serves gourmet breakfast from 7:00 AM to 11:00 AM on Floor 1. Would you like me to reserve a private window table?';
      } else if (lower.includes('pool') || lower.includes('spa')) {
        reply = 'The Serenity Infinity Pool & Spa is open daily from 6:00 AM to 10:00 PM. Towels and cabanas are complimentary for VIP guests.';
      } else if (lower.includes('checkout') || lower.includes('check out')) {
        reply = 'Express contactless check-out is active on your mobile key. Standard check-out is 12:00 PM. Would you like an extended 2:00 PM late check-out?';
      }

      setMessages((current) => [...current, { sender: 'ai', text: reply }]);
    }, 600);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-1 pb-8 animate-slide-up">
      <header className="rounded-2xl border border-white/[0.08] bg-slate-900/75 px-6 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
              <Smartphone className="h-4 w-4" />
              Guest experience sandbox
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
              Mobile guest journey
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Preview self-service check-in, a simulated mobile key, and rule-based concierge messaging from the guest and front-desk perspectives.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-3">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            <div>
              <div className="text-xs font-semibold text-slate-200">Local simulation</div>
              <div className="mt-0.5 text-[11px] text-slate-500">No identity, lock, messaging, or AI provider connected</div>
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Guest journey summary">
        {[
          { label: 'Journey status', value: 'Pre-arrival', detail: 'Room 101 assigned', icon: UserCheck, tone: 'text-emerald-300' },
          { label: 'Identity state', value: 'Sample approved', detail: 'Local preview only', icon: ShieldCheck, tone: 'text-emerald-300' },
          { label: 'Mobile key', value: digitalKeyGenerated ? 'Preview active' : 'Not activated', detail: 'No device command sent', icon: KeyRound, tone: digitalKeyGenerated ? 'text-emerald-300' : 'text-amber-300' },
          { label: 'Conversation', value: `${messages.length} messages`, detail: 'Rule-based responses', icon: MessageCircle, tone: 'text-cyan-300' }
        ].map(({ label, value, detail, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-slate-900/60 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className={`mt-2 text-sm font-semibold sm:text-base ${tone}`}>{value}</p>
                <p className="mt-1 text-[11px] text-slate-600">{detail}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-slate-950/70 p-2.5 text-slate-400">
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.7fr)]">
        <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/65">
          <div className="flex flex-col gap-4 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 to-amber-500 font-bold text-slate-950">
                A
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Aura Guest App</h3>
                <p className="mt-0.5 text-xs text-slate-500">Alexander Wright · Room 101</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Interactive preview
            </div>
          </div>

          <div className="border-b border-white/[0.07] bg-slate-950/25 px-4 py-3">
            <div className="inline-flex w-full max-w-xl rounded-xl border border-white/[0.07] bg-slate-950/50 p-1">
              {portalTabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveStep(id)}
                  aria-pressed={activeStep === id}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
                    activeStep === id
                      ? 'bg-slate-800 text-slate-100 shadow-sm'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${activeStep === id ? 'text-amber-300' : ''}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-[510px] p-5 sm:p-6">
            {activeStep === 'chat' && (
              <div className="flex min-h-[462px] flex-col">
                <div className="mb-5 flex items-center justify-between rounded-xl border border-white/[0.07] bg-slate-950/35 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-cyan-300/10 p-2 text-cyan-300">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-100">Aura concierge</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Local scripted assistant · usually replies instantly</p>
                    </div>
                  </div>
                  <span className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-[10px] font-semibold text-emerald-200 sm:inline-flex">
                    Available
                  </span>
                </div>

                <div className="max-h-[330px] flex-1 space-y-4 overflow-y-auto px-1 pr-2">
                  {messages.map((message, index) => (
                    <div key={`${message.sender}-${index}`} className={`flex gap-2.5 ${message.sender === 'guest' ? 'justify-end' : 'justify-start'}`}>
                      {message.sender === 'ai' && (
                        <div className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-300">
                          <Sparkles className="h-3.5 w-3.5" />
                        </div>
                      )}
                      <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                        message.sender === 'guest'
                          ? 'rounded-br-md bg-amber-300 text-slate-950'
                          : 'rounded-bl-md border border-white/[0.07] bg-slate-950/55 text-slate-300'
                      }`}>
                        {message.text}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 border-t border-white/[0.07] pt-4">
                  <label className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-slate-950/55 p-1.5 focus-within:border-amber-300/35">
                    <span className="sr-only">Message the concierge</span>
                    <input
                      type="text"
                      placeholder="Ask about breakfast, the spa, or check-out…"
                      value={inputMessage}
                      onChange={(event) => setInputMessage(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && handleSendMessage()}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim()}
                      aria-label="Send message"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-300 text-slate-950 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </label>
                </div>
              </div>
            )}

            {activeStep === 'key' && (
              <div className="grid min-h-[462px] place-items-center">
                <div className="w-full max-w-xl text-center">
                  <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border ${
                    digitalKeyGenerated
                      ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-300 shadow-[0_18px_60px_rgba(52,211,153,0.12)]'
                      : 'border-amber-300/20 bg-amber-300/[0.07] text-amber-300'
                  }`}>
                    {digitalKeyGenerated ? <LockKeyhole className="h-10 w-10" /> : <KeyRound className="h-10 w-10" />}
                  </div>
                  <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Room 101 · Main building</p>
                  <h4 className="mt-2 text-xl font-semibold text-slate-50">
                    {digitalKeyGenerated ? 'Key preview is active' : 'Preview the mobile key state'}
                  </h4>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
                    {digitalKeyGenerated
                      ? 'The interface is showing a successful activation state. No credential or door command was created.'
                      : 'Activate the preview to see the guest-facing success state without contacting a lock provider or device.'}
                  </p>

                  {!digitalKeyGenerated ? (
                    <button
                      type="button"
                      onClick={() => setDigitalKeyGenerated(true)}
                      className="btn-primary mx-auto mt-7 px-5 py-3 text-sm"
                    >
                      <Zap className="h-4 w-4" />
                      Activate preview
                    </button>
                  ) : (
                    <div className="mx-auto mt-7 inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] px-4 py-3 text-xs font-semibold text-emerald-200">
                      <CheckCircle2 className="h-4 w-4" />
                      Simulated activation successful
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeStep === 'verify' && (
              <div className="min-h-[462px]">
                <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-emerald-300/10 p-2.5 text-emerald-300">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-100">Sample identity state approved</h4>
                        <p className="mt-1 text-xs text-slate-500">Illustrative passport or driver licence review</p>
                      </div>
                    </div>
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1.5 text-[11px] font-semibold text-emerald-200">
                      <Check className="h-3.5 w-3.5" /> Approved
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.07] bg-slate-950/35 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Arrival details</p>
                    <dl className="mt-4 space-y-4 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-500">Guest</dt>
                        <dd className="font-medium text-slate-200">Alexander Wright</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-500">Assigned room</dt>
                        <dd className="font-medium text-slate-200">101</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-500">Standard check-in</dt>
                        <dd className="font-medium text-slate-200">3:00 PM</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-white/[0.07] bg-slate-950/35 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sample upsells</p>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.06] px-3 py-3">
                        <div>
                          <p className="text-xs font-medium text-slate-200">Early check-in</p>
                          <p className="mt-0.5 text-[11px] text-slate-600">From 11:00 AM</p>
                        </div>
                        <span className="text-xs font-semibold text-amber-200">+$45</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.06] px-3 py-3">
                        <div>
                          <p className="text-xs font-medium text-slate-200">Champagne breakfast</p>
                          <p className="mt-0.5 text-[11px] text-slate-600">In-room service</p>
                        </div>
                        <span className="text-xs font-semibold text-amber-200">+$35</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-white/[0.08] bg-slate-900/65 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Front-desk view</p>
                <h3 className="mt-1.5 text-base font-semibold text-slate-100">Journey readiness</h3>
              </div>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-2.5 py-1 text-[10px] font-semibold text-cyan-200">Preview</span>
            </div>

            <div className="mt-6 space-y-1">
              {[
                { title: 'Pre-arrival registration', description: 'Sample web form completed', state: 'Complete', icon: UserCheck, done: true },
                { title: 'Identity review', description: 'Sample approval state', state: 'Approved', icon: ShieldCheck, done: true },
                { title: 'Digital key', description: 'No credential dispatched', state: digitalKeyGenerated ? 'Preview active' : 'Pending', icon: KeyRound, done: digitalKeyGenerated },
                { title: 'Concierge conversation', description: `${messages.length} messages in this session`, state: 'Local rules', icon: MessageCircle, done: true }
              ].map(({ title, description, state, icon: Icon, done }, index) => (
                <div key={title} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < 3 && <div className="absolute left-[17px] top-9 h-[calc(100%-28px)] w-px bg-white/[0.07]" />}
                  <div className={`z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                    done
                      ? 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-300'
                      : 'border-amber-300/20 bg-amber-300/[0.07] text-amber-300'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{title}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{description}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-semibold ${done ? 'text-emerald-300' : 'text-amber-300'}`}>{state}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-slate-900/65 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-950/60 p-2.5 text-slate-400">
                <Wifi className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Provider connections</h3>
                <p className="mt-0.5 text-xs text-slate-500">Current sandbox boundaries</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 text-[11px]">
              {['Identity verification', 'Smart lock', 'Guest messaging', 'AI model'].map((provider) => (
                <div key={provider} className="rounded-lg border border-white/[0.06] bg-slate-950/35 px-3 py-3">
                  <p className="font-medium text-slate-300">{provider}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-slate-600"><Clock3 className="h-3 w-3" /> Not connected</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
