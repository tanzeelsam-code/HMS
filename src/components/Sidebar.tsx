import React from 'react';
import { 
  CalendarDays, Users, Sparkles, Globe,
  TrendingUp, Utensils, ClipboardCheck, PhoneCall,
  Bot, Heart, Wrench, Building, MessageSquare, Leaf, Building2, Upload,
  Calculator, Boxes, Briefcase, Workflow, ShieldCheck, UserCog, Code2
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
  | 'accounting'
  | 'procurement'
  | 'hr'
  | 'staff-copilot'
  | 'workflow-studio'
  | 'platform-control'
  | 'access-admin'
  | 'developer-portal'
  | 'guest-cdp'
  | 'maintenance'
  | 'groups'
  | 'reputation'
  | 'esg'
  | 'multi-property'
  | 'migration';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  pendingArrivalsCount: number;
  dirtyRoomsCount: number;
  userRole: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingArrivalsCount,
  dirtyRoomsCount,
  userRole,
}) => {
  const navItems = [
    {
      id: 'tape-chart' as ActiveTab,
      label: 'Tape Chart Grid',
      icon: CalendarDays,
      badge: 'API',
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
      id: 'workflow-studio' as ActiveTab,
      label: 'Workflow & Task Studio',
      icon: Workflow,
      badge: 'Live Engine',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    },
    {
      id: 'platform-control' as ActiveTab,
      label: 'Audit & Integration Hub',
      icon: ShieldCheck,
      badge: 'Signed Events',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
    },
    {
      id: 'access-admin' as ActiveTab,
      label: 'Accounts & Property Access',
      icon: UserCog,
      badge: 'GM Control',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    },
    {
      id: 'developer-portal' as ActiveTab,
      label: 'Developer & API Portal',
      icon: Code2,
      badge: 'OpenAPI 3.1',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
    },
    {
      id: 'guest-cdp' as ActiveTab,
      label: 'Unified Guest CDP',
      icon: Heart,
      badge: 'Mini-CDP',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    },
    {
      id: 'groups' as ActiveTab,
      label: 'Groups & Events',
      icon: Building,
      badge: 'Live API',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    },
    {
      id: 'reputation' as ActiveTab,
      label: 'Reputation AI',
      icon: MessageSquare,
      badge: 'Persisted',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
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
      id: 'esg' as ActiveTab,
      label: 'ESG Energy',
      icon: Leaf,
      badge: 'Connector-ready',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    },
    {
      id: 'multi-property' as ActiveTab,
      label: 'Multi-Property CRS',
      icon: Building2,
      badge: 'Portfolio API',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    },
    {
      id: 'migration' as ActiveTab,
      label: 'PMS CSV Migration',
      icon: Upload,
      badge: 'Prototype',
      badgeColor: 'bg-gray-500/20 text-gray-300 border-gray-500/30'
    },
    {
      id: 'guest-portal' as ActiveTab,
      label: 'Guest Mobile & AI Concierge',
      icon: PhoneCall,
      badge: 'Prototype',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
    },
    {
      id: 'ai-revenue' as ActiveTab,
      label: 'Revenue Rules & Forecast',
      icon: Sparkles,
      badge: 'Rules',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    },
    {
      id: 'channel-manager' as ActiveTab,
      label: 'OTA Channel Manager',
      icon: Globe,
      badge: 'Demo Sync',
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
    },
    {
      id: 'accounting' as ActiveTab,
      label: 'Finance & General Ledger',
      icon: Calculator,
      badge: 'Live GL',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    },
    {
      id: 'procurement' as ActiveTab,
      label: 'Procurement & Stock',
      icon: Boxes,
      badge: 'Par Levels',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
    },
    {
      id: 'hr' as ActiveTab,
      label: 'Staff & Shifts',
      icon: Briefcase,
      badge: 'Roster',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    }
  ];

  const tabsByRole: Record<string, ActiveTab[]> = {
    'Front Desk': [
      'tape-chart', 'staff-copilot', 'workflow-studio', 'guest-cdp', 'groups', 'reputation',
      'reservations', 'housekeeping', 'maintenance', 'guest-portal',
      'channel-manager', 'pos-charges',
    ],
    Housekeeping: ['tape-chart', 'staff-copilot', 'workflow-studio', 'housekeeping', 'maintenance'],
    Finance: [
      'tape-chart', 'workflow-studio', 'platform-control', 'developer-portal', 'reservations', 'ai-revenue', 'analytics', 'accounting',
      'procurement', 'multi-property',
    ],
  };
  const permittedTabs = userRole === 'General Manager'
    ? navItems.map((item) => item.id)
    : (tabsByRole[userRole] || ['tape-chart']);
  const visibleNavItems = navItems.filter((item) => permittedTabs.includes(item.id));

  return (
    <>
      <div className="md:hidden px-4 pt-3 w-full">
        <label htmlFor="mobile-navigation" className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
          Current workspace
        </label>
        <select
          id="mobile-navigation"
          value={activeTab}
          onChange={(event) => setActiveTab(event.target.value as ActiveTab)}
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          aria-label="Choose hotel workspace"
        >
          {visibleNavItems.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </div>

      <aside className="w-64 glass-panel rounded-none border-t-0 border-l-0 min-h-[calc(100vh-65px)] p-4 flex-col justify-between hidden md:flex">
      <div className="space-y-4">
        <div className="px-3 text-[11px] font-bold text-gray-500 uppercase tracking-widest">
          Main Navigation
        </div>

        <nav className="space-y-1 max-h-[75vh] overflow-y-auto pr-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all group ${
                  isActive 
                    ? 'bg-gradient-to-r from-amber-500/20 to-amber-500/5 text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-500/10' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${isActive ? 'text-amber-400' : 'text-gray-400'}`} />
                  <span className="truncate">{item.label}</span>
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
            <span>Data Source:</span>
            <span className="text-amber-300 font-mono">SQLite API</span>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
};
