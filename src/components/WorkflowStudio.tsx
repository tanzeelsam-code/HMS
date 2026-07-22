import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CirclePause,
  ClipboardCheck,
  Clock3,
  FileClock,
  GitBranch,
  ListChecks,
  LockKeyhole,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { api, getStoredUser } from '../api';

type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
type ApprovalMode = 'risk-based' | 'always' | 'never';
type TemplateStatus = 'Active' | 'Paused' | 'Archived';
type RunStatus = 'Awaiting Approval' | 'Running' | 'Completed' | 'Rejected' | 'Failed';
type TaskStatus = 'Open' | 'In Progress' | 'Blocked' | 'Completed' | 'Cancelled';
type TaskPriority = 'Low' | 'Normal' | 'High' | 'Urgent';
type StudioView = 'command' | 'templates' | 'tasks' | 'audit';

interface CreateTaskAction {
  type: 'create_task';
  title: string;
  description: string;
  department: string;
  assignedTo: string;
  priority: TaskPriority;
  roomNumber: string;
  dueInMinutes: number;
  metadata?: Record<string, unknown>;
}

interface AuditNoteAction {
  type: 'audit_note';
  message: string;
}

type WorkflowAction = CreateTaskAction | AuditNoteAction;

interface WorkflowTemplateRecord {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  actions: WorkflowAction[];
  riskLevel: RiskLevel;
  approvalMode: ApprovalMode;
  status: TemplateStatus;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  runCount?: number;
  lastRunAt?: string | null;
}

interface WorkflowExecutionOutput {
  schemaVersion?: number;
  decision?: {
    riskLevel?: RiskLevel;
    approvalMode?: ApprovalMode;
    approvalRequired?: boolean;
    outcome?: string;
    reason?: string;
  };
  actions?: Array<{ index: number; type: string; status: string; taskId?: string }>;
  createdTaskIds?: string[];
  startedAt?: string;
  completedAt?: string;
}

interface WorkflowRunRecord {
  id: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  idempotencyKey: string;
  status: RunStatus;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  context: Record<string, unknown>;
  executionOutput: WorkflowExecutionOutput;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  taskCount?: number;
}

interface WorkflowTaskRecord {
  id: string;
  runId: string | null;
  templateId: string | null;
  title: string;
  description: string;
  department: string;
  assignedTo: string;
  priority: TaskPriority;
  status: TaskStatus;
  roomNumber: string | null;
  dueAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

interface WorkflowAuditRecord {
  id: string;
  entityType: 'template' | 'run' | 'task';
  entityId: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface TemplateDraft {
  name: string;
  description: string;
  triggerType: string;
  riskLevel: RiskLevel;
  approvalMode: ApprovalMode;
  taskTitle: string;
  taskDescription: string;
  department: string;
  assignedTo: string;
  priority: TaskPriority;
  dueInMinutes: string;
}

interface TaskDraft {
  title: string;
  description: string;
  department: string;
  assignedTo: string;
  priority: TaskPriority;
  roomNumber: string;
  dueAt: string;
}

const blankTemplateDraft = (): TemplateDraft => ({
  name: '',
  description: '',
  triggerType: 'manual',
  riskLevel: 'Low',
  approvalMode: 'risk-based',
  taskTitle: '',
  taskDescription: '',
  department: 'Front Office',
  assignedTo: 'Duty Manager Queue',
  priority: 'Normal',
  dueInMinutes: '60',
});

const blankTaskDraft = (): TaskDraft => ({
  title: '',
  description: '',
  department: 'Front Office',
  assignedTo: 'Duty Manager Queue',
  priority: 'Normal',
  roomNumber: '',
  dueAt: '',
});

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Not yet';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : value;
};

const relativeTime = (value?: string | null) => {
  if (!value) return 'Never';
  const difference = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(difference)) return 'Unknown';
  const minutes = Math.round(Math.abs(difference) / 60_000);
  const suffix = difference >= 0 ? 'ago' : 'from now';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ${suffix}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  return `${Math.round(hours / 24)}d ${suffix}`;
};

const isApprovalRequired = (risk: RiskLevel, mode: ApprovalMode) =>
  mode === 'always' || (mode === 'risk-based' && (risk === 'High' || risk === 'Critical'));

const riskStyle = (risk: RiskLevel) => ({
  Low: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  Medium: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  High: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Critical: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
}[risk]);

const priorityStyle = (priority: TaskPriority) => ({
  Low: 'bg-slate-500/10 text-slate-300 border-white/10',
  Normal: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  High: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Urgent: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
}[priority]);

const runStatusStyle = (status: RunStatus) => ({
  'Awaiting Approval': 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Running: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  Rejected: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  Failed: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
}[status]);

const taskStatusStyle = (status: TaskStatus) => ({
  Open: 'bg-slate-500/10 text-slate-300 border-white/10',
  'In Progress': 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Blocked: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  Cancelled: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
}[status]);

const triggerLabel = (trigger: string) => trigger
  .split(/[._-]/)
  .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
  .join(' · ');

const actionLabel = (action: string) => action.replace(/_/g, ' ').replace(/\b\w/g, (char: string) => char.toUpperCase());

