import React, { useState } from 'react';
import { 
  Smartphone, Key, ShieldCheck, Send, Sparkles, CheckCircle2, 
  Wifi, Coffee, Utensils, Zap, HelpCircle, UserCheck 
} from 'lucide-react';

export const GuestPortalSimulator: React.FC = () => {
  const [activeStep, setActiveStep] = useState<'welcome' | 'verify' | 'key' | 'chat'>('chat');
  const [digitalKeyGenerated, setDigitalKeyGenerated] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hello Mr. Wright! Welcome to Aura Luxury Resort. Your room #101 is pre-assigned. How can I assist your stay today?' },
    { sender: 'guest', text: 'What is the high-speed Wi-Fi password?' },
    { sender: 'ai', text: 'The Wi-Fi network is "Aura_Guest_5G" and your password is: AuraVip2026. Enjoy 1Gbps fiber internet!' }
  ]);
  const [inputMessage, setInputMessage] = useState('');

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const userText = inputMessage;
    const newMsgs = [...messages, { sender: 'guest', text: userText }];
    setMessages(newMsgs);
    setInputMessage('');

    // Simulate AI Concierge Instant Intelligent Response
    setTimeout(() => {
      let reply = "I've logged your request with our 24/7 Butler Service desk. Is there anything else you need?";
      const lower = userText.toLowerCase();

      if (lower.includes('breakfast') || lower.includes('food') || lower.includes('eat')) {
        reply = "Savor Fine Dining serves gourmet breakfast from 7:00 AM to 11:00 AM on Floor 1. Would you like me to reserve a private window table?";
      } else if (lower.includes('pool') || lower.includes('spa')) {
        reply = "The Serenity Infinity Pool & Spa is open daily from 6:00 AM to 10:00 PM. Towels and cabanas are complimentary for VIP guests.";
      } else if (lower.includes('checkout') || lower.includes('check out')) {
        reply = "Express contactless check-out is active on your mobile key. Standard check-out is 12:00 PM. Would you like an extended 2:00 PM late check-out?";
      }

      setMessages([...newMsgs, { sender: 'ai', text: reply }]);
    }, 600);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Contactless Guest Web Portal & AI Concierge</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
              Mobile Key & LLM Concierge
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Simulate the guest mobile phone experience: Self Check-in, NFC Key unlock, and AI WhatsApp messaging.
          </p>
        </div>
      </div>

      {/* Main Container: Mobile Frame Simulator + Live Operations Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Mobile Phone UI */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-[340px] h-[680px] bg-slate-950 rounded-[45px] p-4 border-[6px] border-slate-800 shadow-2xl relative flex flex-col justify-between overflow-hidden">
            
            {/* Phone Speaker & Camera Notch */}
            <div className="w-32 h-4 bg-slate-900 rounded-full mx-auto mb-3 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-slate-800" />
            </div>

            {/* Mobile Header */}
            <div className="bg-slate-900/90 rounded-2xl p-3 border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-400 flex items-center justify-center text-slate-950 font-black text-xs">
                  A
                </div>
                <span className="text-xs font-bold text-gray-100">Aura Guest App</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                Room #101
              </span>
            </div>

            {/* Mobile Navigation Tabs */}
            <div className="flex justify-around py-2 border-b border-white/10 text-[10px] font-bold text-gray-400">
              <button 
                onClick={() => setActiveStep('key')} 
                className={`pb-1 ${activeStep === 'key' ? 'text-amber-300 border-b-2 border-amber-400' : ''}`}
              >
                Mobile Key
              </button>
              <button 
                onClick={() => setActiveStep('chat')} 
                className={`pb-1 ${activeStep === 'chat' ? 'text-amber-300 border-b-2 border-amber-400' : ''}`}
              >
                AI Concierge
              </button>
              <button 
                onClick={() => setActiveStep('verify')} 
                className={`pb-1 ${activeStep === 'verify' ? 'text-amber-300 border-b-2 border-amber-400' : ''}`}
              >
                Check-in Status
              </button>
            </div>

            {/* Mobile Content Screen */}
            <div className="flex-1 my-3 overflow-y-auto px-1 space-y-3">
              {activeStep === 'key' && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-4">
                  <div className={`w-28 h-28 rounded-full flex items-center justify-center border-4 transition-all ${
                    digitalKeyGenerated 
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-2xl shadow-emerald-500/30 animate-pulse' 
                      : 'bg-amber-500/10 border-amber-400/40 text-amber-300'
                  }`}>
                    <Key className="w-12 h-12" />
                  </div>

                  <div>
                    <h4 className="font-extrabold text-sm text-gray-100">
                      {digitalKeyGenerated ? 'Digital Key Active' : 'Generate Mobile Key'}
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {digitalKeyGenerated 
                        ? 'Hold phone near Room #101 door lock to unlock via NFC Bluetooth.' 
                        : 'Tap below to authorize digital key to your device.'}
                    </p>
                  </div>

                  {!digitalKeyGenerated ? (
                    <button 
                      onClick={() => setDigitalKeyGenerated(true)}
                      className="btn-primary text-xs w-full py-2.5 flex items-center justify-center gap-2"
                    >
                      <Zap className="w-4 h-4" /> Activate NFC Key
                    </button>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" /> Verified & Encrypted
                    </div>
                  )}
                </div>
              )}

              {activeStep === 'chat' && (
                <div className="flex flex-col h-full justify-between">
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {messages.map((m, idx) => (
                      <div 
                        key={idx}
                        className={`flex ${m.sender === 'guest' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[82%] p-2.5 rounded-2xl text-[11px] leading-snug ${
                          m.sender === 'guest'
                            ? 'bg-amber-500 text-slate-950 font-semibold rounded-br-none'
                            : 'bg-slate-900 text-gray-200 border border-white/10 rounded-bl-none'
                        }`}>
                          {m.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Chat input inside phone */}
                  <div className="pt-2 flex items-center gap-1.5 border-t border-white/10">
                    <input
                      type="text"
                      placeholder="Ask AI Concierge..."
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1 bg-slate-900 border border-white/10 rounded-full px-3 py-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-amber-400/50"
                    />
                    <button 
                      onClick={handleSendMessage}
                      className="w-7 h-7 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center flex-shrink-0 font-bold"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {activeStep === 'verify' && (
                <div className="space-y-3 text-left">
                  <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/30">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" /> Identity Verified
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">Passport / Driver License uploaded & pre-approved.</p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-white/10 space-y-2">
                    <div className="text-xs font-bold text-gray-200">Recommended Upsells</div>
                    <div className="flex items-center justify-between text-[11px] text-gray-300">
                      <span>Early Check-in (11:00 AM)</span>
                      <span className="font-bold text-amber-300">+$45</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-300">
                      <span>Gourmet Champagne Breakfast</span>
                      <span className="font-bold text-amber-300">+$35</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Home Indicator */}
            <div className="w-24 h-1 bg-slate-700 rounded-full mx-auto mt-1" />
          </div>
        </div>

        {/* Right Column: Hotel Front Desk Operations Sync View */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-cyan-400" /> Live Front-Desk Mobile Key Operations
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Sync Active
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="font-bold text-gray-200">Alexander Wright (Room #101)</div>
                  <div className="text-[11px] text-gray-400">Pre-arrival registration completed via Web Link.</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  ID Approved
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="font-bold text-gray-200">Digital Key Encryption Key</div>
                  <div className="text-[11px] text-gray-400">AES-256 NFC Token dispatched to guest device.</div>
                </div>
                <span className="text-[10px] font-mono font-bold text-amber-300">
                  {digitalKeyGenerated ? 'TOKEN_ACTIVE' : 'TOKEN_PENDING'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="font-bold text-gray-200">AI Concierge Assistant Log</div>
                  <div className="text-[11px] text-gray-400">{messages.length} messages exchanged. Zero staff intervention needed.</div>
                </div>
                <span className="text-[10px] font-bold text-cyan-400">
                  100% Automated
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
