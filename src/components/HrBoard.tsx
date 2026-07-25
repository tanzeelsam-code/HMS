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
      <div className="surface-panel bg-white p-10 flex items-center justify-center text-sm font-semibold text-slate-500 border border-slate-200 animate-slide-up">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin text-amber-600" /> Loading staff directory…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 surface-panel bg-white p-5 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Staff & Shift Management</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
              HR Roster • Scheduling
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Employee directory, department roster, and daily shift scheduling.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-800 font-black text-base">
            {employees.filter(e => e.status === 'Active').length}
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Active Staff</div>
            <div className="text-xs font-extrabold text-blue-700">{shifts.length} shifts scheduled</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Employees */}
        <div className="lg:col-span-7 surface-panel bg-white p-5 space-y-3 border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" /> Employee Directory
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-bold">Name</th>
                  <th className="pb-2 font-bold">Role</th>
                  <th className="pb-2 font-bold">Department</th>
                  <th className="pb-2 font-bold">Shift</th>
                  <th className="pb-2 font-bold text-right">Rate/hr</th>
                  <th className="pb-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 font-bold text-slate-900">{e.name}</td>
                    <td className="py-2.5 text-slate-700 font-semibold">{e.role}</td>
                    <td className="py-2.5 text-slate-600">{e.department}</td>
                    <td className="py-2.5 text-slate-600">{e.shift}</td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900">${e.hourlyRate.toFixed(2)}</td>
                    <td className="py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${
                        e.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
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
          <form onSubmit={handleAddEmployee} className="pt-3 border-t border-slate-200 space-y-3 text-xs">
            <div className="font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-blue-600" /> Add Employee
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text" placeholder="Full name"
                value={empName} onChange={e => setEmpName(e.target.value)}
                className="field-control text-xs"
                required
              />
              <input
                type="text" placeholder="Role (e.g. Concierge)"
                value={empRole} onChange={e => setEmpRole(e.target.value)}
                className="field-control text-xs"
                required
              />
              <select
                value={empDept} onChange={e => setEmpDept(e.target.value)}
                className="field-control text-xs"
              >
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="flex gap-3">
                <select
                  value={empShift} onChange={e => setEmpShift(e.target.value)}
                  className="field-control text-xs flex-1"
                >
                  {SHIFT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  type="number" min="0" step="0.5" placeholder="$/hr"
                  value={empRate} onChange={e => setEmpRate(e.target.value)}
                  className="field-control text-xs w-24 font-mono"
                />
              </div>
            </div>
            {empError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold">
                {empError}
              </div>
            )}
            <button type="submit" disabled={empSaving} className="btn-primary text-xs px-4 py-2 disabled:opacity-60">
              <Plus className="w-3.5 h-3.5" /> {empSaving ? 'Adding…' : 'Add Employee'}
            </button>
          </form>
        </div>

        {/* Shifts */}
        <div className="lg:col-span-5 surface-panel bg-white p-5 space-y-3 border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-600" /> Shift Schedule
          </h3>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {shiftsByDate.length === 0 && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 font-semibold">
                No shifts scheduled.
              </div>
            )}
            {shiftsByDate.map(([date, dayShifts]) => (
              <div key={date} className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-100 text-[11px] font-bold text-blue-900 flex items-center gap-2 border-b border-slate-200">
                  <Briefcase className="w-3.5 h-3.5 text-blue-600" /> {date}
                </div>
                <div className="divide-y divide-slate-100 bg-white">
                  {dayShifts.map(s => (
                    <div key={s.id} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-slate-900 font-bold">{s.employeeName}</span>
                      <span className="font-mono text-slate-600 font-semibold">{s.start} – {s.end}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Add shift */}
          <form onSubmit={handleAddShift} className="pt-3 border-t border-slate-200 space-y-3 text-xs">
            <div className="font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-blue-600" /> Schedule Shift
            </div>
            <select
              value={shEmployee} onChange={e => setShEmployee(e.target.value)}
              className="field-control text-xs"
              required
            >
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-3">
              <input
                type="date" value={shDate} onChange={e => setShDate(e.target.value)}
                className="field-control text-xs"
                required
              />
              <input
                type="time" value={shStart} onChange={e => setShStart(e.target.value)}
                className="field-control text-xs"
                required
              />
              <input
                type="time" value={shEnd} onChange={e => setShEnd(e.target.value)}
                className="field-control text-xs"
                required
              />
            </div>
            {shError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold">
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
