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
    card: 'border-emerald-300 bg-emerald-50',
    dot: 'bg-emerald-500',
  },
  'Vacant Dirty': {
    card: 'border-rose-300 bg-rose-50',
    dot: 'bg-rose-500',
  },
  Occupied: {
    card: 'border-sky-300 bg-sky-50',
    dot: 'bg-sky-500',
  },
  Reserved: {
    card: 'border-amber-300 bg-amber-50',
    dot: 'bg-amber-500',
  },
  'Out of Service': {
    card: 'border-purple-300 bg-purple-50',
    dot: 'bg-purple-500',
  },
};

const priorityStyles: Record<HousekeepingTask['priority'], string> = {
  Urgent: 'border-rose-300 bg-rose-100 text-rose-900',
  High: 'border-amber-300 bg-amber-100 text-amber-900',
  Normal: 'border-sky-300 bg-sky-100 text-sky-900',
};

const taskStatusStyles: Record<HousekeepingTask['status'], string> = {
  Completed: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  Inspected: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  'In-Progress': 'border-amber-300 bg-amber-100 text-amber-900',
  Pending: 'border-slate-300 bg-slate-100 text-slate-800',
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
    { label: 'Ready rooms', value: cleanCount, icon: Sparkles, tone: 'text-emerald-800' },
    { label: 'Needs cleaning', value: dirtyCount, icon: BedDouble, tone: 'text-rose-800' },
    { label: 'Occupied', value: occupiedCount, icon: DoorOpen, tone: 'text-sky-800' },
    { label: 'Out of service', value: oooCount, icon: ClipboardCheck, tone: 'text-purple-800' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-10 animate-slide-up">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
              <Sparkles className="h-4 w-4 text-amber-700" /> Rooms division
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Housekeeping</h2>
            <p className="mt-2 text-xs leading-relaxed font-medium text-slate-600">
              Coordinate room readiness, inspection status, and assigned cleaning work.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold">
            <span className="text-slate-500 font-bold">Active work queue</span>
            <span className="ml-3 font-extrabold text-slate-900">{activeTasks} task{activeTasks === 1 ? '' : 's'}</span>
          </div>
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs xl:p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Room readiness</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Live status across all floors</p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
            {[
              ['Ready', 'bg-emerald-500'],
              ['Cleaning', 'bg-rose-500'],
              ['Occupied', 'bg-sky-500'],
              ['Unavailable', 'bg-purple-500'],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${color}`} /> {label}
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
                      <div className="font-mono text-base font-bold text-slate-900">{room.number}</div>
                      <div className="mt-1 text-[10px] font-semibold text-slate-500">Floor {room.floor}</div>
                    </div>
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${style.dot}`} />
                  </div>
                  <div className="mt-3 min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-slate-500">{room.type}</p>
                    <p className="mt-1 text-xs font-extrabold text-slate-900">{room.status}</p>
                  </div>
                  {isDirty && (
                    <button
                      onClick={() => onUpdateRoomStatus(room.number, 'Vacant Clean')}
                      className="mt-3 flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-100 px-2 text-[11px] font-bold text-emerald-900 transition-colors hover:bg-emerald-200"
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
            <BedDouble className="h-8 w-8 text-slate-400" />
            <h4 className="mt-4 font-bold text-slate-900">No rooms available</h4>
            <p className="mt-1 text-xs font-semibold text-slate-500">Room readiness will appear here when inventory is loaded.</p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5 xl:px-6">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-slate-900">
              <ClipboardCheck className="h-4 w-4 text-amber-700" /> Assigned work
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Prioritized by service urgency and room readiness</p>
          </div>
          <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {tasks.length} total
          </span>
        </div>

        {tasks.length > 0 ? (
          <div className="divide-y divide-slate-200">
            {tasks.map((task) => (
              <article key={task.id} className="grid gap-4 px-5 py-5 transition-colors hover:bg-slate-50 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center xl:px-6">
                <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-amber-300 bg-amber-50">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Room</span>
                  <span className="font-mono text-sm font-extrabold text-amber-900">{task.roomNumber}</span>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-slate-900">{task.taskType}</h4>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${priorityStyles[task.priority]}`}>
                      {task.priority} priority
                    </span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${taskStatusStyles[task.status]}`}>
                      {task.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" /> {task.assignedTo}</span>
                    <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" /> {task.etaMinutes} min estimate</span>
                    <span>{task.roomType} · Floor {task.floor}</span>
                  </div>
                </div>

                {task.status !== 'Completed' && (
                  <button onClick={() => onCompleteTask(task.id)} className="btn-secondary min-h-10 justify-center px-4 text-xs font-bold text-emerald-900 border-emerald-300 hover:bg-emerald-50">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" /> Finish & inspect
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <h4 className="mt-4 font-bold text-slate-900">Work queue is clear</h4>
            <p className="mt-1 text-xs font-semibold text-slate-500">New housekeeping assignments will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
};
