import React from 'react';
import { HousekeepingTask, Room } from '../types';
import {
  BedDouble,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DoorOpen,
  Sparkles,
  User,
} from 'lucide-react';

interface HousekeepingBoardProps {
  tasks: HousekeepingTask[];
  rooms: Room[];
  onCompleteTask: (taskId: string) => void;
  onUpdateRoomStatus: (roomNumber: string, status: Room['status']) => void;
}

const roomStyles: Record<Room['status'], { card: string; dot: string }> = {
  'Vacant Clean': {
    card: 'border-emerald-400/20 bg-emerald-400/[0.07]',
    dot: 'bg-emerald-400',
  },
  'Vacant Dirty': {
    card: 'border-rose-400/20 bg-rose-400/[0.07]',
    dot: 'bg-rose-400',
  },
  Occupied: {
    card: 'border-sky-400/15 bg-sky-400/[0.05]',
    dot: 'bg-sky-400',
  },
  Reserved: {
    card: 'border-amber-400/15 bg-amber-400/[0.05]',
    dot: 'bg-amber-400',
  },
  'Out of Service': {
    card: 'border-violet-400/20 bg-violet-400/[0.07]',
    dot: 'bg-violet-400',
  },
};

const priorityStyles: Record<HousekeepingTask['priority'], string> = {
  Urgent: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
  High: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  Normal: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
};

const taskStatusStyles: Record<HousekeepingTask['status'], string> = {
  Completed: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  Inspected: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  'In-Progress': 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  Pending: 'border-white/10 bg-white/[0.04] text-slate-300',
};

export const HousekeepingBoard: React.FC<HousekeepingBoardProps> = ({
  tasks,
  rooms,
  onCompleteTask,
  onUpdateRoomStatus,
}) => {
  const dirtyCount = rooms.filter((room) => room.status === 'Vacant Dirty').length;
  const cleanCount = rooms.filter((room) => room.status === 'Vacant Clean').length;
  const occupiedCount = rooms.filter((room) => room.status === 'Occupied').length;
  const oooCount = rooms.filter((room) => room.status === 'Out of Service').length;
  const activeTasks = tasks.filter((task) => !['Completed', 'Inspected'].includes(task.status)).length;

  const summaryCards = [
    { label: 'Ready rooms', value: cleanCount, icon: Sparkles, tone: 'text-emerald-300' },
    { label: 'Needs cleaning', value: dirtyCount, icon: BedDouble, tone: 'text-rose-300' },
    { label: 'Occupied', value: occupiedCount, icon: DoorOpen, tone: 'text-sky-300' },
    { label: 'Out of service', value: oooCount, icon: ClipboardCheck, tone: 'text-violet-300' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-10 animate-slide-up">
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/65 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
              <Sparkles className="h-4 w-4" /> Rooms division
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Housekeeping</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Coordinate room readiness, inspection status, and assigned cleaning work.
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-4 py-3 text-sm">
            <span className="text-slate-500">Active work queue</span>
            <span className="ml-3 font-semibold text-white">{activeTasks} task{activeTasks === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="grid border-t border-white/[0.07] sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon, tone }, index) => (
            <div
              key={label}
              className={`flex items-center gap-3 px-6 py-4 ${index > 0 ? 'border-t border-white/[0.07] sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-l-0 xl:border-l' : ''}`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                <Icon className={`h-4 w-4 ${tone}`} />
              </div>
              <div>
                <div className={`text-lg font-semibold leading-none ${tone}`}>{value}</div>
                <div className="mt-1 text-xs text-slate-500">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-slate-900/55 p-5 shadow-[0_12px_35px_rgba(0,0,0,0.16)] xl:p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-slate-100">Room readiness</h3>
            <p className="mt-1 text-xs text-slate-500">Live status across all floors</p>
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
            {[
              ['Ready', 'bg-emerald-400'],
              ['Cleaning', 'bg-rose-400'],
              ['Occupied', 'bg-sky-400'],
              ['Unavailable', 'bg-violet-400'],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${color}`} /> {label}
              </span>
            ))}
          </div>
        </div>

        {rooms.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
            {rooms.map((room) => {
              const isDirty = room.status === 'Vacant Dirty';
              const style = roomStyles[room.status];

              return (
                <article key={room.id} className={`flex min-h-32 flex-col rounded-xl border p-3.5 ${style.card}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-base font-semibold text-white">{room.number}</div>
                      <div className="mt-1 text-[10px] text-slate-500">Floor {room.floor}</div>
                    </div>
                    <span className={`mt-1 h-2 w-2 rounded-full ${style.dot}`} />
                  </div>
                  <div className="mt-3 min-w-0 flex-1">
                    <p className="truncate text-[11px] text-slate-500">{room.type}</p>
                    <p className="mt-1 text-xs font-medium text-slate-200">{room.status}</p>
                  </div>
                  {isDirty && (
                    <button
                      onClick={() => onUpdateRoomStatus(room.number, 'Vacant Clean')}
                      className="mt-3 flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 text-[11px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/20"
                    >
                      <Check className="h-3.5 w-3.5" /> Mark clean
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center text-center">
            <BedDouble className="h-8 w-8 text-slate-600" />
            <h4 className="mt-4 font-semibold text-slate-200">No rooms available</h4>
            <p className="mt-1 text-sm text-slate-500">Room readiness will appear here when inventory is loaded.</p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/55 shadow-[0_12px_35px_rgba(0,0,0,0.16)]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-5 xl:px-6">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-slate-100">
              <ClipboardCheck className="h-4 w-4 text-amber-300" /> Assigned work
            </h3>
            <p className="mt-1 text-xs text-slate-500">Prioritized by service urgency and room readiness</p>
          </div>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-slate-400">
            {tasks.length} total
          </span>
        </div>

        {tasks.length > 0 ? (
          <div className="divide-y divide-white/[0.06]">
            {tasks.map((task) => (
              <article key={task.id} className="grid gap-4 px-5 py-5 transition-colors hover:bg-white/[0.02] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center xl:px-6">
                <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-white/[0.09] bg-slate-950/40">
                  <span className="text-[9px] uppercase tracking-wider text-slate-500">Room</span>
                  <span className="font-mono text-sm font-semibold text-amber-300">{task.roomNumber}</span>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-slate-100">{task.taskType}</h4>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${priorityStyles[task.priority]}`}>
                      {task.priority} priority
                    </span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${taskStatusStyles[task.status]}`}>
                      {task.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {task.assignedTo}</span>
                    <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {task.etaMinutes} min estimate</span>
                    <span>{task.roomType} · Floor {task.floor}</span>
                  </div>
                </div>

                {task.status !== 'Completed' && (
                  <button onClick={() => onCompleteTask(task.id)} className="btn-secondary min-h-10 justify-center px-4 text-xs text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Finish & inspect
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400/60" />
            <h4 className="mt-4 font-semibold text-slate-200">Work queue is clear</h4>
            <p className="mt-1 text-sm text-slate-500">New housekeeping assignments will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
};
