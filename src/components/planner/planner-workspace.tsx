"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CircleAlert,
  Copy,
  Download,
  FolderPlus,
  HardDriveDownload,
  History,
  Layers3,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
  Redo2,
  Undo2,
  Zap,
} from "lucide-react";

import {
  DEFAULT_GANTT_APPEARANCE,
  sanitizeAppearanceSettings,
} from "@/lib/planner-appearance";
import { formatHumanDate, nowISO, todayISO } from "@/lib/date-utils";
import {
  createProject,
  createSnapshot,
  deleteProject,
  duplicateProject,
  getProjectBundle,
  importProjectBundle,
  initializePlannerDb,
  plannerDb,
  restoreSnapshot,
  saveProjectView,
} from "@/lib/planner-db";
import {
  buildTaskPatchFromDates,
  buildTaskPatchFromDuration,
  buildTaskPatchFromEndDate,
  parseDependencyInput,
  resolvePlannerProject,
} from "@/lib/planner-engine";
import {
  exportGanttPdf,
  exportGanttPng,
  exportProjectCsv,
  exportProjectJson,
  exportProjectXlsx,
} from "@/lib/planner-export";
import { plannerBundleSchema } from "@/lib/planner-schema";
import type {
  DependencyRecord,
  GanttAppearanceSettings,
  PlannerExportBundle,
  PlannerProjectBundle,
  ProjectRecord,
  ProjectViewRecord,
  ResolvedPlannerProject,
  ResolvedTask,
  SnapshotRecord,
  TaskRecord,
} from "@/types/planner";

import { GanttPanel, type GanttPanelHandle } from "./gantt-panel";
import { UndoManager } from "@/lib/undo-manager";
import { PlannerSettingsDrawer } from "./planner-settings-drawer";
import { TaskGrid } from "./task-grid";
import { ConfirmDialog } from "./confirm-dialog";

type NoticeTone = "success" | "error" | "info";
type WorkspaceView = "split" | "tasks" | "gantt";

type Notice = {
  tone: NoticeTone;
  message: string;
};

const TASK_PANE_MIN_WIDTH = 620;
const GANTT_PANE_MIN_WIDTH = 540;

function sortTasksByOrder(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((a, b) => a.order - b.order);
}

function withResequencedOrders(tasks: TaskRecord[]): TaskRecord[] {
  return sortTasksByOrder(tasks).map((task, index) => ({
    ...task,
    order: (index + 1) * 10,
  }));
}

function collectSubtreeIds(taskId: string, tasks: TaskRecord[]): Set<string> {
  const ids = new Set<string>([taskId]);
  const stack = [taskId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const task of tasks) {
      if (task.parentId === current && !ids.has(task.id)) {
        ids.add(task.id);
        stack.push(task.id);
      }
    }
  }

  return ids;
}

function getSubtreeRange(tasks: TaskRecord[], taskId: string) {
  const startIndex = tasks.findIndex((task) => task.id === taskId);
  if (startIndex === -1) {
    return null;
  }

  const subtreeIds = collectSubtreeIds(taskId, tasks);
  let endIndex = startIndex;

  while (endIndex + 1 < tasks.length && subtreeIds.has(tasks[endIndex + 1].id)) {
    endIndex += 1;
  }

  return {
    startIndex,
    endIndex,
    items: tasks.slice(startIndex, endIndex + 1),
  };
}

function moveTaskBlock(
  tasks: TaskRecord[],
  taskId: string,
  direction: "up" | "down",
): TaskRecord[] {
  const currentRange = getSubtreeRange(tasks, taskId);
  if (!currentRange) {
    return tasks;
  }

  const currentTask = tasks[currentRange.startIndex];
  const siblingSearch =
    direction === "up"
      ? [...tasks.keys()].slice(0, currentRange.startIndex).reverse()
      : [...tasks.keys()].slice(currentRange.endIndex + 1);

  const siblingIndex = siblingSearch.find(
    (index) => tasks[index].parentId === currentTask.parentId,
  );

  if (siblingIndex === undefined) {
    return tasks;
  }

  const siblingRange = getSubtreeRange(tasks, tasks[siblingIndex].id);
  if (!siblingRange) {
    return tasks;
  }

  if (direction === "up") {
    return [
      ...tasks.slice(0, siblingRange.startIndex),
      ...currentRange.items,
      ...tasks.slice(siblingRange.endIndex + 1, currentRange.startIndex),
      ...siblingRange.items,
      ...tasks.slice(currentRange.endIndex + 1),
    ];
  }

  return [
    ...tasks.slice(0, currentRange.startIndex),
    ...siblingRange.items,
    ...tasks.slice(currentRange.endIndex + 1, siblingRange.startIndex),
    ...currentRange.items,
    ...tasks.slice(siblingRange.endIndex + 1),
  ];
}

