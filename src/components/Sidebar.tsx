import React from 'react';
import {
  Bot,
  Boxes,
  Briefcase,
  Building,
  Building2,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Code2,
  Globe,
  Heart,
  Home,
  Leaf,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  UserCog,
  Users,
  Utensils,
  Workflow,
  Wrench,
} from 'lucide-react';

export type ActiveTab =
  | 'overview'
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
  const navGroups = [
    {
      label: 'Front office',
      items: [
        { id: 'overview' as ActiveTab, label: 'Today', icon: Home },
        { id: 'staff-copilot' as ActiveTab, label: 'AI Operations', icon: Bot },
        { id: 'tape-chart' as ActiveTab, label: 'Tape Chart', icon: CalendarDays },
        {
          id: 'reservations' as ActiveTab,
          label: 'Reservations & Folios',
          icon: Users,
          count: pendingArrivalsCount > 0 ? pendingArrivalsCount : undefined,
          countLabel: `${pendingArrivalsCount} arrivals pending`,
          countTone: 'amber',
        },
        { id: 'guest-cdp' as ActiveTab, label: 'Guest Profiles', icon: Heart },
        { id: 'groups' as ActiveTab, label: 'Groups & Events', icon: Building },
      ],
    },
    {
      label: 'Guest & commercial',
      items: [
        { id: 'guest-portal' as ActiveTab, label: 'Guest Experience', icon: PhoneCall },
        { id: 'reputation' as ActiveTab, label: 'Reputation', icon: MessageSquare },
        { id: 'ai-revenue' as ActiveTab, label: 'Revenue Management', icon: Sparkles },
        { id: 'channel-manager' as ActiveTab, label: 'Channel Manager', icon: Globe },
        { id: 'multi-property' as ActiveTab, label: 'Multi-Property', icon: Building2 },
      ],
    },
    {
      label: 'Operations',
      items: [
        {
          id: 'housekeeping' as ActiveTab,
          label: 'Housekeeping',
          icon: ClipboardCheck,
          count: dirtyRoomsCount > 0 ? dirtyRoomsCount : undefined,
          countLabel: `${dirtyRoomsCount} rooms require attention`,
          countTone: 'rose',
        },
        { id: 'maintenance' as ActiveTab, label: 'Engineering & Maintenance', icon: Wrench },
        { id: 'pos-charges' as ActiveTab, label: 'POS Charge Posting', icon: Utensils },
        { id: 'procurement' as ActiveTab, label: 'Procurement & Inventory', icon: Boxes },
        { id: 'hr' as ActiveTab, label: 'Staff & Scheduling', icon: Briefcase },
        { id: 'esg' as ActiveTab, label: 'Sustainability', icon: Leaf },
      ],
    },
    {
      label: 'Finance',
      items: [
        { id: 'analytics' as ActiveTab, label: 'Financial Analytics', icon: TrendingUp },
        { id: 'accounting' as ActiveTab, label: 'General Ledger', icon: Calculator },
      ],
    },
    {
      label: 'Automation & administration',
      items: [
        { id: 'workflow-studio' as ActiveTab, label: 'Workflow Studio', icon: Workflow },
        { id: 'platform-control' as ActiveTab, label: 'Integration & Audit', icon: ShieldCheck },
        { id: 'access-admin' as ActiveTab, label: 'Users & Property Access', icon: UserCog },
        { id: 'developer-portal' as ActiveTab, label: 'Developer Portal', icon: Code2 },
        { id: 'migration' as ActiveTab, label: 'Data Migration', icon: Upload },
      ],
    },
  ];

  const tabsByRole: Record<string, ActiveTab[]> = {
    'Front Desk': [
      'overview',
      'tape-chart',
      'staff-copilot',
      'workflow-studio',
      'guest-cdp',
      'groups',
      'reputation',
      'reservations',
      'housekeeping',
      'maintenance',
      'guest-portal',
      'channel-manager',
      'pos-charges',
    ],
    Housekeeping: ['overview', 'tape-chart', 'staff-copilot', 'workflow-studio', 'housekeeping', 'maintenance'],
    Finance: [
      'overview',
      'tape-chart',
      'workflow-studio',
      'platform-control',
      'developer-portal',
      'reservations',
      'ai-revenue',
      'analytics',
      'accounting',
      'procurement',
      'multi-property',
    ],
  };

  const allTabs = navGroups.flatMap((group) => group.items.map((item) => item.id));
  const permittedTabs = userRole === 'General Manager'
    ? allTabs
    : (tabsByRole[userRole] || ['overview', 'tape-chart']);
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => permittedTabs.includes(item.id)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <div className="sticky top-[72px] z-30 w-full border-b border-white/[0.07] bg-[#0c1423]/95 px-4 py-3 backdrop-blur-xl md:hidden">
        <label htmlFor="mobile-navigation" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          Workspace
        </label>
        <div className="relative">
          <select
            id="mobile-navigation"
            value={activeTab}
            onChange={(event) => setActiveTab(event.target.value as ActiveTab)}
            className="h-11 w-full appearance-none rounded-xl border border-white/[0.09] bg-[#111a2b] px-3.5 pr-10 text-sm font-semibold text-slate-100 shadow-sm focus:border-amber-300/45 focus:outline-none focus:ring-2 focus:ring-amber-300/10"
            aria-label="Choose hotel workspace"
          >
            {visibleGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] w-[280px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0c1423] md:flex">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500">Workspace</p>
          <p className="mt-1 text-sm font-semibold text-slate-200">Property operations</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Hotel operations navigation">
          <div className="space-y-6">
            {visibleGroups.map((group) => (
              <section key={group.label} aria-labelledby={`nav-${group.label.replace(/\s+/g, '-').toLowerCase()}`}>
                <h2
                  id={`nav-${group.label.replace(/\s+/g, '-').toLowerCase()}`}
                  className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.17em] text-slate-600"
                >
                  {group.label}
                </h2>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`group relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 ${
                          isActive
                            ? 'bg-white/[0.075] text-slate-50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.055)]'
                            : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                        }`}
                      >
                        {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-amber-300" />}
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          isActive
                            ? 'bg-amber-300/[0.1] text-amber-300'
                            : 'bg-white/[0.025] text-slate-500 group-hover:text-slate-300'
                        }`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 leading-4">{item.label}</span>
                        {item.count !== undefined && (
                          <span
                            aria-label={item.countLabel}
                            title={item.countLabel}
                            className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                              item.countTone === 'rose'
                                ? 'bg-rose-400/[0.12] text-rose-300'
                                : 'bg-amber-300/[0.12] text-amber-200'
                            }`}
                          >
                            {item.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <div className="border-t border-white/[0.07] p-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Core services operational
            </div>
            <p className="mt-1.5 pl-6 text-[10px] leading-4 text-slate-500">Live property data is connected and current.</p>
          </div>
        </div>
      </aside>
    </>
  );
};
