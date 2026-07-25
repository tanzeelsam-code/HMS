import React, { useState } from 'react';
import { ChannelStatus } from '../types';
import { RefreshCw } from 'lucide-react';

interface ChannelManagerProps {
  channels: ChannelStatus[];
  onTriggerSync: (channelId: string) => void | Promise<unknown>;
}

export const ChannelManager: React.FC<ChannelManagerProps> = ({
  channels,
  onTriggerSync
}) => {
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleSyncClick = async (id: string) => {
    setSyncingId(id);
    try {
      await onTriggerSync(id);
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 surface-panel bg-white p-5 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">OTA Channel Simulator</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
              Demo dataset
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 font-medium">
            Review seeded channel data and exercise the local sync workflow. No external OTA account is connected.
          </p>
        </div>

        <button 
          onClick={() => void handleSyncClick('all')}
          disabled={syncingId !== null}
          className="btn-primary text-xs font-bold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncingId === 'all' ? 'animate-spin' : ''}`} />
          <span>Update All Sync Times</span>
        </button>
      </div>

      {/* Grid of Channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels.map((ch) => (
          <div 
            key={ch.id}
            className="surface-panel bg-white p-5 space-y-4 border border-slate-200 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{ch.logo}</span>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">{ch.name}</h3>
                    <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>{ch.connected ? 'Enabled in demo' : 'Disabled'}</span>
                    </div>
                  </div>
                </div>

                <span className="text-xs font-mono font-bold text-amber-900 px-2 py-0.5 rounded bg-amber-50 border border-amber-200">
                  {ch.commissionRate}% Comm.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-200 text-xs">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Bookings (This Month)</div>
                  <div className="font-extrabold text-slate-900 text-sm mt-0.5">{ch.bookingsThisMonth}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Sync Latency</div>
                  <div className="font-mono font-extrabold text-emerald-700 text-sm mt-0.5">{ch.syncLatency}</div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold">
              <span className="text-[11px] text-slate-500">Last sync: {ch.lastSync}</span>
              <button 
                onClick={() => void handleSyncClick(ch.id)}
                disabled={syncingId !== null}
                className="btn-secondary text-[11px] px-2.5 py-1 font-bold"
              >
                <RefreshCw className={`w-3 h-3 text-blue-600 ${syncingId === ch.id ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