function outdentTaskBlock(tasks: TaskRecord[], taskId: string): TaskRecord[] {
  const currentRange = getSubtreeRange(tasks, taskId);
  if (!currentRange) {
    return tasks;
  }

  const task = tasks[currentRange.startIndex];
  if (!task.parentId) {
    return tasks;
  }

  const parent = tasks.find((item) => item.id === task.parentId);
  if (!parent) {
    return tasks;
  }

  const parentRange = getSubtreeRange(tasks, parent.id);
  if (!parentRange) {
    return tasks;
  }

  const updatedBlock = currentRange.items.map((item) =>
    item.id === taskId ? { ...item, parentId: parent.parentId ?? null } : item,
  );
  const remaining = tasks.filter(
    (item) => !currentRange.items.some((block) => block.id === item.id),
  );
  const insertionIndex = Math.min(
    remaining.length,
    parentRange.endIndex - updatedBlock.length + 1,
  );

  return [
    ...remaining.slice(0, insertionIndex),
    ...updatedBlock,
    ...remaining.slice(insertionIndex),
  ];
}

function getVisibleTasks(tasks: ResolvedTask[]): ResolvedTask[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  return tasks.filter((task) => {
    let currentParent = task.parentId;
    while (currentParent) {
      const parent = taskMap.get(currentParent);
      if (parent?.collapsed) {
        return false;
      }
      currentParent = parent?.parentId ?? null;
    }
    return true;
  });
}

function buildProjectView(
  bundle: PlannerProjectBundle,
  partial: Partial<ProjectViewRecord>,
): ProjectViewRecord {
  return {
    projectId: bundle.project.id,
    chartViewMode: partial.chartViewMode ?? bundle.view?.chartViewMode ?? "Week",
    selectedTaskId:
      partial.selectedTaskId === undefined
        ? bundle.view?.selectedTaskId ?? null
        : partial.selectedTaskId,
    rightPanelOpen:
      partial.rightPanelOpen ?? bundle.view?.rightPanelOpen ?? true,
    updatedAt: nowISO(),
  };
}

function hasPath(
  startId: string,
  targetId: string,
  dependencies: DependencyRecord[],
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const bucket = outgoing.get(dependency.predecessorId) ?? [];
    bucket.push(dependency.successorId);
    outgoing.set(dependency.predecessorId, bucket);
  }

  const stack = [startId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === targetId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const nextId of outgoing.get(current) ?? []) {
      stack.push(nextId);
    }
  }

  return false;
}

function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) {
    return null;
  }

  const palette = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
    info: "border-slate-200 bg-white text-slate-700",
  } satisfies Record<NoticeTone, string>;

  return (
    <div
      className={`mx-4 mt-3 flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${palette[notice.tone]}`}
    >
      <CircleAlert className="h-4 w-4" />
      <span>{notice.message}</span>
    </div>
  );
}

