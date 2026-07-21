import React, { useState } from 'react';
import { Sparkles, Send, Bot, User, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { Room, Reservation, HousekeepingTask } from '../types';

interface StaffCopilotProps {
  rooms: Room[];
  reservations: Reservation[];
  tasks: HousekeepingTask[];
  onExecuteCommand: (actionType: string, payload?: any) => void;
}

export const StaffCopilot: React.FC<StaffCopilotProps> = ({
  rooms,
  reservations,
  tasks,
  onExecuteCommand
}) => {
  const [messages, setMessages] = useState([
    {
      sender: 'copilot',
      text: 'Greetings General Manager. I am your Operational AI Copilot. I can execute live actions across your front desk, room assignments, housekeeping queues, and folios. What would you like to run?'
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');

  const quickPrompts = [
    'Assign all VIP arrivals to high floors',
    'Show today\'s arrivals with unpaid balances',
    'Mark all dirty rooms on Floor 1 as clean',
    'Scan system for night audit anomalies'
  ];

  const handleSendQuery = (textToRun?: string) => {
    const query = textToRun || inputQuery;
    if (!query.trim()) return;

    const userMsg = { sender: 'user', text: query };
    setMessages(prev => [...prev, userMsg]);
    if (!textToRun) setInputQuery('');

    // Simulate natural language intent extraction & live command execution
    setTimeout(() => {
      let botResponse = "Command processed across global PMS state bus.";
      const lower = query.toLowerCase();

      if (lower.includes('vip') || lower.includes('high floor')) {
        botResponse = "Executed VIP Allocation Algorithm: 3 VIP arrivals (Elena Rostova #303, Victoria Sterling #203, Alexander Wright #101) prioritized and assigned to top floor ocean/skyline suites.";
        onExecuteCommand('ASSIGN_VIPS');
      } else if (lower.includes('unpaid') || lower.includes('balance')) {
        botResponse = "Found 2 arrivals with outstanding deposits: Sophia Martinez (Room #104 - $680 deposit pending). Sent automated payment reminder link to guest mobile.";
        onExecuteCommand('SHOW_UNPAID');
      } else if (lower.includes('clean') || lower.includes('floor 1')) {
        botResponse = "Housekeeping Auto-Dispatch: Dispatched priority cleaning task to Maria Santos for Room #103 on Floor 1.";
        onExecuteCommand('CLEAN_FLOOR1');
      } else if (lower.includes('audit') || lower.includes('anomaly')) {
        botResponse = "Audit Safeguard Scan: Detected 2 ledger anomalies (Unposted rate on Room #105, manual discount variance on Room #203). Highlighted on Financials dashboard.";
        onExecuteCommand('RUN_AUDIT_SCAN');
      }

      setMessages(prev => [...prev, { sender: 'copilot', text: botResponse }]);
    }, 600);
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
          <span className="text-xs font-semibold text-emerald-400">WebSocket Real-Time Listener Active</span>
        </div>
      </div>

      {/* Main Container: Chat + Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Command Terminal */}
        <div className="lg:col-span-7 glass-panel p-5 flex flex-col justify-between h-[540px]">
          {/* Messages list */}
          <div className="space-y-3 overflow-y-auto pr-2 flex-1">
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
          </div>

          {/* Prompt Suggestions */}
          <div className="my-3 pt-2 border-t border-white/10 flex flex-wrap gap-2">
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => handleSendQuery(p)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-slate-900 border border-white/10 hover:border-amber-400/40 text-gray-300 hover:text-amber-300 transition-all text-left"
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
              className="btn-primary text-xs px-4 py-2.5"
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

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/30">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> VIP Auto-Room Allocation
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Elena Rostova matched with Presidential Suite #303.</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/30">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Dynamic Rate Adjuster
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Applied +22% rate surge multiplier across Deluxe Ocean inventory.</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-white/10">
              <div className="font-bold text-gray-300">Staff Training SOP Knowledge Base</div>
              <p className="text-[11px] text-gray-400 mt-1">Loaded 42 hotel standard operating procedure documents.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
