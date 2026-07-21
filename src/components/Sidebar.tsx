import React from 'react';
import { 
  CalendarDays, Users, Sparkles, Globe, CreditCard, 
  TrendingUp, Settings, HelpCircle, Utensils, ClipboardCheck, PhoneCall,
  Bot, Heart, Wrench
} from 'lucide-react';

export type ActiveTab = 
  | 'tape-chart'
  | 'reservations'
  | 'housekeeping'
  | 'guest-portal'
  | 'ai-revenue'
  | 'channel-manager'
  | 'pos-charges'
  | 'analytics'
  | 'staff-copilot'
  | 'guest-cdp'
  | 'maintenance';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  pendingArrivalsCount: number;
  dirtyRoomsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingArrivalsCount,
  dirtyRoomsCount
}) => {
  const navItems = [
    {
      id: 'tape-chart' as ActiveTab,
      label: 'Tape Chart Grid',
      icon: CalendarDays,
      badge: 'Live',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    },
    {
      id: 'staff-copilot' as ActiveTab,
      label: 'Staff AI Copilot',
      icon: Bot,
      badge: 'Executable',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    },
    {
      id: 'guest-cdp' as ActiveTab,
      label: 'Unified Guest CDP',
      icon: Heart,
      badge: 'Mini-CDP',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    },
    {
      id: 'reservations' as ActiveTab,
      label: 'Reservations & Folios',
      icon: Users,
      badge: pendingArrivalsCount > 0 ? `${pendingArrivalsCount} Arriving` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    },
    {
      id: 'housekeeping' as ActiveTab,
      label: 'Housekeeping Dispatch',
      icon: ClipboardCheck,
      badge: dirtyRoomsCount > 0 ? `${dirtyRoomsCount} Action` : undefined,
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
    },
    {
      id: 'maintenance' as ActiveTab,
      label: 'Engineering CMMS',
      icon: Wrench,
      badge: 'Work Orders',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    },
    {
      id: 'guest-portal' as ActiveTab,
      label: 'Guest Mobile & AI Concierge',
      icon: PhoneCall,
      badge: 'Contactless',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
    },
    {
      id: 'ai-revenue' as ActiveTab,
      label: 'AI Revenue Engine',
      icon: Sparkles,
      badge: 'Auto Pricing',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    },
    {
      id: 'channel-manager' as ActiveTab,
      label: 'OTA Channel Manager',
      icon: Globe,
      badge: '2-Way Sync',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    },
    {
      id: 'pos-charges' as ActiveTab,
      label: 'POS Charge Posting',
      icon: Utensils,
    },
    {
      id: 'analytics' as ActiveTab,
      label: 'Financials & RevPAR',
      icon: TrendingUp,
    }
  ];

  return (
    <aside className="w-64 glass-panel rounded-none border-t-0 border-l-0 min-h-[calc(100vh-65px)] p-4 flex flex-col justify-between hidden md:flex">
      <div className="space-y-4">
        <div className="px-3 text-[11px] font-bold text-gray-500 uppercase tracking-widest">
          Main Navigation
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                  isActive 
                    ? 'bg-gradient-to-r from-amber-500/20 to-amber-500/5 text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-500/10' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${isActive ? 'text-amber-400' : 'text-gray-400'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* System Status Footnote */}
      <div className="pt-3 border-t border-white/10 space-y-2">
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs space-y-1">
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>PMS Core Status:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Operational
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>WebSocket Latency:</span>
            <span className="text-amber-300 font-mono">14ms</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
