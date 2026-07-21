import React, { useState } from 'react';
import { ChannelStatus } from '../types';
import { Globe, RefreshCw, CheckCircle2, Zap, ArrowRightLeft, ShieldCheck } from 'lucide-react';

interface ChannelManagerProps {
  channels: ChannelStatus[];
  onTriggerSync: (channelId: string) => void;
}

export const ChannelManager: React.FC<ChannelManagerProps> = ({
  channels,
  onTriggerSync
}) => {
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleSyncClick = (id: string) => {
    setSyncingId(id);
    onTriggerSync(id);
    setTimeout(() => {
      setSyncingId(null);
    }, 1000);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">2-Way OTA Channel Manager</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
              OpenTravel XML & API Hub
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Real-time rate, availability, and booking synchronization across global Online Travel Agencies (OTAs).
          </p>
        </div>

        <button 
          onClick={() => handleSyncClick('all')}
          className="btn-primary text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncingId === 'all' ? 'animate-spin' : ''}`} />
          <span>Sync All OTAs Now</span>
        </button>
      </div>

      {/* Grid of Channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels.map((ch) => (
          <div 
            key={ch.id}
            className="glass-panel p-5 space-y-4 hover:border-blue-400/40 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{ch.logo}</span>
                  <div>
                    <h3 className="font-extrabold text-sm text-gray-100">{ch.name}</h3>
                    <div className="text-[11px] text-gray-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>{ch.connected ? '2-Way Connected' : 'Disconnected'}</span>
                    </div>
                  </div>
                </div>

                <span className="text-xs font-mono font-bold text-amber-300 px-2 py-0.5 rounded bg-slate-900 border border-white/10">
                  {ch.commissionRate}% Comm.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/10 text-xs">
                <div>
                  <div className="text-[10px] text-gray-400">Bookings (This Month)</div>
                  <div className="font-bold text-gray-200 text-sm mt-0.5">{ch.bookingsThisMonth}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400">Sync Latency</div>
                  <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">{ch.syncLatency}</div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
              <span className="text-[11px] text-gray-500">Last sync: {ch.lastSync}</span>
              <button 
                onClick={() => handleSyncClick(ch.id)}
                className="btn-secondary text-[11px] px-2.5 py-1"
              >
                <RefreshCw className={`w-3 h-3 text-blue-400 ${syncingId === ch.id ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
