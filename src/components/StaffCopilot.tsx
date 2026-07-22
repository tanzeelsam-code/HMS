import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, CheckCircle2, Zap, Loader2 } from 'lucide-react';
import { api } from '../api';
import { CopilotResponse } from '../types';

interface StaffCopilotProps {
  onDataChanged: () => void;
}

interface ChatMessage {
  sender: 'user' | 'copilot';
  text: string;
}

export const StaffCopilot: React.FC<StaffCopilotProps> = ({ onDataChanged }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'copilot',
      text: 'Greetings General Manager. I am your Operational AI Copilot, connected to the live PMS database. I can answer occupancy/rate questions and execute real actions — housekeeping dispatch, VIP room moves, rate application, and check-ins. What would you like to run?'
    }
  ]);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    'What is occupancy today?',
    'RevPAR this week',
    'Clean floor 1',
    'Assign VIP arrivals to high floors',
    'Apply the recommended rates'
  ];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const handleSendQuery = async (textToRun?: string) => {
    const query = (textToRun ?? inputQuery).trim();
    if (!query || thinking) return;

    setMessages(prev => [...prev, { sender: 'user', text: query }]);
    if (!textToRun) setInputQuery('');
    setThinking(true);

    try {
      const res = await api.post<CopilotResponse>('/ai/copilot', { message: query });
      setMessages(prev => [...prev, { sender: 'copilot', text: res.reply }]);
      if (res.actions.length > 0) {
        setActionLog(prev => [...res.actions, ...prev]);
        // The command mutated live PMS data — let App refetch affected collections
        onDataChanged();
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { sender: 'copilot', text: `⚠ ${err instanceof Error ? err.message : 'Copilot request failed'}` }
      ]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Staff-Facing Agentic AI Copilot</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              Executable Ops Assistant
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Execute front-desk operations, room assignments, housekeeping dispatch, and folio queries via natural language.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-400">Connected to Live PMS Database</span>
        </div>
      </div>

      {/* Main Container: Chat + Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Command Terminal */}
        <div className="lg:col-span-7 glass-panel p-5 flex flex-col justify-between h-[540px]">
          {/* Messages list */}
          <div ref={scrollRef} className="space-y-3 overflow-y-auto pr-2 flex-1">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'copilot' && (
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 flex-shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[85%] p-3 rounded-xl text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-amber-500 text-slate-950 font-semibold rounded-tr-none'
                    : 'bg-slate-900 border border-white/10 text-gray-200 rounded-tl-none'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="p-3 rounded-xl rounded-tl-none bg-slate-900 border border-white/10 text-gray-400 text-xs flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  Copilot is thinking…
                </div>
              </div>
            )}
          </div>

          {/* Prompt Suggestions */}
          <div className="my-3 pt-2 border-t border-white/10 flex flex-wrap gap-2">
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => handleSendQuery(p)}
                disabled={thinking}
                className="text-[11px] px-2.5 py-1 rounded-full bg-slate-900 border border-white/10 hover:border-amber-400/40 text-gray-300 hover:text-amber-300 transition-all text-left disabled:opacity-50"
              >
                ✨ {p}
              </button>
            ))}
          </div>

          {/* Input field */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask Copilot to execute an operational task..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendQuery()}
              className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-gray-200 focus:outline-none focus:border-amber-400/50"
            />
            <button
              onClick={() => handleSendQuery()}
              disabled={thinking}
              className="btn-primary text-xs px-4 py-2.5 disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" /> Execute
            </button>
          </div>
        </div>

        {/* Right Column: Live Executed PMS Actions Log */}
        <div className="lg:col-span-5 glass-panel p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> Real-Time Executed Actions Log
          </h3>

          <div className="space-y-3 text-xs max-h-[440px] overflow-y-auto pr-1">
            {actionLog.length === 0 && (
              <div className="p-3 rounded-xl bg-slate-900 border border-white/10 text-gray-400 text-[11px] leading-relaxed">
                No actions executed yet. Try "clean floor 1", "assign VIP arrivals to high floors",
                "apply recommended rates", or "check in &lt;guest name&gt;" — every mutation the Copilot
                performs against the live database will be logged here.
              </div>
            )}

            {actionLog.map((a, i) => (
              <div key={i} className="p-3 rounded-xl bg-slate-900 border border-emerald-500/30">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Executed
                </div>
                <p className="text-[11px] text-gray-300 mt-1">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
