import React from 'react';
import { HousekeepingTask, Room } from '../types';
import { ClipboardCheck, Sparkles, CheckCircle2, Clock, Wrench, ShieldAlert, User, Check } from 'lucide-react';

interface HousekeepingBoardProps {
  tasks: HousekeepingTask[];
  rooms: Room[];
  onCompleteTask: (taskId: string) => void;
  onUpdateRoomStatus: (roomNumber: string, status: Room['status']) => void;
}

export const HousekeepingBoard: React.FC<HousekeepingBoardProps> = ({
  tasks,
  rooms,
  onCompleteTask,
  onUpdateRoomStatus
}) => {
  const dirtyCount = rooms.filter(r => r.status === 'Vacant Dirty').length;
  const cleanCount = rooms.filter(r => r.status === 'Vacant Clean').length;
  const oooCount = rooms.filter(r => r.status === 'Out of Service').length;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <h2 className="text-xl font-bold text-gray-100 tracking-tight">Smart Housekeeping & Maintenance Hub</h2>
          <p className="text-xs text-gray-400 mt-1">
            Real-time floor dispatch, automated room inspection queues, and staff task tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-rose-500/30 text-xs">
            <span className="text-gray-400">Needs Cleaning: </span>
            <span className="font-extrabold text-rose-400">{dirtyCount} Rooms</span>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-emerald-500/30 text-xs">
            <span className="text-gray-400">Ready / Inspected: </span>
            <span className="font-extrabold text-emerald-400">{cleanCount} Rooms</span>
          </div>
        </div>
      </div>

      {/* Quick Room Grid Status Map */}
      <div className="glass-panel p-5 space-y-3">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> Room Turnaround Overview
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {rooms.map((room) => {
            const isDirty = room.status === 'Vacant Dirty';
            const isClean = room.status === 'Vacant Clean';
            const isOccupied = room.status === 'Occupied';
            const isOOO = room.status === 'Out of Service';

            return (
              <div 
                key={room.id}
                className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                  isDirty ? 'bg-rose-500/10 border-rose-500/40 text-rose-200' :
                  isClean ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200' :
                  isOccupied ? 'bg-blue-500/10 border-blue-500/30 text-blue-200' :
                  'bg-purple-500/10 border-purple-500/30 text-purple-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm">#{room.number}</span>
                  <span className="text-[10px] opacity-80">{room.type.split(' ')[0]}</span>
                </div>

                <div className="text-[11px] font-semibold mt-2 truncate">
                  {room.status}
                </div>

                {isDirty && (
                  <button 
                    onClick={() => onUpdateRoomStatus(room.number, 'Vacant Clean')}
                    className="mt-2 text-[10px] font-bold px-2 py-1 rounded bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Mark Clean
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Cleaning Tasks Queue */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-amber-400" /> Active Housekeeper Work Queue
          </h3>
          <span className="text-xs text-gray-400">{tasks.length} Assigned Tasks</span>
        </div>

        <div className="space-y-3">
          {tasks.map((task) => (
            <div 
              key={task.id}
              className="p-4 rounded-xl bg-slate-900/70 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-amber-400/30 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-sm">
                  #{task.roomNumber}
                </div>

                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-sm text-gray-100">{task.taskType}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      task.priority === 'Urgent' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    }`}>
                      {task.priority} Priority
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-amber-400" /> Assigned: {task.assignedTo}
                    </span>
                    <span className="flex items-center gap-1 text-gray-500">
                      <Clock className="w-3 h-3" /> Est. {task.etaMinutes} mins remaining
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                  task.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  Status: {task.status}
                </span>

                {task.status !== 'Completed' && (
                  <button 
                    onClick={() => onCompleteTask(task.id)}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Finish & Inspect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
