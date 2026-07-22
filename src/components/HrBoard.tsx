import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Employee, Shift } from '../types';
import {
  Users, Plus, RefreshCw, AlertTriangle, CalendarClock, BadgeCheck, Briefcase
} from 'lucide-react';

const DEPARTMENTS = ['Front Office', 'Housekeeping', 'Engineering', 'F&B', 'Spa', 'General'];
const SHIFT_TYPES = ['Morning', 'Day', 'Evening', 'Night'];

export const HrBoard: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add employee form
  const [empName, setEmpName] = useState('');
  const [empRole, setEmpRole] = useState('');
  const [empDept, setEmpDept] = useState(DEPARTMENTS[0]);
  const [empShift, setEmpShift] = useState(SHIFT_TYPES[1]);
  const [empRate, setEmpRate] = useState('');
  const [empError, setEmpError] = useState('');
  const [empSaving, setEmpSaving] = useState(false);

  // Add shift form
  const [shEmployee, setShEmployee] = useState('');
  const [shDate, setShDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shStart, setShStart] = useState('09:00');
  const [shEnd, setShEnd] = useState('17:00');
  const [shError, setShError] = useState('');
  const [shSaving, setShSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [emps, shs] = await Promise.all([
      api.get<Employee[]>('/hr/employees'),
      api.get<Shift[]>('/hr/shifts'),
    ]);
    setEmployees(emps);
    setShifts(shs);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load HR data');
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpError('');
    if (!empName.trim() || !empRole.trim()) {
      setEmpError('Name and role are required.');
      return;
    }
    setEmpSaving(true);
    try {
      await api.post('/hr/employees', {
        name: empName.trim(),
        role: empRole.trim(),
        department: empDept,
        shift: empShift,
        hourlyRate: parseFloat(empRate) || 0,
      });
      setEmpName('');
      setEmpRole('');
      setEmpRate('');
      await refresh();
    } catch (err) {
      setEmpError(err instanceof Error ? err.message : 'Failed to add employee');
    } finally {
      setEmpSaving(false);
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setShError('');
    if (!shEmployee || !shDate || !shStart || !shEnd) {
      setShError('Employee, date, start and end are required.');
      return;
    }
    setShSaving(true);
    try {
      await api.post('/hr/shifts', { employeeId: shEmployee, date: shDate, start: shStart, end: shEnd });
      await refresh();
    } catch (err) {
      setShError(err instanceof Error ? err.message : 'Failed to schedule shift');
    } finally {
      setShSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel p-10 flex items-center justify-center text-sm text-gray-400 animate-slide-up">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin text-amber-400" /> Loading staff directory…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Staff & Shift Management</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
              HR Roster • Scheduling
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Employee directory, department roster, and daily shift scheduling.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-900/90 px-4 py-2 rounded-xl border border-blue-500/30">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-300 font-black text-base">
            {employees.filter(e => e.status === 'Active').length}
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Active Staff</div>
            <div className="text-xs font-extrabold text-blue-300">{shifts.length} shifts scheduled</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Employees */}
        <div className="lg:col-span-7 glass-panel p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" /> Employee Directory
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/10">
                  <th className="pb-2 font-bold">Name</th>
                  <th className="pb-2 font-bold">Role</th>
                  <th className="pb-2 font-bold">Department</th>
                  <th className="pb-2 font-bold">Shift</th>
                  <th className="pb-2 font-bold text-right">Rate/hr</th>
                  <th className="pb-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2 font-semibold text-gray-100">{e.name}</td>
                    <td className="py-2 text-gray-300">{e.role}</td>
                    <td className="py-2 text-gray-400">{e.department}</td>
                    <td className="py-2 text-gray-400">{e.shift}</td>
                    <td className="py-2 text-right font-mono text-gray-200">${e.hourlyRate.toFixed(2)}</td>
                    <td className="py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${
                        e.status === 'Active'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add employee */}
          <form onSubmit={handleAddEmployee} className="pt-3 border-t border-white/10 space-y-3 text-xs">
            <div className="font-bold text-gray-100 flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-blue-400" /> Add Employee
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text" placeholder="Full name"
                value={empName} onChange={e => setEmpName(e.target.value)}
                className="p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-blue-400/50"
                required
              />
              <input
                type="text" placeholder="Role (e.g. Concierge)"
                value={empRole} onChange={e => setEmpRole(e.target.value)}
                className="p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-blue-400/50"
                required
              />
              <select
                value={empDept} onChange={e => setEmpDept(e.target.value)}
                className="p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
              >
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="flex gap-3">
                <select
                  value={empShift} onChange={e => setEmpShift(e.target.value)}
                  className="flex-1 p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                >
                  {SHIFT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  type="number" min="0" step="0.5" placeholder="$/hr"
                  value={empRate} onChange={e => setEmpRate(e.target.value)}
                  className="w-24 p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200 font-mono"
                />
              </div>
            </div>
            {empError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 text-[11px] font-semibold">
                {empError}
              </div>
            )}
            <button type="submit" disabled={empSaving} className="btn-primary text-xs px-4 py-2 disabled:opacity-60">
              <Plus className="w-3.5 h-3.5" /> {empSaving ? 'Adding…' : 'Add Employee'}
            </button>
          </form>
        </div>

        {/* Shifts */}
        <div className="lg:col-span-5 glass-panel p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-400" /> Shift Schedule
          </h3>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {shiftsByDate.length === 0 && (
              <div className="p-3 rounded-xl bg-slate-900 border border-white/10 text-xs text-gray-400">
                No shifts scheduled.
              </div>
            )}
            {shiftsByDate.map(([date, dayShifts]) => (
              <div key={date} className="rounded-xl bg-slate-900/80 border border-white/10 overflow-hidden">
                <div className="px-3 py-2 bg-white/5 text-[11px] font-bold text-blue-300 flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5" /> {date}
                </div>
                <div className="divide-y divide-white/5">
                  {dayShifts.map(s => (
                    <div key={s.id} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-gray-200 font-semibold">{s.employeeName}</span>
                      <span className="font-mono text-gray-400">{s.start} – {s.end}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Add shift */}
          <form onSubmit={handleAddShift} className="pt-3 border-t border-white/10 space-y-3 text-xs">
            <div className="font-bold text-gray-100 flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-blue-400" /> Schedule Shift
            </div>
            <select
              value={shEmployee} onChange={e => setShEmployee(e.target.value)}
              className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
              required
            >
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-3">
              <input
                type="date" value={shDate} onChange={e => setShDate(e.target.value)}
                className="p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                required
              />
              <input
                type="time" value={shStart} onChange={e => setShStart(e.target.value)}
                className="p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                required
              />
              <input
                type="time" value={shEnd} onChange={e => setShEnd(e.target.value)}
                className="p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                required
              />
            </div>
            {shError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 text-[11px] font-semibold">
                {shError}
              </div>
            )}
            <button type="submit" disabled={shSaving} className="btn-primary text-xs px-4 py-2 disabled:opacity-60">
              <BadgeCheck className="w-3.5 h-3.5" /> {shSaving ? 'Scheduling…' : 'Schedule Shift'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