function ProjectMenu({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDuplicateProject,
  onDeleteProject,
}: {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDuplicateProject: () => void;
  onDeleteProject: () => void;
}) {
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]">
        <Layers3 className="h-4 w-4" />
        Projetos
      </summary>
      <div className="planner-popover absolute left-0 top-[calc(100%+8px)] z-30 w-[320px] rounded-md border border-[var(--border)] bg-white p-2 shadow-[0_18px_42px_rgba(18,24,20,0.12)]">
        <div className="planner-scrollbar max-h-[50vh] overflow-y-auto">
          {projects.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <button
                key={project.id}
                className={`w-full rounded-md px-3 py-2.5 text-left transition ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--foreground)]"
                    : "hover:bg-[#f4f6f2]"
                }`}
                onClick={() => onSelectProject(project.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-semibold">{project.name}</span>
                  <span className="mono text-[11px] text-[var(--muted-soft)]">
                    {formatHumanDate(project.startDate)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-2 border-t border-[var(--border)] pt-2">
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[#f4f6f2]"
            onClick={onCreateProject}
            type="button"
          >
            <FolderPlus className="h-4 w-4" />
            Novo projeto
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[#f4f6f2]"
            onClick={onDuplicateProject}
            type="button"
          >
            <Copy className="h-4 w-4" />
            Duplicar atual
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-rose-700 transition hover:bg-rose-50"
            onClick={onDeleteProject}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
            Excluir atual
          </button>
        </div>
      </div>
    </details>
  );
}

function FileMenu({
  onCreateSnapshot,
  onOpenSnapshots,
  onExportJson,
  onExportCsv,
  onExportXlsx,
  onExportPng,
  onExportPdf,
  onImportJson,
}: {
  onCreateSnapshot: () => void;
  onOpenSnapshots: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onImportJson: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]">
        <MoreHorizontal className="h-4 w-4" />
        Arquivo
      </summary>
      <div className="planner-popover absolute right-0 top-[calc(100%+8px)] z-30 w-[260px] rounded-md border border-[var(--border)] bg-white p-2 shadow-[0_18px_42px_rgba(18,24,20,0.12)]">
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[#f4f6f2]"
          onClick={onCreateSnapshot}
          type="button"
        >
          <Save className="h-4 w-4" />
          Salvar snapshot
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[#f4f6f2]"
          onClick={onOpenSnapshots}
          type="button"
        >
          <History className="h-4 w-4" />
          Restaurar snapshot
        </button>
        <div className="my-2 border-t border-[var(--border)]" />
        {[
          { label: "Exportar JSON", icon: Download, handler: onExportJson },
          { label: "Exportar CSV", icon: HardDriveDownload, handler: onExportCsv },
          { label: "Exportar XLSX", icon: HardDriveDownload, handler: onExportXlsx },
          { label: "Exportar PNG", icon: HardDriveDownload, handler: onExportPng },
          { label: "Exportar PDF", icon: HardDriveDownload, handler: onExportPdf },
        ].map(({ label, icon: Icon, handler }) => (
          <button
            key={label}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[#f4f6f2]"
            onClick={handler}
            type="button"
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        <button
          className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[#f4f6f2]"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <Upload className="h-4 w-4" />
          Importar JSON
        </button>
        <input
          ref={inputRef}
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onImportJson(file);
            }
            event.currentTarget.value = "";
          }}
          type="file"
        />
      </div>
    </details>
  );
}

function SnapshotDrawer({
  projectName,
  snapshots,
  onClose,
  onRestore,
}: {
  projectName: string;
  snapshots: SnapshotRecord[];
  onClose: () => void;
  onRestore: (snapshotId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/20">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-white shadow-[0_18px_42px_rgba(18,24,20,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
              Snapshots
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">
              {projectName}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Restaurar salva um backup automático do estado atual antes da troca.
            </p>
          </div>
          <button
            className="rounded-md border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-[#f4f6f2]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="planner-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
          {snapshots.length > 0 ? (
            snapshots.map((snapshot) => (
              <div key={snapshot.id} className="rounded-md border border-[var(--border)] bg-[#fafbf8] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">{snapshot.label}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {new Date(snapshot.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <button
                    className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]"
                    onClick={() => onRestore(snapshot.id)}
                    type="button"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restaurar
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <span className="rounded-full bg-white px-3 py-1">
                    {snapshot.bundle.tasks.length} tarefas
                  </span>
                  <span className="rounded-full bg-white px-3 py-1">
                    {snapshot.bundle.dependencies.length} dependências
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted)]">
              Nenhum snapshot salvo ainda.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlannerWorkspace() {
  const [ready, setReady] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isSnapshotsOpen, setIsSnapshotsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => {
    if (typeof window === "undefined") {
      return "split";
    }

    const stored = window.localStorage.getItem("linea-workspace-view");
    return stored === "tasks" || stored === "gantt" || stored === "split"
      ? stored
      : "split";
  });
  const [taskPaneWidth, setTaskPaneWidth] = useState(() => {
    if (typeof window === "undefined") {
      return 760;
    }

    const stored = Number(window.localStorage.getItem("linea-task-pane-width"));
    return Number.isFinite(stored) && stored >= TASK_PANE_MIN_WIDTH ? stored : 760;
  });
  const [appearance, setAppearance] = useState<GanttAppearanceSettings>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_GANTT_APPEARANCE;
    }

    try {
      const stored = window.localStorage.getItem("linea-gantt-appearance");
      return stored
        ? sanitizeAppearanceSettings(
            JSON.parse(stored) as Partial<GanttAppearanceSettings>,
          )
        : DEFAULT_GANTT_APPEARANCE;
    } catch {
      return DEFAULT_GANTT_APPEARANCE;
    }
  });
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const ganttExportRef = useRef<GanttPanelHandle | null>(null);
  const taskGridRef = useRef<HTMLDivElement | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const scrollSyncLock = useRef(false);
  const [undoManagerRef] = useState(() => new UndoManager());
  const [deleteConfirm, setDeleteConfirm] = useState<{ taskId: string; taskName: string } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        void undoManagerRef.undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        void undoManagerRef.redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undoManagerRef]);

  const projects = useLiveQuery(
    () => plannerDb.projects.orderBy("updatedAt").reverse().toArray(),
    [],
  );
  const activeBundle = useLiveQuery(
    () => (activeProjectId ? getProjectBundle(activeProjectId) : Promise.resolve(null)),
    [activeProjectId],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await initializePlannerDb();
      if (navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => undefined);
      }
      if (!cancelled) {
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projects || projects.length === 0) {
      return;
    }

    const storedProjectId = window.localStorage.getItem("linea-active-project");
    if (activeProjectId && projects.some((project) => project.id === activeProjectId)) {
      return;
    }

    const fallbackProjectId =
      storedProjectId && projects.some((project) => project.id === storedProjectId)
        ? storedProjectId
        : projects[0].id;
    const frame = window.requestAnimationFrame(() => {
      setActiveProjectId(fallbackProjectId);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (activeProjectId) {
      window.localStorage.setItem("linea-active-project", activeProjectId);
    }
  }, [activeProjectId]);

  useEffect(() => {
    window.localStorage.setItem("linea-workspace-view", workspaceView);
  }, [workspaceView]);

  useEffect(() => {
    window.localStorage.setItem("linea-task-pane-width", String(taskPaneWidth));
  }, [taskPaneWidth]);

  useEffect(() => {
    window.localStorage.setItem("linea-gantt-appearance", JSON.stringify(appearance));
  }, [appearance]);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current);
      }
    };
  }, []);

  // Sync task grid scroll → Gantt panel
  useEffect(() => {
    const el = taskGridRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (scrollSyncLock.current) return;
      scrollSyncLock.current = true;
      ganttExportRef.current?.setScrollTop(el.scrollTop);
      requestAnimationFrame(() => { scrollSyncLock.current = false; });
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const resolvedProject = useMemo<ResolvedPlannerProject | null>(() => {
    if (!activeBundle) {
      return null;
    }
    return resolvePlannerProject(activeBundle);
  }, [activeBundle]);

  const visibleTasks = useMemo(() => {
    return getVisibleTasks(resolvedProject?.resolvedTasks ?? []);
  }, [resolvedProject]);

  const handleGanttVerticalScroll = useCallback((scrollTop: number) => {
    if (scrollSyncLock.current) return;
    scrollSyncLock.current = true;
    if (taskGridRef.current) {
      taskGridRef.current.scrollTop = scrollTop;
    }
    requestAnimationFrame(() => { scrollSyncLock.current = false; });
  }, []);

  function pushNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = window.setTimeout(() => {
      setNotice(null);
    }, 3200);
  }

  function handleAppearanceChange<K extends keyof GanttAppearanceSettings>(
    key: K,
    value: GanttAppearanceSettings[K],
  ) {
    setAppearance((current) => sanitizeAppearanceSettings({ ...current, [key]: value }));
  }

  function resetAppearance() {
    setAppearance(DEFAULT_GANTT_APPEARANCE);
  }

  function startResizeTaskPane(event: React.PointerEvent<HTMLButtonElement>) {
    if (!splitContainerRef.current) {
      return;
    }

    event.preventDefault();
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const move = (moveEvent: PointerEvent) => {
      const container = splitContainerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const maxWidth = Math.max(
        TASK_PANE_MIN_WIDTH,
        rect.width - GANTT_PANE_MIN_WIDTH - 8,
      );
      const nextWidth = Math.min(
        maxWidth,
        Math.max(TASK_PANE_MIN_WIDTH, moveEvent.clientX - rect.left),
      );
      setTaskPaneWidth(nextWidth);
    };

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      event.currentTarget.releasePointerCapture(pointerId);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  async function persistGraph(
    nextTasks: TaskRecord[],
    nextDependencies: DependencyRecord[],
    options?: {
      project?: ProjectRecord;
      view?: ProjectViewRecord | null;
    },
  ) {
    if (!resolvedProject) {
      return;
    }

    const timestamp = nowISO();
    const project = {
      ...(options?.project ?? resolvedProject.project),
      updatedAt: timestamp,
    };
    const orderedTasks = withResequencedOrders(nextTasks).map((task) => ({
      ...task,
      updatedAt: timestamp,
    }));
    const dependencies = nextDependencies.map((dependency) => ({
      ...dependency,
      updatedAt: timestamp,
    }));
    const view = options?.view ?? resolvedProject.view;

    await plannerDb.transaction(
      "rw",
      [plannerDb.projects, plannerDb.tasks, plannerDb.dependencies, plannerDb.views],
      async () => {
        await plannerDb.projects.put(project);
        await plannerDb.tasks.where("projectId").equals(project.id).delete();
        if (orderedTasks.length > 0) {
          await plannerDb.tasks.bulkAdd(orderedTasks);
        }
        await plannerDb.dependencies.where("projectId").equals(project.id).delete();
        if (dependencies.length > 0) {
          await plannerDb.dependencies.bulkAdd(dependencies);
        }
        if (view) {
          await plannerDb.views.put({ ...view, updatedAt: timestamp });
        }
      },
    );
  }

  async function updateProject(partial: Partial<ProjectRecord>) {
    if (!resolvedProject) {
      return;
    }

    await plannerDb.projects.put({
      ...resolvedProject.project,
      ...partial,
      updatedAt: nowISO(),
    });
  }

  async function updateView(partial: Partial<ProjectViewRecord>) {
    if (!resolvedProject) {
      return;
    }

    await saveProjectView(buildProjectView(resolvedProject, partial));
  }

  async function updateTask(
    taskId: string,
    updater: (task: TaskRecord) => TaskRecord,
  ) {
    if (!resolvedProject) {
      return;
    }

    const nextTasks = sortTasksByOrder(resolvedProject.tasks).map((task) =>
      task.id === taskId ? updater(task) : task,
    );
    await persistGraph(nextTasks, resolvedProject.dependencies);
  }

  async function handleCreateProject() {
    const projectId = await createProject();
    setActiveProjectId(projectId);
    pushNotice("success", "Novo cronograma criado localmente.");
  }

  async function handleDuplicateProject() {
    if (!activeProjectId) {
      return;
    }

    const duplicatedId = await duplicateProject(activeProjectId);
    if (duplicatedId) {
      setActiveProjectId(duplicatedId);
      pushNotice("success", "Projeto duplicado com sucesso.");
    }
  }

  async function handleDeleteProject() {
    if (!activeProjectId || !projects || projects.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      "Deseja remover este projeto local? Esta ação apaga tarefas, dependências e snapshots do navegador.",
    );
    if (!confirmed) {
      return;
    }

    const remainingProjects = projects.filter((project) => project.id !== activeProjectId);
    await deleteProject(activeProjectId);

    if (remainingProjects.length === 0) {
      const projectId = await createProject();
      setActiveProjectId(projectId);
    } else {
      setActiveProjectId(remainingProjects[0].id);
    }

    pushNotice("info", "Projeto removido do armazenamento local.");
  }

  async function handleAddTask(afterTaskId?: string) {
    if (!resolvedProject) {
      return;
    }

    const orderedTasks = sortTasksByOrder(resolvedProject.tasks);
    const sourceIndex = afterTaskId
      ? orderedTasks.findIndex((task) => task.id === afterTaskId)
      : orderedTasks.length - 1;
    const sourceTask = sourceIndex >= 0 ? orderedTasks[sourceIndex] : null;
    const timestamp = nowISO();
    const nextCode =
      orderedTasks.reduce((highest, task) => Math.max(highest, task.code), 0) + 1;
    const startDate = sourceTask?.startDate ?? resolvedProject.project.startDate ?? todayISO();
    const newTask: TaskRecord = {
      id: crypto.randomUUID(),
      projectId: resolvedProject.project.id,
      code: nextCode,
      parentId: sourceTask?.parentId ?? null,
      order: (sourceIndex + 2) * 10,
      name: "Nova tarefa",
      kind: "task",
      startDate,
      endDate: startDate,
      durationDays: 1,
      progress: 0,
      notes: "",
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const nextTasks = [...orderedTasks];

    if (sourceIndex >= 0) {
      nextTasks.splice(sourceIndex + 1, 0, newTask);
    } else {
      nextTasks.push(newTask);
    }

    await persistGraph(nextTasks, resolvedProject.dependencies, {
      view: buildProjectView(resolvedProject, { selectedTaskId: newTask.id }),
    });
    pushNotice("success", "Linha criada abaixo da seleção atual.");
  }

  async function handleDeleteTask(taskId: string) {
    if (!resolvedProject) {
      return;
    }

    const idsToDelete = collectSubtreeIds(taskId, resolvedProject.tasks);
    const nextTasks = resolvedProject.tasks.filter((task) => !idsToDelete.has(task.id));
    const nextDependencies = resolvedProject.dependencies.filter(
      (dependency) =>
        !idsToDelete.has(dependency.predecessorId) &&
        !idsToDelete.has(dependency.successorId),
    );
    const nextSelectedTask = nextTasks[0]?.id ?? null;

    await persistGraph(nextTasks, nextDependencies, {
      view: buildProjectView(resolvedProject, { selectedTaskId: nextSelectedTask }),
    });
    pushNotice("info", "Tarefa e subtarefas removidas do cronograma.");
  }

  async function handleToggleCollapse(taskId: string) {
    await updateTask(taskId, (task) => ({ ...task, collapsed: !task.collapsed }));
  }

  async function handleIndentTask(taskId: string) {
    if (!resolvedProject) {
      return;
    }

    const orderedTasks = sortTasksByOrder(resolvedProject.tasks);
    const currentRange = getSubtreeRange(orderedTasks, taskId);
    const index = currentRange?.startIndex ?? -1;
    if (index <= 0) {
      return;
    }

    const previousTask = orderedTasks[index - 1];
    const subtreeIds = collectSubtreeIds(taskId, orderedTasks);
    if (subtreeIds.has(previousTask.id)) {
      return;
    }

    const nextTasks = orderedTasks.map((item) =>
      item.id === taskId ? { ...item, parentId: previousTask.id } : item,
    );
    await persistGraph(nextTasks, resolvedProject.dependencies);
  }

  async function handleOutdentTask(taskId: string) {
    if (!resolvedProject) {
      return;
    }

    const orderedTasks = sortTasksByOrder(resolvedProject.tasks);
    const task = orderedTasks.find((item) => item.id === taskId);
    if (!task?.parentId) {
      return;
    }

    const nextTasks = outdentTaskBlock(orderedTasks, taskId);
    await persistGraph(nextTasks, resolvedProject.dependencies);
  }

  async function handleMoveTask(taskId: string, direction: "up" | "down") {
    if (!resolvedProject) {
      return;
    }

    const orderedTasks = sortTasksByOrder(resolvedProject.tasks);
    const nextTasks = moveTaskBlock(orderedTasks, taskId, direction);
    await persistGraph(nextTasks, resolvedProject.dependencies);
  }

  async function handleReorderTask(taskId: string, targetIndex: number) {
    if (!resolvedProject) {
      return;
    }

    const orderedTasks = sortTasksByOrder(resolvedProject.tasks);
    const srcIndex = orderedTasks.findIndex((t) => t.id === taskId);
    if (srcIndex === -1 || srcIndex === targetIndex) {
      return;
    }

    const nextTasks = [...orderedTasks];
    const [removed] = nextTasks.splice(srcIndex, 1);
    nextTasks.splice(targetIndex, 0, removed);
    await persistGraph(nextTasks, resolvedProject.dependencies);
  }

  async function handleUpdatePredecessors(taskId: string, value: string) {
    if (!resolvedProject) {
      return;
    }

    const targetTask = resolvedProject.resolvedTasks.find((task) => task.id === taskId);
    if (!targetTask || targetTask.isSummary) {
      pushNotice("error", "Tarefas-resumo não aceitam predecessoras diretas.");
      return;
    }

    let parsedDependencies;

    try {
      parsedDependencies = parseDependencyInput(value);
    } catch {
      pushNotice(
        "error",
        "Use o formato 12, 15SS, 18FF+2d ou 20SF-1d para editar dependências.",
      );
      return;
    }

    const codeMap = new Map(resolvedProject.tasks.map((task) => [task.code, task]));
    const predecessorTasks: Array<{
      task: TaskRecord;
      type: DependencyRecord["type"];
      lagDays: number;
    }> = [];
    const seenCodes = new Set<number>();

    for (const parsed of parsedDependencies) {
      if (seenCodes.has(parsed.code)) {
        pushNotice(
          "error",
          `A tarefa ${parsed.code} foi repetida. Use apenas uma ligação por predecessora na mesma célula.`,
        );
        return;
      }
      seenCodes.add(parsed.code);

      const predecessor = codeMap.get(parsed.code);
      if (!predecessor) {
        pushNotice(
          "error",
          `A tarefa ${parsed.code} não foi encontrada para criar a dependência.`,
        );
        return;
      }
      if (predecessor.id === taskId) {
        pushNotice("error", "Uma tarefa não pode depender dela mesma.");
        return;
      }
      const predecessorResolved = resolvedProject.resolvedTasks.find(
        (task) => task.id === predecessor.id,
      );
      if (predecessorResolved?.isSummary) {
        pushNotice(
          "error",
          "Não use tarefas-resumo como predecessoras. Vincule as tarefas filhas executáveis.",
        );
        return;
      }
      predecessorTasks.push({
        task: predecessor,
        type: parsed.type,
        lagDays: parsed.lagDays,
      });
    }

    const retainedDependencies = resolvedProject.dependencies.filter(
      (dependency) => dependency.successorId !== taskId,
    );

    for (const predecessor of predecessorTasks) {
      if (hasPath(taskId, predecessor.task.id, retainedDependencies)) {
        pushNotice(
          "error",
          `A ligação com a tarefa ${predecessor.task.code} criaria um ciclo no cronograma.`,
        );
        return;
      }
    }

    const timestamp = nowISO();
    const nextDependencies = [
      ...retainedDependencies,
      ...predecessorTasks.map((predecessor) => ({
        id: crypto.randomUUID(),
        projectId: resolvedProject.project.id,
        predecessorId: predecessor.task.id,
        successorId: taskId,
        type: predecessor.type,
        lagDays: predecessor.lagDays,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    ];

    await persistGraph(resolvedProject.tasks, nextDependencies);
  }

  async function handleImportJson(file: File) {
    try {
      const payload = plannerBundleSchema.parse(
        JSON.parse(await file.text()),
      ) as PlannerExportBundle;
      const importedId = await importProjectBundle(payload);
      setActiveProjectId(importedId);
      pushNotice("success", "Projeto importado para o armazenamento local.");
    } catch {
      pushNotice("error", "Não foi possível importar este arquivo JSON.");
    }
  }

  async function handleCreateSnapshot() {
    if (!resolvedProject) {
      return;
    }

    await createSnapshot(
      resolvedProject.project.id,
      `Snapshot ${new Date().toLocaleString("pt-BR")}`,
    );
    pushNotice("success", "Snapshot salvo para restauração local.");
    setIsSnapshotsOpen(true);
  }

  async function handleRestoreSnapshot(snapshotId: string) {
    if (!resolvedProject) {
      return;
    }

    const confirmed = window.confirm(
      "Deseja restaurar este snapshot? O estado atual será substituído, mas um backup automático será salvo antes.",
    );
    if (!confirmed) {
      return;
    }

    const restored = await restoreSnapshot(snapshotId);
    if (restored) {
      pushNotice("success", "Snapshot restaurado com backup automático do estado atual.");
      setIsSnapshotsOpen(false);
    } else {
      pushNotice("error", "Não foi possível restaurar o snapshot selecionado.");
    }
  }

  if (!ready || !projects) {
    return (
      <div className="planner-shell flex min-h-screen items-center justify-center px-6">
        <div className="rounded-md border border-[var(--border)] bg-white px-8 py-10 text-center shadow-[0_18px_42px_rgba(18,24,20,0.1)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
            Inicializando
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-[var(--foreground)]">
            Preparando o cronograma
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
            Configurando o armazenamento local e carregando o projeto de trabalho.
          </p>
        </div>
      </div>
    );
  }

  if (!resolvedProject) {
    return (
      <div className="planner-shell flex min-h-screen items-center justify-center px-6">
        <div className="rounded-md border border-[var(--border)] bg-white px-8 py-10 text-center shadow-[0_18px_42px_rgba(18,24,20,0.1)]">
          <p className="text-sm text-[var(--muted)]">Nenhum projeto carregado.</p>
          <button
            className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
            onClick={handleCreateProject}
            type="button"
          >
            Criar primeiro cronograma
          </button>
        </div>
      </div>
    );
  }

  const showTaskPane = workspaceView !== "gantt";
  const showGanttPane = workspaceView !== "tasks";
  const gridRowHeight = Math.max(36, appearance.barHeight + appearance.rowPadding);
  // Gantt internal header = upper(45) + lower(30) + gap(10) = 85px (constant)
  // Gantt panel wrapper has p-3 = 12px top padding. Task grid thead is ~36px.
  const taskHeaderOffset = 85 + 12 - 36 - 2;

  return (
    <div className="planner-shell flex min-h-screen flex-col">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <ProjectMenu
              activeProjectId={activeProjectId}
              onCreateProject={handleCreateProject}
              onDeleteProject={handleDeleteProject}
              onDuplicateProject={handleDuplicateProject}
              onSelectProject={setActiveProjectId}
              projects={projects}
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
                Cronograma ativo
              </p>
              <input
                className="h-9 min-w-[240px] max-w-[560px] bg-transparent text-lg font-semibold text-[var(--foreground)] outline-none"
                defaultValue={resolvedProject.project.name}
                key={`${resolvedProject.project.id}-${resolvedProject.project.updatedAt}-name`}
                onBlur={(event) => {
                  const nextName = event.target.value.trim();
                  if (nextName.length > 0) {
                    void updateProject({ name: nextName });
                  }
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
              onClick={() => void handleAddTask(resolvedProject.view?.selectedTaskId ?? undefined)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Nova tarefa
            </button>
            <div className="flex rounded-md border border-[var(--border)] bg-[#f7f8f5] p-1">
              {[
                { key: "split", label: "Lado a lado" },
                { key: "tasks", label: "Tarefas" },
                { key: "gantt", label: "Gantt" },
              ].map((option) => (
                <button
                  key={option.key}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    workspaceView === option.key
                      ? "bg-white text-[var(--foreground)] shadow-[0_1px_2px_rgba(18,24,20,0.08)]"
                      : "text-[var(--muted)]"
                  }`}
                  onClick={() => setWorkspaceView(option.key as WorkspaceView)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <FileMenu
              onCreateSnapshot={() => {
                void handleCreateSnapshot();
              }}
              onExportCsv={() => exportProjectCsv(resolvedProject.project, resolvedProject.resolvedTasks)}
              onExportJson={() =>
                exportProjectJson({
                  schemaVersion: 1,
                  exportedAt: nowISO(),
                  project: resolvedProject.project,
                  tasks: resolvedProject.tasks,
                  dependencies: resolvedProject.dependencies,
                  view: resolvedProject.view,
                })
              }
              onExportPdf={() => {
                const el = ganttExportRef.current?.exportElement;
                if (el) {
                  void exportGanttPdf(el, resolvedProject.project);
                }
              }}
              onExportPng={() => {
                const el = ganttExportRef.current?.exportElement;
                if (el) {
                  void exportGanttPng(el, resolvedProject.project);
                }
              }}
              onExportXlsx={() => exportProjectXlsx(resolvedProject.project, resolvedProject.resolvedTasks)}
              onImportJson={(file) => {
                void handleImportJson(file);
              }}
              onOpenSnapshots={() => setIsSnapshotsOpen(true)}
            />
            <button
              className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]"
              onClick={() => setIsSettingsOpen(true)}
              type="button"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Aparência
            </button>
          </div>
        </div>
      </header>

      <NoticeBanner notice={notice} />

      {resolvedProject.issues.length > 0 ? (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Zap className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Revisar dependências e consistência</p>
            <p className="mt-1 leading-6">{resolvedProject.issues[0].message}</p>
          </div>
        </div>
      ) : null}

      <main className="min-h-0 flex-1 p-4">
        <div
          ref={splitContainerRef}
          className={`grid h-full min-h-[600px] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--border)] ${
            workspaceView === "split"
              ? "lg:grid-cols-[minmax(0,var(--task-pane-width))_8px_minmax(0,1fr)]"
              : "grid-cols-1"
          }`}
          style={
            workspaceView === "split"
              ? { ["--task-pane-width" as string]: `${taskPaneWidth}px` }
              : undefined
          }
        >
          {showTaskPane ? (
            <section className="min-h-0 bg-white">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
                      Tarefas
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Nome, datas, duração, dependências, progresso e estrutura.
                    </p>
                  </div>
                  <span className="mono text-xs font-semibold text-[var(--muted-soft)]">
                    {visibleTasks.length} linhas
                  </span>
                </div>
                <TaskGrid
                  ref={taskGridRef}
                  headerOffset={taskHeaderOffset}
                  rowHeight={gridRowHeight}
                  onAddBelow={(taskId) => {
                    void handleAddTask(taskId);
                  }}
                  onCommitDuration={(taskId, duration) => {
                    void updateTask(taskId, (task) => buildTaskPatchFromDuration(task, duration));
                  }}
                  onCommitEndDate={(taskId, endDate) => {
                    void updateTask(taskId, (task) => buildTaskPatchFromEndDate(task, endDate));
                  }}
                  onCommitKind={(taskId, kind) => {
                    void updateTask(taskId, (task) => ({
                      ...task,
                      kind,
                      endDate: kind === "milestone" ? task.startDate : task.endDate,
                      durationDays: kind === "milestone" ? 0 : Math.max(task.durationDays, 1),
                    }));
                  }}
                  onCommitName={(taskId, name) => {
                    void updateTask(taskId, (task) => ({ ...task, name }));
                  }}
                  onCommitPredecessors={(taskId, value) => {
                    void handleUpdatePredecessors(taskId, value);
                  }}
                  onCommitProgress={(taskId, progress) => {
                    void updateTask(taskId, (task) => ({
                      ...task,
                      progress: Math.max(0, Math.min(progress, 100)),
                    }));
                  }}
                  onCommitStartDate={(taskId, startDate) => {
                    void updateTask(taskId, (task) =>
                      buildTaskPatchFromDates(task, startDate, task.endDate),
                    );
                  }}
                  onCommitNotes={(taskId, notes) => {
                    void updateTask(taskId, (task) => ({ ...task, notes }));
                  }}
                  onDelete={(taskId) => {
                    const task = visibleTasks.find((t) => t.id === taskId);
                    setDeleteConfirm({ taskId, taskName: task?.name ?? "esta tarefa" });
                  }}
                  onIndent={(taskId) => {
                    void handleIndentTask(taskId);
                  }}
                  onMoveDown={(taskId) => {
                    void handleMoveTask(taskId, "down");
                  }}
                  onMoveUp={(taskId) => {
                    void handleMoveTask(taskId, "up");
                  }}
                  onOutdent={(taskId) => {
                    void handleOutdentTask(taskId);
                  }}
                  onReorder={(taskId, targetIndex) => {
                    void handleReorderTask(taskId, targetIndex);
                  }}
                  onSelectTask={(taskId) => {
                    void updateView({ selectedTaskId: taskId });
                  }}
                  onToggleCollapse={(taskId) => {
                    void handleToggleCollapse(taskId);
                  }}
                  selectedTaskId={resolvedProject.view?.selectedTaskId ?? null}
                  tasks={visibleTasks}
                />
              </div>
            </section>
          ) : null}

          {workspaceView === "split" ? (
            <div className="hidden bg-[var(--border)] lg:flex lg:items-stretch lg:justify-center">
              <button
                aria-label="Redimensionar tarefas e Gantt"
                className="group flex h-full w-full cursor-col-resize items-center justify-center bg-[var(--border)] transition hover:bg-[var(--panel-strong)]"
                onPointerDown={startResizeTaskPane}
                type="button"
              >
                <span className="h-20 w-[2px] rounded-full bg-[var(--border-strong)] group-hover:bg-[var(--accent)]" />
              </button>
            </div>
          ) : null}

          {showGanttPane ? (
            <section className="min-h-0 bg-white">
              <GanttPanel
                appearance={appearance}
                onDateChange={(taskId, startDate, endDate) => {
                  const targetTask = resolvedProject.tasks.find((task) => task.id === taskId);
                  const resolvedTask = resolvedProject.resolvedTasks.find(
                    (task) => task.id === taskId,
                  );
                  if (!targetTask || resolvedTask?.isSummary) {
                    pushNotice(
                      "info",
                      "Tarefas-resumo são recalculadas pelas subtarefas e não podem ser movidas direto no Gantt.",
                    );
                    return;
                  }
                  void updateTask(taskId, (task) =>
                    buildTaskPatchFromDates(task, startDate, endDate),
                  );
                }}
                onSelectTask={(taskId) => {
                  void updateView({ selectedTaskId: taskId });
                }}
                onViewModeChange={(viewMode) => {
                  void updateView({ chartViewMode: viewMode });
                }}
                projectName={resolvedProject.project.name}
                ref={ganttExportRef}
                selectedTaskId={resolvedProject.view?.selectedTaskId ?? null}
                tasks={visibleTasks}
                viewMode={resolvedProject.view?.chartViewMode ?? "Week"}
                onVerticalScroll={handleGanttVerticalScroll}
              />
            </section>
          ) : null}
        </div>
      </main>

      {isSnapshotsOpen ? (
        <SnapshotDrawer
          onClose={() => setIsSnapshotsOpen(false)}
          onRestore={(snapshotId) => {
            void handleRestoreSnapshot(snapshotId);
          }}
          projectName={resolvedProject.project.name}
          snapshots={resolvedProject.snapshots}
        />
      ) : null}

      <PlannerSettingsDrawer
        isOpen={isSettingsOpen}
        onChange={handleAppearanceChange}
        onClose={() => setIsSettingsOpen(false)}
        onReset={resetAppearance}
        settings={appearance}
      />

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Excluir tarefa"
        description={`Deseja excluir "${deleteConfirm?.taskName}"? Esta ação é permanente e remove também as subtarefas.`}
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (deleteConfirm) {
            void handleDeleteTask(deleteConfirm.taskId);
            setDeleteConfirm(null);
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
