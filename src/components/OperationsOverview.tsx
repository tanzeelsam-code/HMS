import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  DoorOpen,
  Search,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import { HotelMetrics, HousekeepingTask, MaintenanceWorkOrder, Reservation, Room } from '../types';
import { ActiveTab } from './Sidebar';

interface OperationsOverviewProps {
  userName: string;
  userRole: string;
  metrics: HotelMetrics;
  rooms: Room[];
  reservations: Reservation[];
  housekeepingTasks: HousekeepingTask[];
  maintenanceOrders: MaintenanceWorkOrder[];
  onNavigate: (tab: ActiveTab) => void;
  onOpenNewBooking: () => void;
  onSearchReservations: () => void;
}

const formatBusinessDate = (date: string) => {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parsed);
};

export const OperationsOverview: React.FC<OperationsOverviewProps> = ({
  userName,
  userRole,
  metrics,
  rooms,
  reservations,
  housekeepingTasks,
  maintenanceOrders,
  onNavigate,
  onOpenNewBooking,
  onSearchReservations,
}) => {
  const firstName = userName.split(' ')[0] || userName;
  const canManageReservations = ['General Manager', 'Front Desk'].includes(userRole);
  const canViewReservations = ['General Manager', 'Front Desk', 'Finance'].includes(userRole);
  const canViewFinancials = ['General Manager', 'Finance'].includes(userRole);

  const pendingArrivals = reservations.filter((reservation) => (
    reservation.status === 'Confirmed' && reservation.checkIn === metrics.businessDate
  ));
  const readyRooms = rooms.filter((room) => room.status === 'Vacant Clean').length;
  const dirtyRooms = rooms.filter((room) => room.status === 'Vacant Dirty').length;
  const outOfServiceRooms = rooms.filter((room) => room.status === 'Out of Service').length;
  const activeHousekeeping = housekeepingTasks.filter((task) => !['Completed', 'Inspected'].includes(task.status));
  const urgentHousekeeping = activeHousekeeping.filter((task) => task.priority === 'Urgent').length;
  const openMaintenance = maintenanceOrders.filter((order) => order.status !== 'Resolved');
  const urgentMaintenance = openMaintenance.filter((order) => ['Urgent', 'High'].includes(order.priority)).length;
  const roomTotal = Math.max(rooms.length, 1);
  const operationalRoomPercentage = Math.round(((rooms.length - outOfServiceRooms) / roomTotal) * 100);

  const attentionItems = [
    ...(canViewReservations && pendingArrivals.length > 0 ? [{
      id: 'arrivals',
      title: `${pendingArrivals.length} arrival${pendingArrivals.length === 1 ? '' : 's'} waiting`,
      detail: 'Review arrival details and complete check-in.',
      label: 'Open arrivals',
      icon: CalendarCheck2,
      tone: 'amber',
      tab: 'reservations' as ActiveTab,
    }] : []),
    ...(activeHousekeeping.length > 0 ? [{
      id: 'housekeeping',
      title: `${activeHousekeeping.length} room task${activeHousekeeping.length === 1 ? '' : 's'} active`,
      detail: urgentHousekeeping > 0
        ? `${urgentHousekeeping} urgent task${urgentHousekeeping === 1 ? '' : 's'} should be assigned first.`
        : 'Room servicing is in progress.',
      label: 'Open housekeeping',
      icon: ClipboardCheck,
      tone: urgentHousekeeping > 0 ? 'rose' : 'blue',
      tab: 'housekeeping' as ActiveTab,
    }] : []),
    ...(openMaintenance.length > 0 ? [{
      id: 'maintenance',
      title: `${openMaintenance.length} open work order${openMaintenance.length === 1 ? '' : 's'}`,
      detail: urgentMaintenance > 0
        ? `${urgentMaintenance} high-priority issue${urgentMaintenance === 1 ? '' : 's'} need attention.`
        : 'Engineering work is within the active queue.',
      label: 'Open maintenance',
      icon: Wrench,
      tone: urgentMaintenance > 0 ? 'rose' : 'blue',
      tab: 'maintenance' as ActiveTab,
    }] : []),
  ];

  const roomStates = [
    { label: 'Ready', value: readyRooms, color: 'bg-emerald-400' },
    { label: 'Occupied', value: rooms.filter((room) => room.status === 'Occupied').length, color: 'bg-blue-400' },
    { label: 'Reserved', value: rooms.filter((room) => room.status === 'Reserved').length, color: 'bg-amber-300' },
    { label: 'Needs service', value: dirtyRooms, color: 'bg-rose-400' },
    { label: 'Out of service', value: outOfServiceRooms, color: 'bg-violet-400' },
  ].filter((state) => state.value > 0);

  return (
    <div className="page-shell">
      <header className="overview-hero">
        <div>
          <div className="page-eyebrow">Today · {formatBusinessDate(metrics.businessDate)}</div>
          <h1 className="page-title">Good day, {firstName}</h1>
          <p className="page-subtitle">
            Here is what is happening across the property and what your team should handle next.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {canViewReservations && (
            <button type="button" onClick={onSearchReservations} className="btn-secondary">
              <Search className="h-4 w-4" />
              Find a reservation
            </button>
          )}
          {canManageReservations && (
            <button type="button" onClick={onOpenNewBooking} className="btn-primary">
              <CalendarPlus className="h-4 w-4" />
              New reservation
            </button>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Property summary">
        <button type="button" onClick={() => onNavigate('tape-chart')} className="overview-metric">
          <span className="overview-metric-icon bg-emerald-400/[0.1] text-emerald-300"><BedDouble className="h-5 w-5" /></span>
          <span>
            <span className="metric-label">Occupancy</span>
            <strong className="metric-value block">{metrics.occupancyRate}%</strong>
            <span className="overview-metric-foot">{readyRooms} rooms ready to sell</span>
          </span>
          <ArrowRight className="overview-metric-arrow" />
        </button>
        <button type="button" onClick={() => onNavigate('reservations')} className="overview-metric" disabled={!canViewReservations}>
          <span className="overview-metric-icon bg-amber-300/[0.1] text-amber-200"><DoorOpen className="h-5 w-5" /></span>
          <span>
            <span className="metric-label">Arrivals today</span>
            <strong className="metric-value block">{metrics.arrivalsToday}</strong>
            <span className="overview-metric-foot">{pendingArrivals.length} still waiting</span>
          </span>
          {canViewReservations && <ArrowRight className="overview-metric-arrow" />}
        </button>
        <button type="button" onClick={() => onNavigate('housekeeping')} className="overview-metric">
          <span className="overview-metric-icon bg-blue-400/[0.1] text-blue-300"><ClipboardCheck className="h-5 w-5" /></span>
          <span>
            <span className="metric-label">Rooms to service</span>
            <strong className="metric-value block">{dirtyRooms}</strong>
            <span className="overview-metric-foot">{activeHousekeeping.length} active team tasks</span>
          </span>
          <ArrowRight className="overview-metric-arrow" />
        </button>
        <button
          type="button"
          onClick={() => canViewFinancials ? onNavigate('analytics') : onNavigate('maintenance')}
          className="overview-metric"
        >
          <span className="overview-metric-icon bg-violet-400/[0.1] text-violet-300">
            {canViewFinancials ? <Sparkles className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
          </span>
          <span>
            <span className="metric-label">{canViewFinancials ? 'Room revenue' : 'Open maintenance'}</span>
            <strong className="metric-value block">
              {canViewFinancials && metrics.financialMetricsAvailable
                ? new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(metrics.totalRevenue)
                : openMaintenance.length}
            </strong>
            <span className="overview-metric-foot">
              {canViewFinancials ? `ADR ${new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(metrics.adr)}` : `${urgentMaintenance} high priority`}
            </span>
          </span>
          <ArrowRight className="overview-metric-arrow" />
        </button>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="surface-panel overflow-hidden" aria-labelledby="attention-heading">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
            <div>
              <h2 id="attention-heading" className="section-heading">Needs attention</h2>
              <p className="section-copy">A short queue ordered around today’s guest flow.</p>
            </div>
            <span className={`status-pill ${attentionItems.length > 0 ? 'badge-reserved' : 'badge-occupied'}`}>
              {attentionItems.length > 0 ? `${attentionItems.length} areas` : 'All clear'}
            </span>
          </div>
          {attentionItems.length > 0 ? (
            <div className="divide-y divide-white/[0.06]">
              {attentionItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.tab)}
                    className="overview-action-row"
                  >
                    <span className={`overview-action-icon ${
                      item.tone === 'rose'
                        ? 'bg-rose-400/[0.1] text-rose-300'
                        : item.tone === 'amber'
                          ? 'bg-amber-300/[0.1] text-amber-200'
                          : 'bg-blue-400/[0.1] text-blue-300'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm font-semibold text-slate-100">{item.title}</strong>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{item.detail}</span>
                    </span>
                    <span className="hidden items-center gap-1.5 text-xs font-semibold text-amber-200 sm:flex">
                      {item.label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/[0.1] text-emerald-300">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-slate-100">The property is in good shape</h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">There are no open arrival, room service, or maintenance alerts.</p>
            </div>
          )}
        </section>

        <section className="surface-panel p-5 sm:p-6" aria-labelledby="room-readiness-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="room-readiness-heading" className="section-heading">Room readiness</h2>
              <p className="section-copy">Live status across {rooms.length} rooms.</p>
            </div>
            <span className="text-2xl font-semibold tracking-[-0.04em] text-slate-100">{operationalRoomPercentage}%</span>
          </div>
          <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-slate-800" aria-label="Room status distribution">
            {roomStates.map((state) => (
              <span
                key={state.label}
                className={`${state.color} min-w-[3px]`}
                style={{ width: `${(state.value / roomTotal) * 100}%` }}
                title={`${state.label}: ${state.value}`}
              />
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {roomStates.map((state) => (
              <div key={state.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2.5 text-slate-400">
                  <span className={`h-2 w-2 rounded-full ${state.color}`} />
                  {state.label}
                </span>
                <strong className="font-semibold text-slate-200">{state.value}</strong>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => onNavigate('tape-chart')} className="btn-secondary mt-6 w-full">
            View room plan
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      </div>

      <section className="surface-panel p-5 sm:p-6" aria-labelledby="quick-actions-heading">
        <div>
          <h2 id="quick-actions-heading" className="section-heading">Quick actions</h2>
          <p className="section-copy">Jump straight into the work your role uses most.</p>
        </div>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {canManageReservations && (
            <button type="button" onClick={onOpenNewBooking} className="overview-quick-action">
              <CalendarPlus className="h-4 w-4 text-amber-300" />
              Create reservation
            </button>
          )}
          {canViewReservations && (
            <button type="button" onClick={() => onNavigate('reservations')} className="overview-quick-action">
              <Users className="h-4 w-4 text-blue-300" />
              Manage arrivals
            </button>
          )}
          <button type="button" onClick={() => onNavigate('housekeeping')} className="overview-quick-action">
            <ClipboardCheck className="h-4 w-4 text-emerald-300" />
            Update room status
          </button>
          <button type="button" onClick={() => onNavigate('maintenance')} className="overview-quick-action">
            <AlertTriangle className="h-4 w-4 text-rose-300" />
            Report an issue
          </button>
        </div>
      </section>
    </div>
  );
};
