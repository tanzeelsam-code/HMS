import React, { useState } from 'react';
import { MaintenanceWorkOrder } from '../types';
import { Wrench, Clock, AlertTriangle, CheckCircle2, Plus, ShieldAlert, User } from 'lucide-react';

interface MaintenanceBoardProps {
  orders: MaintenanceWorkOrder[];
  onAddOrder: (order: MaintenanceWorkOrder) => void | boolean | Promise<void | boolean>;
  onResolveOrder: (orderId: string) => void;
}

export const MaintenanceBoard: React.FC<MaintenanceBoardProps> = ({
  orders,
  onAddOrder,
  onResolveOrder
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Engineering CMMS & Maintenance Hub</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/30">
              Work Orders & Asset History
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Preventive maintenance tracking, Housekeeping escalation loops, and SLA repair countdowns.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form */}
        <div className="lg:col-span-5 glass-panel p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-purple-400" /> Dispatch New Engineering Ticket
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {error && (
              <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200">
                {error}
              </div>
            )}
            <div>
              <label className="block text-gray-400 font-semibold mb-1">Room #</label>
              <input
                type="text"
                value={roomNumber}
                onChange={(e) => {
                  setRoomNumber(e.target.value);
                  resetPendingRequest();
                }}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-amber-300 font-bold font-mono focus:outline-none focus:border-purple-400/50"
                required
              />
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={safetyCritical}
                onChange={(event) => {
                  setSafetyCritical(event.target.checked);
                  resetPendingRequest();
                }}
                className="mt-0.5 h-4 w-4 accent-rose-500"
              />
              <span>
                <span className="block font-bold text-rose-200">Safety-critical escalation</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-gray-400">Creates a critical workflow that must be approved by a General Manager before its engineering task executes.</span>
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as MaintenanceWorkOrder['category']);
                    resetPendingRequest();
                  }}
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                >
                  <option value="Plumbing">Plumbing</option>
                  <option value="Electrical">Electrical</option>
                  <option value="HVAC / AC">HVAC / AC</option>
                  <option value="Door Lock">Door Lock</option>
                  <option value="Furniture">Furniture</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 font-semibold mb-1">SLA Priority</label>
                <select
                  value={priority}
                  onChange={(e) => {
                    setPriority(e.target.value as MaintenanceWorkOrder['priority']);
                    resetPendingRequest();
                  }}
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                >
                  <option value="Urgent">Urgent (30m SLA)</option>
                  <option value="High">High (60m SLA)</option>
                  <option value="Normal">Normal (2h SLA)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-gray-400 font-semibold mb-1">Issue Description</label>
              <textarea
                rows={3}
                placeholder="Describe problem (e.g. Water leak under sink, AC thermostat offline...)"
                value={issueDescription}
                onChange={(e) => {
                  setIssueDescription(e.target.value);
                  resetPendingRequest();
                }}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-purple-400/50"
                required
              />
            </div>

            <button type="submit" disabled={posting} className="btn-primary text-xs w-full py-2.5 justify-center disabled:opacity-50">
              <Plus className="w-4 h-4" /> {posting ? 'Dispatching…' : 'Dispatch Work Order'}
            </button>
          </form>
        </div>

        {/* Active Work Orders List */}
        <div className="lg:col-span-7 glass-panel p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" /> Active Work Orders & SLA Tracker
          </h3>

          <div className="space-y-3">
            {orders.map((o) => (
              <div 
                key={o.id}
                className="p-4 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-purple-400/40 transition-all text-xs"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center font-mono font-bold text-purple-300 flex-shrink-0">
                    #{o.roomNumber}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-100">{o.category}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        o.priority === 'Urgent' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      }`}>
                        {o.priority}
                      </span>
                      {o.safetyCritical && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-rose-500/20 text-rose-200 border border-rose-500/40">
                          Safety
                        </span>
                      )}
                    </div>

                    <p className="text-gray-300 text-xs mt-1">{o.issueDescription}</p>

                    <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-2">
                      <span>Assigned: {o.assignedEngineer}</span>
                      <span>• Reported: {o.reportedTime}</span>
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
                  <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] border ${
                    o.status === 'Resolved' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}>
                    {o.status}
                  </span>

                  {o.status !== 'Resolved' && (
                    <button 
                      onClick={() => onResolveOrder(o.id)}
                      className="btn-secondary text-[11px] px-2.5 py-1 text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark Fixed
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
