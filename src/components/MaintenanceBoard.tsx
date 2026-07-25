import React, { useState } from 'react';
import { MaintenanceWorkOrder } from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  ShieldAlert,
  User,
  Wrench,
} from 'lucide-react';

interface MaintenanceBoardProps {
  orders: MaintenanceWorkOrder[];
  onAddOrder: (order: MaintenanceWorkOrder) => void | boolean | Promise<void | boolean>;
  onResolveOrder: (orderId: string) => void;
}

const priorityStyles: Record<MaintenanceWorkOrder['priority'], string> = {
  Urgent: 'border-rose-300 bg-rose-100 text-rose-900',
  High: 'border-amber-300 bg-amber-100 text-amber-900',
  Normal: 'border-sky-300 bg-sky-100 text-sky-900',
};

const statusStyles: Record<MaintenanceWorkOrder['status'], string> = {
  Open: 'border-amber-300 bg-amber-100 text-amber-900',
  'In-Progress': 'border-sky-300 bg-sky-100 text-sky-900',
  Resolved: 'border-emerald-300 bg-emerald-100 text-emerald-900',
};

export const MaintenanceBoard: React.FC<MaintenanceBoardProps> = ({
  orders,
  onAddOrder,
  onResolveOrder,
}) => {
  const [roomNumber, setRoomNumber] = useState('103');
  const [category, setCategory] = useState<MaintenanceWorkOrder['category']>('Plumbing');
  const [priority, setPriority] = useState<MaintenanceWorkOrder['priority']>('High');
  const [issueDescription, setIssueDescription] = useState('');
  const [safetyCritical, setSafetyCritical] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [pendingRequestId, setPendingRequestId] = useState('');

  const resetPendingRequest = () => {
    setPendingRequestId('');
    setError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (posting) return;
    if (!issueDescription.trim()) {
      setError('Describe the maintenance issue before dispatching it.');
      return;
    }

    const requestId = pendingRequestId || `maint-client-${crypto.randomUUID()}`;
    setPendingRequestId(requestId);
    const newOrder: MaintenanceWorkOrder = {
      id: requestId,
      roomNumber,
      issueDescription: issueDescription.trim(),
      category,
      priority,
      status: 'Open',
      reportedBy: 'Front Desk Admin',
      assignedEngineer: 'Engineering Team',
      slaMinutes: 60,
      reportedTime: 'Just now',
      safetyCritical,
    };

    setPosting(true);
    setError('');
    try {
      const result = await onAddOrder(newOrder);
      if (result !== false) {
        setIssueDescription('');
        setPendingRequestId('');
      } else {
        setError('The work order was not created. Correct the issue or retry; the same request ID will be reused.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to dispatch the work order.');
    } finally {
      setPosting(false);
    }
  };

  const openCount = orders.filter((order) => order.status === 'Open').length;
  const progressCount = orders.filter((order) => order.status === 'In-Progress').length;
  const urgentCount = orders.filter(
    (order) => order.priority === 'Urgent' && order.status !== 'Resolved',
  ).length;
  const resolvedCount = orders.filter((order) => order.status === 'Resolved').length;
  const summaryCards = [
    { label: 'Open orders', value: openCount, icon: Wrench, tone: 'text-amber-800' },
    { label: 'In progress', value: progressCount, icon: Clock, tone: 'text-sky-800' },
    { label: 'Urgent attention', value: urgentCount, icon: AlertTriangle, tone: 'text-rose-800' },
    { label: 'Resolved', value: resolvedCount, icon: CheckCircle2, tone: 'text-emerald-800' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-10 animate-slide-up">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="p-6">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-800">
            <Wrench className="h-4 w-4 text-purple-700" /> Engineering operations
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Maintenance</h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed font-medium text-slate-600">
            Dispatch engineering work, monitor SLA exposure, and close completed repairs.
          </p>
        </div>

        <div className="grid border-t border-slate-200 bg-slate-50 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon, tone }, index) => (
            <div
              key={label}
              className={`flex items-center gap-3 px-6 py-4 ${index > 0 ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-l-0 xl:border-l' : ''}`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-xs">
                <Icon className={`h-4 w-4 ${tone}`} />
              </div>
              <div>
                <div className={`text-lg font-extrabold leading-none ${tone}`}>{value}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white shadow-xs xl:sticky xl:top-6">
          <div className="border-b border-slate-200 px-5 py-5 xl:px-6">
            <h3 className="flex items-center gap-2 font-bold text-slate-900">
              <Plus className="h-4 w-4 text-purple-700" /> New work order
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Create and route an engineering request</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-5 text-xs xl:p-6">
            {error && (
              <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs leading-relaxed font-bold text-rose-900">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="maintenance-room" className="mb-2 block text-xs font-bold text-slate-700">Room number</label>
              <input
                id="maintenance-room"
                type="text"
                value={roomNumber}
                onChange={(event) => {
                  setRoomNumber(event.target.value);
                  resetPendingRequest();
                }}
                className="field-control text-xs font-mono font-bold text-amber-900"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="maintenance-category" className="mb-2 block text-xs font-bold text-slate-700">Category</label>
                <select
                  id="maintenance-category"
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value as MaintenanceWorkOrder['category']);
                    resetPendingRequest();
                  }}
                  className="field-control text-xs"
                >
                  <option value="Plumbing">Plumbing</option>
                  <option value="Electrical">Electrical</option>
                  <option value="HVAC / AC">HVAC / AC</option>
                  <option value="Door Lock">Door lock</option>
                  <option value="Furniture">Furniture</option>
                </select>
              </div>

              <div>
                <label htmlFor="maintenance-priority" className="mb-2 block text-xs font-bold text-slate-700">SLA priority</label>
                <select
                  id="maintenance-priority"
                  value={priority}
                  onChange={(event) => {
                    setPriority(event.target.value as MaintenanceWorkOrder['priority']);
                    resetPendingRequest();
                  }}
                  className="field-control text-xs"
                >
                  <option value="Urgent">Urgent · 30 min</option>
                  <option value="High">High · 60 min</option>
                  <option value="Normal">Normal · 2 hours</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="maintenance-description" className="mb-2 block text-xs font-bold text-slate-700">Issue description</label>
              <textarea
                id="maintenance-description"
                rows={5}
                placeholder="Describe the issue, location, and any immediate impact…"
                value={issueDescription}
                onChange={(event) => {
                  setIssueDescription(event.target.value);
                  resetPendingRequest();
                }}
                className="field-control text-xs resize-y"
                required
              />
            </div>

            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${safetyCritical ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
              <input
                type="checkbox"
                checked={safetyCritical}
                onChange={(event) => {
                  setSafetyCritical(event.target.checked);
                  resetPendingRequest();
                }}
                className="mt-0.5 h-4 w-4 accent-rose-600"
              />
              <span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-700" /> Safety-critical escalation
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed font-semibold text-slate-600">
                  Requires General Manager approval before the engineering task executes.
                </span>
              </span>
            </label>

            <button type="submit" disabled={posting} className="btn-primary min-h-11 w-full justify-center text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">
              <Plus className="h-4 w-4" /> {posting ? 'Dispatching…' : 'Dispatch work order'}
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5 xl:px-6">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <Clock className="h-4 w-4 text-purple-700" /> Work order queue
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Engineering ownership and SLA status</p>
            </div>
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
              {orders.length} total
            </span>
          </div>

          {orders.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {orders.map((order) => (
                <article key={order.id} className="p-5 transition-colors hover:bg-slate-50 xl:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-purple-300 bg-purple-50">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Room</span>
                        <span className="font-mono text-sm font-extrabold text-purple-900">{order.roomNumber}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-900">{order.category}</h4>
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${priorityStyles[order.priority]}`}>{order.priority}</span>
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyles[order.status]}`}>{order.status}</span>
                          {order.safetyCritical && (
                            <span className="flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-900">
                              <ShieldAlert className="h-3 w-3 text-rose-700" /> Safety critical
                            </span>
                          )}
                        </div>
                        <p className="mt-3 max-w-2xl text-xs leading-relaxed font-semibold text-slate-700">{order.issueDescription}</p>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-500">
                          <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" /> {order.assignedEngineer}</span>
                          <span>Reported by {order.reportedBy}</span>
                          <span>{order.reportedTime}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-200 pt-4 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                      <div className="text-left sm:text-right">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target SLA</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">{order.slaMinutes} minutes</div>
                      </div>
                      {order.status !== 'Resolved' && (
                        <button onClick={() => onResolveOrder(order.id)} className="btn-secondary min-h-9 border-emerald-300 px-3 text-xs font-bold text-emerald-900 hover:bg-emerald-50">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" /> Mark resolved
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              <h4 className="mt-4 font-bold text-slate-900">No engineering work orders</h4>
              <p className="mt-1 max-w-sm text-xs leading-relaxed font-semibold text-slate-500">New requests will appear here with ownership and SLA details.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