const fieldClass = 'w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-gray-100 outline-none transition focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/10';
const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400';

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${className}`}>{children}</span>;
}

function EmptyState({ icon: Icon, title, body }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/30 px-6 text-center">
      <Icon className="mb-3 h-6 w-6 text-gray-500" />
      <p className="text-sm font-bold text-gray-200">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">{body}</p>
    </div>
  );
}

export const WorkflowStudio: React.FC = () => {
  const currentUser = getStoredUser();
  const canManage = currentUser?.role === 'General Manager';
  const [view, setView] = useState<StudioView>('command');
  const [templates, setTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [runs, setRuns] = useState<WorkflowRunRecord[]>([]);
  const [tasks, setTasks] = useState<WorkflowTaskRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<WorkflowAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const [templateEditor, setTemplateEditor] = useState<WorkflowTemplateRecord | 'new' | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(blankTemplateDraft);
  const [runTarget, setRunTarget] = useState<WorkflowTemplateRecord | null>(null);
  const [runContext, setRunContext] = useState({ guestName: '', roomNumber: '', note: '' });
  const [runRequestId, setRunRequestId] = useState('');
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(blankTaskDraft);
  const [rejectTarget, setRejectTarget] = useState<WorkflowRunRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    setError('');
    try {
      const [nextTemplates, nextRuns, nextTasks, nextAudit] = await Promise.all([
        api.get<WorkflowTemplateRecord[]>('/workflows/templates?status=all&limit=100'),
        api.get<WorkflowRunRecord[]>('/workflows/runs?limit=80'),
        api.get<WorkflowTaskRecord[]>('/workflows/tasks?status=all&limit=150'),
        api.get<WorkflowAuditRecord[]>('/workflows/audit?limit=80'),
      ]);
      setTemplates(nextTemplates);
      setRuns(nextRuns);
      setTasks(nextTasks);
      setAuditEvents(nextAudit);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Workflow data could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setTemplateEditor(null);
      setRunTarget(null);
      setTaskEditorOpen(false);
      setRejectTarget(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeTemplates = useMemo(() => templates.filter((template) => template.status === 'Active'), [templates]);
  const approvalQueue = useMemo(() => runs.filter((run) => run.status === 'Awaiting Approval'), [runs]);
  const openTasks = useMemo(
    () => tasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status)),
    [tasks],
  );
  const overdueTasks = useMemo(
    () => openTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < Date.now()),
    [openTasks],
  );
  const completedRuns = useMemo(() => runs.filter((run) => run.status === 'Completed'), [runs]);
  const autoExecuted = useMemo(
    () => completedRuns.filter((run) => run.executionOutput.decision?.outcome === 'auto-approved-by-policy').length,
    [completedRuns],
  );

  const openNewTemplate = () => {
    setTemplateDraft(blankTemplateDraft());
    setTemplateEditor('new');
  };

  const openEditTemplate = (template: WorkflowTemplateRecord) => {
    const taskAction = template.actions.find((action): action is CreateTaskAction => action.type === 'create_task');
    setTemplateDraft({
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      riskLevel: template.riskLevel,
      approvalMode: template.approvalMode,
      taskTitle: taskAction?.title || '',
      taskDescription: taskAction?.description || '',
      department: taskAction?.department || 'Front Office',
      assignedTo: taskAction?.assignedTo || '',
      priority: taskAction?.priority || 'Normal',
      dueInMinutes: String(taskAction?.dueInMinutes ?? 60),
    });
    setTemplateEditor(template);
  };

  const openRun = (template: WorkflowTemplateRecord) => {
    setRunContext({ guestName: '', roomNumber: '', note: '' });
    setRunRequestId(`workflow-client-${crypto.randomUUID()}`);
    setRunTarget(template);
  };

  const mutate = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    setError('');
    try {
      await action();
      setNotice(success);
      await refresh(true);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The operation could not be completed.');
      return false;
    } finally {
      setBusyId('');
    }
  };

  const saveTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!templateEditor) return;
    const dueInMinutes = Number(templateDraft.dueInMinutes);
    if (!Number.isInteger(dueInMinutes) || dueInMinutes < 0 || dueInMinutes > 43200) {
      setError('Task due time must be a whole number from 0 to 43,200 minutes.');
      return;
    }
    const existing = templateEditor === 'new' ? null : templateEditor;
    const existingAction = existing?.actions.find((action): action is CreateTaskAction => action.type === 'create_task');
    const preservedActions = existing?.actions.filter((action) => action.type !== 'create_task') || [];
    const actions: WorkflowAction[] = [
      {
        type: 'create_task',
        title: templateDraft.taskTitle,
        description: templateDraft.taskDescription,
        department: templateDraft.department,
        assignedTo: templateDraft.assignedTo,
        priority: templateDraft.priority,
        roomNumber: existingAction?.roomNumber || '{{roomNumber}}',
        dueInMinutes,
        metadata: existingAction?.metadata || { source: 'workflow-studio' },
      },
      ...preservedActions,
    ];
    const body = {
      name: templateDraft.name,
      description: templateDraft.description,
      triggerType: templateDraft.triggerType,
      triggerConfig: existing?.triggerConfig || {},
      riskLevel: templateDraft.riskLevel,
      approvalMode: templateDraft.approvalMode,
      status: existing?.status || 'Active',
      actions,
      ...(existing ? { version: existing.version } : {}),
    };
    const ok = await mutate(
      existing?.id || 'new-template',
      () => existing
        ? api.patch(`/workflows/templates/${existing.id}`, body)
        : api.post('/workflows/templates', body),
      existing ? 'Workflow version saved.' : 'Workflow created and activated.',
    );
    if (ok) setTemplateEditor(null);
  };

  const setTemplateStatus = async (template: WorkflowTemplateRecord, status: TemplateStatus) => {
    await mutate(
      `template-${template.id}`,
      () => api.patch(`/workflows/templates/${template.id}`, { status, version: template.version }),
      status === 'Active' ? 'Workflow activated.' : status === 'Paused' ? 'Workflow paused.' : 'Workflow archived.',
    );
  };

  const runWorkflow = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!runTarget) return;
    const ok = await mutate(
      `run-${runTarget.id}`,
      () => api.post(`/workflows/templates/${runTarget.id}/run`, {
        idempotencyKey: runRequestId,
        context: runContext,
      }),
      isApprovalRequired(runTarget.riskLevel, runTarget.approvalMode)
        ? 'Run submitted to the manager approval queue.'
        : 'Workflow executed and task output persisted.',
    );
    // Keep the same key on failure so a retry cannot duplicate execution.
    if (ok) {
      setRunTarget(null);
      setRunRequestId('');
    }
  };

  const approveRun = async (run: WorkflowRunRecord) => {
    await mutate(
      `approve-${run.id}`,
      () => api.post(`/workflows/runs/${run.id}/approve`),
      'Workflow approved and executed.',
    );
  };

  const rejectRun = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rejectTarget) return;
    const ok = await mutate(
      `reject-${rejectTarget.id}`,
      () => api.post(`/workflows/runs/${rejectTarget.id}/reject`, { reason: rejectReason }),
      'Workflow run rejected with an audit record.',
    );
    if (ok) {
      setRejectTarget(null);
      setRejectReason('');
    }
  };

  const saveManualTask = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await mutate(
      'new-task',
      () => api.post('/workflows/tasks', {
        ...taskDraft,
        dueAt: taskDraft.dueAt ? new Date(taskDraft.dueAt).toISOString() : null,
        metadata: { source: 'workflow-studio-manual' },
      }),
      'Operational task created.',
    );
    if (ok) {
      setTaskEditorOpen(false);
      setTaskDraft(blankTaskDraft());
    }
  };

  const updateTaskStatus = async (task: WorkflowTaskRecord, status: TaskStatus) => {
    await mutate(
      `task-${task.id}`,
      () => api.patch(`/workflows/tasks/${task.id}`, { status }),
      status === 'Completed' ? 'Task completed with an audit record.' : `Task moved to ${status}.`,
    );
  };

  if (loading) {
    return (
      <div className="glass-panel flex min-h-72 items-center justify-center p-10 text-sm text-gray-400 animate-slide-up">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin text-amber-400" /> Loading workflow command center…
      </div>
    );
  }

  const renderTemplateCard = (template: WorkflowTemplateRecord, compact = false) => {
    const approval = isApprovalRequired(template.riskLevel, template.approvalMode);
    return (
      <article
        key={template.id}
        className="group rounded-xl border border-white/10 bg-slate-950/55 p-4 transition hover:border-amber-400/30 hover:bg-slate-950/75"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-sm font-bold text-gray-100">{template.name}</h4>
              <Pill className={riskStyle(template.riskLevel)}>{template.riskLevel} risk</Pill>
              {template.status !== 'Active' && (
                <Pill className="border-white/10 bg-white/5 text-gray-400">{template.status}</Pill>
              )}
            </div>
            <p className={`mt-2 text-xs leading-relaxed text-gray-400 ${compact ? 'line-clamp-2' : ''}`}>
              {template.description || 'No workflow description has been added.'}
            </p>
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${approval ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
            {approval ? <LockKeyhole className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2">
            <p className="text-gray-500">Trigger</p>
            <p className="mt-0.5 truncate font-semibold text-gray-300">{triggerLabel(template.triggerType)}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2">
            <p className="text-gray-500">Control</p>
            <p className="mt-0.5 truncate font-semibold text-gray-300">{approval ? 'Manager approval' : 'Policy auto-run'}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
          <div className="text-[10px] text-gray-500">
            v{template.version} · {template.runCount || 0} runs · {relativeTime(template.lastRunAt)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <button
                type="button"
                onClick={() => openEditTemplate(template)}
                className="btn-secondary px-2.5 py-1.5 text-[11px]"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            <button
              type="button"
              disabled={template.status !== 'Active' || busyId === `run-${template.id}`}
              onClick={() => openRun(template)}
              className="btn-primary px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" /> Run
            </button>
          </div>
        </div>
      </article>
    );
  };

  const renderTaskCard = (task: WorkflowTaskRecord) => {
    const terminal = task.status === 'Completed' || task.status === 'Cancelled';
    const overdue = !terminal && task.dueAt && new Date(task.dueAt).getTime() < Date.now();
    return (
      <article key={task.id} className="rounded-xl border border-white/10 bg-slate-950/55 p-4 transition hover:border-blue-400/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${overdue ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-blue-500/30 bg-blue-500/10 text-blue-300'}`}>
              {task.roomNumber ? <span className="font-mono text-xs font-bold">#{task.roomNumber}</span> : <ClipboardCheck className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-gray-100">{task.title}</h4>
                <Pill className={priorityStyle(task.priority)}>{task.priority}</Pill>
                <Pill className={taskStatusStyle(task.status)}>{task.status}</Pill>
              </div>
              {task.description && <p className="mt-1.5 text-xs leading-relaxed text-gray-400">{task.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                <span>{task.department}</span>
                <span>{task.assignedTo || 'Unassigned queue'}</span>
                <span className={overdue ? 'font-semibold text-rose-300' : ''}>
                  {task.dueAt ? `${overdue ? 'Overdue' : 'Due'} ${relativeTime(task.dueAt)}` : 'No deadline'}
                </span>
                <span>{task.runId ? 'Automated' : 'Manual'}</span>
              </div>
            </div>
          </div>

          {!terminal && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {task.status === 'Open' && (
                <button
                  type="button"
                  disabled={busyId === `task-${task.id}`}
                  onClick={() => void updateTaskStatus(task, 'In Progress')}
                  className="btn-secondary px-2.5 py-1.5 text-[11px] disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" /> Start
                </button>
              )}
              {task.status !== 'Blocked' && (
                <button
                  type="button"
                  disabled={busyId === `task-${task.id}`}
                  onClick={() => void updateTaskStatus(task, 'Blocked')}
                  className="btn-secondary px-2.5 py-1.5 text-[11px] text-amber-300 disabled:opacity-50"
                >
                  <CircleAlert className="h-3.5 w-3.5" /> Block
                </button>
              )}
              {task.status === 'Blocked' && (
                <button
                  type="button"
                  disabled={busyId === `task-${task.id}`}
                  onClick={() => void updateTaskStatus(task, 'In Progress')}
                  className="btn-secondary px-2.5 py-1.5 text-[11px] disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Resume
                </button>
              )}
              <button
                type="button"
                disabled={busyId === `task-${task.id}`}
                onClick={() => void updateTaskStatus(task, 'Completed')}
                className="btn-primary px-2.5 py-1.5 text-[11px] disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> Complete
              </button>
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <header className="glass-panel overflow-hidden p-0">
        <div className="relative p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
                  <Workflow className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-gray-100">Frontline Workflow Studio</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Persisted execution
                    </span>
                    <span>·</span>
                    <span>Risk gates</span>
                    <span>·</span>
                    <span>Immutable run snapshots</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 max-w-3xl text-xs leading-relaxed text-gray-400">
                Turn repeatable hotel procedures into permissioned task flows. Every request, approval, task, and outcome is written to the operational audit trail.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="btn-secondary px-3 py-2 text-xs disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  setTaskDraft(blankTaskDraft());
                  setTaskEditorOpen(true);
                }}
                className="btn-secondary px-3 py-2 text-xs"
              >
                <ClipboardCheck className="h-4 w-4" /> New task
              </button>
              {canManage && (
                <button type="button" onClick={openNewTemplate} className="btn-primary px-3 py-2 text-xs">
                  <Plus className="h-4 w-4" /> New workflow
                </button>
              )}
            </div>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-white/10 bg-slate-950/35 px-3 py-2" aria-label="Workflow Studio sections">
          {([
            ['command', 'Command center', Activity],
            ['templates', 'Automations', GitBranch],
            ['tasks', 'Task queue', ListChecks],
            ['audit', 'Audit trail', FileClock],
          ] as Array<[StudioView, string, React.ComponentType<{ className?: string }>]>)
            .map(([id, label, Icon]) => (
              <button
                type="button"
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  view === id
                    ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
        </nav>
      </header>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          <span className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X className="h-4 w-4" /></button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-200">
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </div>
      )}

      {view === 'command' && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Active workflows', value: activeTemplates.length, detail: `${templates.length} total versions`, icon: Zap, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
              { label: 'Approval queue', value: approvalQueue.length, detail: approvalQueue.length ? 'Manager decision needed' : 'No gated runs waiting', icon: ShieldCheck, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
              { label: 'Open tasks', value: openTasks.length, detail: overdueTasks.length ? `${overdueTasks.length} overdue` : 'All within due time', icon: ClipboardCheck, tone: overdueTasks.length ? 'text-rose-300 bg-rose-500/10 border-rose-500/30' : 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
              { label: 'Policy auto-runs', value: autoExecuted, detail: `${completedRuns.length} completed executions`, icon: Sparkles, tone: 'text-purple-300 bg-purple-500/10 border-purple-500/30' },
            ].map(({ label, value, detail, icon: Icon, tone }) => (
              <div key={label} className="glass-panel p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
                    <p className="mt-1 text-2xl font-extrabold text-gray-100">{value}</p>
                  </div>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${tone}`}><Icon className="h-4 w-4" /></div>
                </div>
                <p className="mt-2 text-[11px] text-gray-500">{detail}</p>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className="glass-panel space-y-4 p-5 xl:col-span-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-100">
                    <LockKeyhole className="h-4 w-4 text-amber-400" /> Approval inbox
                  </h3>
                  <p className="mt-1 text-[11px] text-gray-500">High-impact runs remain inert until a manager decides.</p>
                </div>
                <Pill className="border-amber-500/30 bg-amber-500/10 text-amber-300">{approvalQueue.length} waiting</Pill>
              </div>

              {approvalQueue.length === 0 ? (
                <EmptyState icon={ShieldCheck} title="Approval queue clear" body="High and Critical workflows appear here before any operational task is created." />
              ) : (
                <div className="space-y-3">
                  {approvalQueue.slice(0, 6).map((run) => (
                    <article key={run.id} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-gray-100">{run.templateName}</h4>
                            <Pill className={riskStyle(run.riskLevel)}>{run.riskLevel}</Pill>
                          </div>
                          <p className="mt-1 text-[11px] text-gray-500">Requested by {run.requestedBy} · {relativeTime(run.requestedAt)}</p>
                          {Boolean(run.context.roomNumber || run.context.guestName) && (
                            <p className="mt-2 text-xs text-gray-300">
                              {run.context.roomNumber ? `Room ${String(run.context.roomNumber)}` : 'Property-wide'}
                              {run.context.guestName ? ` · ${String(run.context.guestName)}` : ''}
                            </p>
                          )}
                        </div>
                        <LockKeyhole className="h-4 w-4 shrink-0 text-amber-400" />
                      </div>
                      {canManage ? (
                        <div className="mt-4 flex gap-2 border-t border-amber-500/10 pt-3">
                          <button
                            type="button"
                            disabled={busyId === `approve-${run.id}`}
                            onClick={() => void approveRun(run)}
                            className="btn-primary flex-1 justify-center px-3 py-2 text-[11px] disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" /> Approve & execute
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectTarget(run);
                              setRejectReason('');
                            }}
                            className="btn-secondary px-3 py-2 text-[11px] text-rose-300"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Reject
                          </button>
                        </div>
                      ) : (
                        <p className="mt-3 border-t border-amber-500/10 pt-3 text-[11px] text-amber-200/70">A General Manager must approve this run.</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="glass-panel space-y-4 p-5 xl:col-span-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-100">
                    <Activity className="h-4 w-4 text-blue-400" /> Recent executions
                  </h3>
                  <p className="mt-1 text-[11px] text-gray-500">Immutable snapshots preserve what ran, under which policy, and when.</p>
                </div>
                <button type="button" onClick={() => setView('audit')} className="text-[11px] font-semibold text-amber-300 hover:text-amber-200">
                  View audit <ChevronRight className="inline h-3.5 w-3.5" />
                </button>
              </div>
              {runs.length === 0 ? (
                <EmptyState icon={Activity} title="No workflow executions yet" body="Run an active automation to create the first persisted execution record." />
              ) : (
                <div className="divide-y divide-white/5">
                  {runs.slice(0, 8).map((run) => (
                    <div key={run.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${runStatusStyle(run.status)}`}>
                          {run.status === 'Completed' ? <CheckCircle2 className="h-4 w-4" /> : run.status === 'Awaiting Approval' ? <Clock3 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-gray-200">{run.templateName}</p>
                          <p className="mt-0.5 text-[10px] text-gray-500">v{run.templateVersion} · {run.requestedBy} · {relativeTime(run.requestedAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-12 sm:pl-0">
                        <Pill className={riskStyle(run.riskLevel)}>{run.riskLevel}</Pill>
                        <Pill className={runStatusStyle(run.status)}>{run.status}</Pill>
                        <span className="min-w-14 text-right text-[10px] text-gray-500">{run.taskCount || 0} tasks</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="glass-panel space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-100">
                  <Zap className="h-4 w-4 text-amber-400" /> Ready-to-run playbooks
                </h3>
                <p className="mt-1 text-[11px] text-gray-500">Start a controlled workflow with live guest, room, and operational context.</p>
              </div>
              <button type="button" onClick={() => setView('templates')} className="text-[11px] font-semibold text-amber-300 hover:text-amber-200">
                Manage all <ChevronRight className="inline h-3.5 w-3.5" />
              </button>
            </div>
            {activeTemplates.length === 0 ? (
              <EmptyState icon={Workflow} title="No active playbooks" body={canManage ? 'Create a workflow or reactivate a paused template.' : 'A General Manager can create and activate workflow templates.'} />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{activeTemplates.slice(0, 4).map((template) => renderTemplateCard(template, true))}</div>
            )}
          </section>

          <section className="glass-panel space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-100">
                  <ListChecks className="h-4 w-4 text-blue-400" /> Frontline task pulse
                </h3>
                <p className="mt-1 text-[11px] text-gray-500">Urgent, overdue, and active work stays visible across departments.</p>
              </div>
              <button type="button" onClick={() => setView('tasks')} className="text-[11px] font-semibold text-amber-300 hover:text-amber-200">
                Full queue <ChevronRight className="inline h-3.5 w-3.5" />
              </button>
            </div>
            {openTasks.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="Frontline queue clear" body="Tasks created manually or by an approved workflow appear here." />
            ) : (
              <div className="space-y-3">{openTasks.slice(0, 5).map(renderTaskCard)}</div>
            )}
          </section>
        </>
      )}

      {view === 'templates' && (
        <section className="glass-panel space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-100"><GitBranch className="h-4 w-4 text-amber-400" /> Automation catalog</h3>
              <p className="mt-1 text-[11px] text-gray-500">Versioned templates with explicit risk, approval, trigger, and task-output policy.</p>
            </div>
            {canManage && <button type="button" onClick={openNewTemplate} className="btn-primary px-3 py-2 text-xs"><Plus className="h-4 w-4" /> Create workflow</button>}
          </div>
          {templates.length === 0 ? (
            <EmptyState icon={Workflow} title="Automation catalog empty" body="Create the first workflow template to establish a repeatable frontline procedure." />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{templates.map((template) => renderTemplateCard(template))}</div>
          )}
          {canManage && templates.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-slate-950/70 text-left text-[10px] uppercase tracking-wider text-gray-500">
                  <tr><th className="px-4 py-3">Workflow</th><th className="px-4 py-3">Version</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Last updated</th><th className="px-4 py-3 text-right">Lifecycle</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {templates.map((template) => (
                    <tr key={`lifecycle-${template.id}`} className="text-gray-300">
                      <td className="px-4 py-3 font-semibold">{template.name}</td>
                      <td className="px-4 py-3 font-mono text-gray-400">v{template.version}</td>
                      <td className="px-4 py-3 text-gray-400">{template.updatedBy}</td>
                      <td className="px-4 py-3 text-gray-400">{formatDateTime(template.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {template.status === 'Active' ? (
                            <button type="button" disabled={busyId === `template-${template.id}`} onClick={() => void setTemplateStatus(template, 'Paused')} className="btn-secondary px-2.5 py-1.5 text-[10px]"><CirclePause className="h-3 w-3" /> Pause</button>
                          ) : template.status === 'Paused' ? (
                            <button type="button" disabled={busyId === `template-${template.id}`} onClick={() => void setTemplateStatus(template, 'Active')} className="btn-secondary px-2.5 py-1.5 text-[10px] text-emerald-300"><Play className="h-3 w-3" /> Activate</button>
                          ) : null}
                          {template.status !== 'Archived' && (
                            <button type="button" disabled={busyId === `template-${template.id}`} onClick={() => void setTemplateStatus(template, 'Archived')} className="btn-secondary px-2.5 py-1.5 text-[10px] text-rose-300"><Archive className="h-3 w-3" /> Archive</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {view === 'tasks' && (
        <section className="glass-panel space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-100"><ListChecks className="h-4 w-4 text-blue-400" /> Operational task queue</h3>
              <p className="mt-1 text-[11px] text-gray-500">One queue for automated and manually dispatched work, ordered by frontline urgency.</p>
            </div>
            <button type="button" onClick={() => { setTaskDraft(blankTaskDraft()); setTaskEditorOpen(true); }} className="btn-primary px-3 py-2 text-xs"><Plus className="h-4 w-4" /> New task</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill className="border-blue-500/30 bg-blue-500/10 text-blue-300">{openTasks.length} active</Pill>
            <Pill className={overdueTasks.length ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}>{overdueTasks.length} overdue</Pill>
            <Pill className="border-white/10 bg-white/5 text-gray-400">{tasks.filter((task) => task.status === 'Completed').length} completed</Pill>
          </div>
          {tasks.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No operational tasks" body="Create a task directly or run a workflow to populate the frontline queue." />
          ) : (
            <div className="space-y-3">
              {[...tasks]
                .sort((left, right) => {
                  const terminal = (task: WorkflowTaskRecord) => ['Completed', 'Cancelled'].includes(task.status) ? 1 : 0;
                  return terminal(left) - terminal(right) || (right.createdAt.localeCompare(left.createdAt));
                })
                .map(renderTaskCard)}
            </div>
          )}
        </section>
      )}

      {view === 'audit' && (
        <section className="glass-panel space-y-5 p-5">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-100"><FileClock className="h-4 w-4 text-purple-400" /> Append-only workflow audit</h3>
            <p className="mt-1 text-[11px] text-gray-500">Chronological evidence for template changes, approvals, executions, and task transitions.</p>
          </div>
          {auditEvents.length === 0 ? (
            <EmptyState icon={FileClock} title="Audit trail empty" body="Workflow and task activity will create signed operational events here." />
          ) : (
            <div className="relative space-y-0 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-white/10">
              {auditEvents.map((event) => (
                <article key={event.id} className="relative flex gap-4 py-3 first:pt-0">
                  <div className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${event.entityType === 'run' ? 'border-purple-500/30 bg-purple-500/10 text-purple-300' : event.entityType === 'task' ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                    {event.entityType === 'run' ? <Activity className="h-3.5 w-3.5" /> : event.entityType === 'task' ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Workflow className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl border border-white/5 bg-slate-950/35 px-4 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-bold text-gray-200">{actionLabel(event.action)}</p>
                      <time className="text-[10px] text-gray-500" dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">{event.actor} · {event.entityType} · <span className="font-mono">{event.entityId.slice(0, 22)}</span></p>
                    {Object.keys(event.details).length > 0 && (
                      <p className="mt-2 line-clamp-2 font-mono text-[10px] leading-relaxed text-gray-500">{JSON.stringify(event.details)}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {templateEditor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="workflow-editor-title">
          <form onSubmit={saveTemplate} className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-white/10 bg-slate-900 shadow-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-900/95 px-5 py-4 backdrop-blur">
              <div>
                <h3 id="workflow-editor-title" className="text-base font-bold text-gray-100">{templateEditor === 'new' ? 'Create frontline workflow' : `Edit ${templateEditor.name}`}</h3>
                <p className="mt-1 text-[11px] text-gray-500">Saving creates an auditable template version. Existing runs retain their original snapshot.</p>
              </div>
              <button type="button" onClick={() => setTemplateEditor(null)} className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-gray-200" aria-label="Close workflow editor"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-6 p-5 sm:p-6">
              <fieldset className="space-y-4">
                <legend className="text-xs font-bold uppercase tracking-wider text-amber-300">Definition</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label><span className={labelClass}>Workflow name</span><input required maxLength={100} value={templateDraft.name} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, name: event.target.value }))} className={fieldClass} placeholder="e.g. Early arrival readiness" /></label>
                  <label><span className={labelClass}>Trigger identifier</span><input required maxLength={80} value={templateDraft.triggerType} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, triggerType: event.target.value }))} className={fieldClass} placeholder="reservation.early-arrival" /></label>
                </div>
                <label><span className={labelClass}>Purpose</span><textarea rows={2} maxLength={700} value={templateDraft.description} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, description: event.target.value }))} className={fieldClass} placeholder="Describe when staff should use this workflow and the outcome it guarantees." /></label>
              </fieldset>

              <fieldset className="space-y-4 border-t border-white/10 pt-5">
                <legend className="text-xs font-bold uppercase tracking-wider text-amber-300">Risk & approval policy</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label><span className={labelClass}>Risk level</span><select value={templateDraft.riskLevel} onChange={(event) => { const riskLevel = event.target.value as RiskLevel; setTemplateDraft((draft) => ({ ...draft, riskLevel, approvalMode: (riskLevel === 'High' || riskLevel === 'Critical') && draft.approvalMode === 'never' ? 'risk-based' : draft.approvalMode })); }} className={fieldClass}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>
                  <label><span className={labelClass}>Approval mode</span><select value={templateDraft.approvalMode} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, approvalMode: event.target.value as ApprovalMode }))} className={fieldClass}><option value="risk-based">Risk-based gate</option><option value="always">Always require manager</option><option value="never" disabled={templateDraft.riskLevel === 'High' || templateDraft.riskLevel === 'Critical'}>Never require approval</option></select></label>
                </div>
                <div className={`flex items-start gap-3 rounded-xl border p-3 text-xs ${isApprovalRequired(templateDraft.riskLevel, templateDraft.approvalMode) ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
                  {isApprovalRequired(templateDraft.riskLevel, templateDraft.approvalMode) ? <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> : <Zap className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{isApprovalRequired(templateDraft.riskLevel, templateDraft.approvalMode) ? 'Execution will stop before task creation until a General Manager approves it.' : 'The policy engine will execute this run immediately and record the auto-approval decision.'}</span>
                </div>
              </fieldset>

              <fieldset className="space-y-4 border-t border-white/10 pt-5">
                <legend className="text-xs font-bold uppercase tracking-wider text-amber-300">Task output</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2"><span className={labelClass}>Task title</span><input required maxLength={140} value={templateDraft.taskTitle} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, taskTitle: event.target.value }))} className={fieldClass} placeholder="Prepare arrival for {{guestName}}" /></label>
                  <label><span className={labelClass}>Department</span><input required maxLength={80} value={templateDraft.department} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, department: event.target.value }))} className={fieldClass} /></label>
                  <label><span className={labelClass}>Assigned queue</span><input maxLength={120} value={templateDraft.assignedTo} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, assignedTo: event.target.value }))} className={fieldClass} /></label>
                  <label><span className={labelClass}>Priority</span><select value={templateDraft.priority} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, priority: event.target.value as TaskPriority }))} className={fieldClass}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></label>
                  <label><span className={labelClass}>Due after (minutes)</span><input required type="number" min="0" max="43200" step="1" value={templateDraft.dueInMinutes} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, dueInMinutes: event.target.value }))} className={fieldClass} /></label>
                  <label className="sm:col-span-2"><span className={labelClass}>Instructions</span><textarea rows={3} maxLength={1200} value={templateDraft.taskDescription} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, taskDescription: event.target.value }))} className={fieldClass} placeholder="Use {{guestName}}, {{roomNumber}}, and {{note}} as live run context." /></label>
                </div>
              </fieldset>
            </div>
            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-white/10 bg-slate-900/95 px-5 py-4 backdrop-blur">
              <button type="button" onClick={() => setTemplateEditor(null)} className="btn-secondary px-4 py-2 text-xs">Cancel</button>
              <button type="submit" disabled={busyId === (templateEditor === 'new' ? 'new-template' : templateEditor.id)} className="btn-primary px-4 py-2 text-xs disabled:opacity-50"><ShieldCheck className="h-4 w-4" /> {busyId ? 'Saving…' : 'Save version'}</button>
            </div>
          </form>
        </div>
      )}

      {runTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="workflow-run-title">
          <form onSubmit={runWorkflow} className="w-full max-w-lg rounded-t-2xl border border-white/10 bg-slate-900 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div><h3 id="workflow-run-title" className="text-base font-bold text-gray-100">Run {runTarget.name}</h3><p className="mt-1 text-[11px] text-gray-500">Context is frozen into this execution record.</p></div>
              <button type="button" onClick={() => setRunTarget(null)} className="rounded-lg p-2 text-gray-400 hover:bg-white/5" aria-label="Close run dialog"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className={`flex items-start gap-3 rounded-xl border p-3 text-xs ${isApprovalRequired(runTarget.riskLevel, runTarget.approvalMode) ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
                {isApprovalRequired(runTarget.riskLevel, runTarget.approvalMode) ? <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> : <Zap className="mt-0.5 h-4 w-4 shrink-0" />}
                <div><p className="font-bold">{runTarget.riskLevel} risk · {isApprovalRequired(runTarget.riskLevel, runTarget.approvalMode) ? 'Approval required' : 'Auto-execution'}</p><p className="mt-1 opacity-80">{isApprovalRequired(runTarget.riskLevel, runTarget.approvalMode) ? 'No task is created before manager approval.' : 'The task will be created transactionally when submitted.'}</p></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label><span className={labelClass}>Guest or subject</span><input maxLength={120} value={runContext.guestName} onChange={(event) => setRunContext((context) => ({ ...context, guestName: event.target.value }))} className={fieldClass} placeholder="Guest name" /></label>
                <label><span className={labelClass}>Room</span><input maxLength={40} value={runContext.roomNumber} onChange={(event) => setRunContext((context) => ({ ...context, roomNumber: event.target.value }))} className={fieldClass} placeholder="e.g. 304" /></label>
              </div>
              <label><span className={labelClass}>Operational note</span><textarea rows={3} maxLength={800} value={runContext.note} onChange={(event) => setRunContext((context) => ({ ...context, note: event.target.value }))} className={fieldClass} placeholder="Add only the context staff need to execute safely." /></label>
              <div className="rounded-lg border border-white/5 bg-slate-950/50 px-3 py-2 font-mono text-[9px] text-gray-600">Idempotency: {runRequestId}</div>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
              <button type="button" onClick={() => setRunTarget(null)} className="btn-secondary px-4 py-2 text-xs">Cancel</button>
              <button type="submit" disabled={busyId === `run-${runTarget.id}`} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">{isApprovalRequired(runTarget.riskLevel, runTarget.approvalMode) ? <LockKeyhole className="h-4 w-4" /> : <Play className="h-4 w-4" />}{busyId ? 'Submitting…' : isApprovalRequired(runTarget.riskLevel, runTarget.approvalMode) ? 'Request approval' : 'Execute workflow'}</button>
            </div>
          </form>
        </div>
      )}

      {taskEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="task-editor-title">
          <form onSubmit={saveManualTask} className="w-full max-w-xl rounded-t-2xl border border-white/10 bg-slate-900 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between border-b border-white/10 px-5 py-4"><div><h3 id="task-editor-title" className="text-base font-bold text-gray-100">Dispatch operational task</h3><p className="mt-1 text-[11px] text-gray-500">Manual work uses the same queue and audit model as automation output.</p></div><button type="button" onClick={() => setTaskEditorOpen(false)} className="rounded-lg p-2 text-gray-400 hover:bg-white/5" aria-label="Close task editor"><X className="h-5 w-5" /></button></div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className={labelClass}>Task title</span><input required maxLength={140} value={taskDraft.title} onChange={(event) => setTaskDraft((draft) => ({ ...draft, title: event.target.value }))} className={fieldClass} placeholder="Inspect room before arrival" /></label>
              <label><span className={labelClass}>Department</span><input required maxLength={80} value={taskDraft.department} onChange={(event) => setTaskDraft((draft) => ({ ...draft, department: event.target.value }))} className={fieldClass} /></label>
              <label><span className={labelClass}>Assigned queue</span><input maxLength={120} value={taskDraft.assignedTo} onChange={(event) => setTaskDraft((draft) => ({ ...draft, assignedTo: event.target.value }))} className={fieldClass} /></label>
              <label><span className={labelClass}>Priority</span><select value={taskDraft.priority} onChange={(event) => setTaskDraft((draft) => ({ ...draft, priority: event.target.value as TaskPriority }))} className={fieldClass}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></label>
              <label><span className={labelClass}>Room (optional)</span><input maxLength={40} value={taskDraft.roomNumber} onChange={(event) => setTaskDraft((draft) => ({ ...draft, roomNumber: event.target.value }))} className={fieldClass} /></label>
              <label className="sm:col-span-2"><span className={labelClass}>Due date & time (optional)</span><input type="datetime-local" value={taskDraft.dueAt} onChange={(event) => setTaskDraft((draft) => ({ ...draft, dueAt: event.target.value }))} className={fieldClass} /></label>
              <label className="sm:col-span-2"><span className={labelClass}>Instructions</span><textarea rows={3} maxLength={1200} value={taskDraft.description} onChange={(event) => setTaskDraft((draft) => ({ ...draft, description: event.target.value }))} className={fieldClass} /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4"><button type="button" onClick={() => setTaskEditorOpen(false)} className="btn-secondary px-4 py-2 text-xs">Cancel</button><button type="submit" disabled={busyId === 'new-task'} className="btn-primary px-4 py-2 text-xs disabled:opacity-50"><Plus className="h-4 w-4" /> {busyId === 'new-task' ? 'Creating…' : 'Create task'}</button></div>
          </form>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="reject-run-title">
          <form onSubmit={rejectRun} className="w-full max-w-md rounded-t-2xl border border-white/10 bg-slate-900 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between border-b border-white/10 px-5 py-4"><div><h3 id="reject-run-title" className="text-base font-bold text-gray-100">Reject workflow run</h3><p className="mt-1 text-[11px] text-gray-500">{rejectTarget.templateName} · {rejectTarget.riskLevel} risk</p></div><button type="button" onClick={() => setRejectTarget(null)} className="rounded-lg p-2 text-gray-400 hover:bg-white/5" aria-label="Close rejection dialog"><X className="h-5 w-5" /></button></div>
            <div className="space-y-3 p-5"><div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>Rejecting is terminal. No workflow tasks will be created for this run.</span></div><label><span className={labelClass}>Decision reason</span><textarea required rows={3} maxLength={500} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} className={fieldClass} placeholder="Explain why this run should not proceed." /></label></div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4"><button type="button" onClick={() => setRejectTarget(null)} className="btn-secondary px-4 py-2 text-xs">Keep pending</button><button type="submit" disabled={busyId === `reject-${rejectTarget.id}`} className="btn-secondary px-4 py-2 text-xs text-rose-300 disabled:opacity-50"><XCircle className="h-4 w-4" /> {busyId ? 'Rejecting…' : 'Reject run'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

export default WorkflowStudio;
