"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarDays,
  CircleAlert,
  Copy,
  Download,
  FolderPlus,
  HardDriveDownload,
  History,
  Layers3,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";

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
  calculatePlannerStats,
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
  PlannerExportBundle,
  PlannerProjectBundle,
  ProjectRecord,
  ProjectViewRecord,
  ResolvedPlannerProject,
  ResolvedTask,
  TaskRecord,
} from "@/types/planner";

import { GanttPanel } from "./gantt-panel";
import { TaskGrid } from "./task-grid";

type NoticeTone = "success" | "error" | "info";

type Notice = {
  tone: NoticeTone;
  message: string;
};

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
  const remaining = tasks.filter((item) => !currentRange.items.some((block) => block.id === item.id));
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
      className={`glass-card flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${palette[notice.tone]}`}
    >
      <CircleAlert className="h-4 w-4" />
      <span>{notice.message}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="glass-card rounded-3xl px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-soft)]">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold text-[var(--foreground)]">{value}</p>
        <p className="max-w-[10rem] text-right text-xs text-[var(--muted)]">
          {hint}
        </p>
      </div>
    </div>
  );
}

function ProjectRail({
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
    <aside className="space-y-4">
      <div className="glass-card rounded-[28px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-soft)]">
              Linea Planner
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-[var(--foreground)]">
              Cronogramas privados
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Use local-first, refine dependencias e so depois leve para deploy.
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--accent-soft)] p-3 text-[var(--accent)]">
            <Layers3 className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <button
            className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
            onClick={onCreateProject}
            type="button"
          >
            <FolderPlus className="h-4 w-4" />
            Novo projeto
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]"
            onClick={onDuplicateProject}
            type="button"
          >
            <Copy className="h-4 w-4" />
            Duplicar
          </button>
        </div>
      </div>

      <div className="panel-card rounded-[28px] p-3">
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="text-sm font-semibold text-[var(--foreground)]">Projetos</p>
          <button
            className="rounded-xl p-2 text-[var(--muted)] transition hover:bg-white hover:text-[var(--danger)]"
            onClick={onDeleteProject}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="planner-scrollbar max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {projects.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <button
                key={project.id}
                className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                  active
                    ? "border-[var(--accent)] bg-white shadow-[0_16px_40px_rgba(24,32,27,0.08)]"
                    : "border-transparent bg-white/60 hover:border-[var(--border)]"
                }`}
                onClick={() => onSelectProject(project.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="line-clamp-1 font-semibold text-[var(--foreground)]">
                    {project.name}
                  </p>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: project.accent }}
                  />
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
                  {project.description || "Sem descricao ainda. Ajuste o escopo no painel central."}
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted-soft)]">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Inicio {formatHumanDate(project.startDate)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function ExportMenu({
  onExportJson,
  onExportCsv,
  onExportXlsx,
  onExportPng,
  onExportPdf,
  onImportJson,
}: {
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
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]">
        <Download className="h-4 w-4" />
        Exportar
      </summary>
      <div className="glass-card absolute right-0 top-[calc(100%+12px)] z-20 w-56 rounded-3xl p-2">
        {[
          { label: "JSON do projeto", handler: onExportJson },
          { label: "CSV da grade", handler: onExportCsv },
          { label: "XLSX do cronograma", handler: onExportXlsx },
          { label: "PNG do Gantt", handler: onExportPng },
          { label: "PDF do Gantt", handler: onExportPdf },
        ].map(({ label, handler }) => (
          <button
            key={label}
            className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--accent-soft)]"
            onClick={handler}
            type="button"
          >
            <HardDriveDownload className="h-4 w-4 text-[var(--accent)]" />
            {label}
          </button>
        ))}
        <button
          className="mt-1 flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--accent-soft)]"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <Upload className="h-4 w-4 text-[var(--accent)]" />
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

function InspectorPanel({
  project,
  task,
  onToggleOpen,
  onUpdateNotes,
  onUpdateProgress,
}: {
  project: ResolvedPlannerProject;
  task: ResolvedTask | null;
  onToggleOpen: () => void;
  onUpdateNotes: (taskId: string, notes: string) => void;
  onUpdateProgress: (taskId: string, progress: number) => void;
}) {
  const isOpen = project.view?.rightPanelOpen ?? true;

  return (
    <aside className="space-y-4">
      <div className="glass-card rounded-[28px] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-soft)]">
              Contexto
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--foreground)]">
              Painel da tarefa
            </h2>
          </div>
          <button
            className="rounded-2xl border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]"
            onClick={onToggleOpen}
            type="button"
          >
            {isOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      {isOpen ? (
        task ? (
          <div className="space-y-4">
            <div className="panel-card rounded-[28px] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="mono text-xs text-[var(--muted-soft)]">#{task.code}</p>
                  <h3 className="mt-1 text-xl font-semibold text-[var(--foreground)]">
                    {task.name}
                  </h3>
                </div>
                <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                  {task.computedKind}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/70 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-soft)]">
                    Inicio
                  </p>
                  <p className="mt-2 font-semibold text-[var(--foreground)]">
                    {formatHumanDate(task.startDate)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/70 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-soft)]">
                    Fim
                  </p>
                  <p className="mt-2 font-semibold text-[var(--foreground)]">
                    {formatHumanDate(task.endDate)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/70 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-soft)]">
                    Duracao
                  </p>
                  <p className="mt-2 font-semibold text-[var(--foreground)]">
                    {task.durationDays} {task.durationDays === 1 ? "dia" : "dias"}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/70 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-soft)]">
                    Estrutura
                  </p>
                  <p className="mt-2 font-semibold text-[var(--foreground)]">WBS {task.wbs}</p>
                </div>
              </div>
            </div>

            <div className="panel-card rounded-[28px] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">Progresso</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Ajuste visual rapido para acompanhar a barra do Gantt.
                  </p>
                </div>
                <span className="mono text-lg font-semibold text-[var(--foreground)]">
                  {task.progress}%
                </span>
              </div>
              <input
                className="mt-4 w-full accent-[var(--accent)]"
                defaultValue={task.progress}
                disabled={task.isSummary}
                key={`${task.id}-${task.updatedAt}-progress`}
                max={100}
                min={0}
                onMouseUp={(event) => {
                  onUpdateProgress(task.id, Number((event.target as HTMLInputElement).value));
                }}
                type="range"
              />
            </div>

            <div className="panel-card rounded-[28px] p-5">
              <p className="text-sm font-semibold text-[var(--foreground)]">Dependencias</p>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-soft)]">
                    Predecessoras
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {task.predecessorCodes.length > 0 ? (
                      task.predecessorLinks.map((link) => (
                        <span
                          key={link.dependencyId}
                          className="mono rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]"
                        >
                          {link.label}
                        </span>
                      ))
                    ) : (
                      <span className="text-[var(--muted)]">Sem predecessoras.</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-soft)]">
                    Sucessoras
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {task.successorCodes.length > 0 ? (
                      task.successorLinks.map((link) => (
                        <span
                          key={link.dependencyId}
                          className="mono rounded-full bg-[#f4e6de] px-3 py-1 text-xs font-semibold text-[var(--copper)]"
                        >
                          {link.label}
                        </span>
                      ))
                    ) : (
                      <span className="text-[var(--muted)]">Sem sucessoras.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="panel-card rounded-[28px] p-5">
              <p className="text-sm font-semibold text-[var(--foreground)]">Notas</p>
              <textarea
                className="mt-4 min-h-36 w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                defaultValue={task.notes}
                key={`${task.id}-${task.updatedAt}-notes`}
                onBlur={(event) => onUpdateNotes(task.id, event.target.value)}
                placeholder="Anote premissas, responsaveis ou riscos desta tarefa."
              />
            </div>
          </div>
        ) : (
          <div className="panel-card rounded-[28px] p-8 text-center">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Selecione uma tarefa
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              O painel lateral mostra progresso, dependencias e notas da linha ativa.
            </p>
          </div>
        )
      ) : null}
    </aside>
  );
}

export function PlannerWorkspace() {
  const [ready, setReady] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isSnapshotsOpen, setIsSnapshotsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const ganttExportRef = useRef<HTMLDivElement | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);

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
    return () => {
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current);
      }
    };
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

  const stats = useMemo(() => {
    return calculatePlannerStats(
      resolvedProject?.resolvedTasks ?? [],
      resolvedProject?.dependencies.length ?? 0,
    );
  }, [resolvedProject]);

  const selectedTask = useMemo(() => {
    if (!resolvedProject) {
      return null;
    }
    const selectedTaskId = resolvedProject.view?.selectedTaskId ?? null;
    return (
      resolvedProject.resolvedTasks.find((task) => task.id === selectedTaskId) ?? null
    );
  }, [resolvedProject]);

  function pushNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = window.setTimeout(() => {
      setNotice(null);
    }, 3200);
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

    await persistGraph(
      nextTasks,
      resolvedProject.dependencies,
      {
        view: buildProjectView(resolvedProject, { selectedTaskId: newTask.id }),
      },
    );
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

  async function handleUpdatePredecessors(taskId: string, value: string) {
    if (!resolvedProject) {
      return;
    }

    const targetTask = resolvedProject.resolvedTasks.find((task) => task.id === taskId);
    if (!targetTask || targetTask.isSummary) {
      pushNotice("error", "Tarefas-resumo nao aceitam predecessoras diretas.");
      return;
    }

    let parsedDependencies;
    try {
      parsedDependencies = parseDependencyInput(value);
    } catch {
      pushNotice(
        "error",
        "Use o formato 12, 15SS, 18FF+2d ou 20SF-1d para editar dependencias.",
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
          `A tarefa ${parsed.code} foi repetida. Use apenas uma ligacao por predecessora na mesma celula.`,
        );
        return;
      }
      seenCodes.add(parsed.code);

      const predecessor = codeMap.get(parsed.code);
      if (!predecessor) {
        pushNotice(
          "error",
          `A tarefa ${parsed.code} nao foi encontrada para criar a dependencia.`,
        );
        return;
      }
      if (predecessor.id === taskId) {
        pushNotice("error", "Uma tarefa nao pode depender dela mesma.");
        return;
      }
      const predecessorResolved = resolvedProject.resolvedTasks.find(
        (task) => task.id === predecessor.id,
      );
      if (predecessorResolved?.isSummary) {
        pushNotice(
          "error",
          "Nao use tarefas-resumo como predecessoras. Vincule as tarefas filhas executaveis.",
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
      pushNotice("error", "Nao foi possivel importar este arquivo JSON.");
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
    pushNotice("success", "Snapshot salvo para restauracao local.");
    setIsSnapshotsOpen(true);
  }

  async function handleRestoreSnapshot(snapshotId: string) {
    if (!resolvedProject) {
      return;
    }

    const confirmed = window.confirm(
      "Deseja restaurar este snapshot? O estado atual sera substituido, mas um backup automatico sera salvo antes.",
    );
    if (!confirmed) {
      return;
    }

    const restored = await restoreSnapshot(snapshotId);
    if (restored) {
      pushNotice("success", "Snapshot restaurado com backup automatico do estado atual.");
    } else {
      pushNotice("error", "Nao foi possivel restaurar o snapshot selecionado.");
    }
  }

  if (!ready || !projects) {
    return (
      <div className="planner-shell flex min-h-screen items-center justify-center px-6">
        <div className="glass-card rounded-[32px] px-8 py-10 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-soft)]">
            Inicializando
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-[var(--foreground)]">
            Preparando o workspace do cronograma
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
            Estamos configurando o armazenamento local, o projeto seed e a estrutura do
            planejador privado.
          </p>
        </div>
      </div>
    );
  }

  if (!resolvedProject) {
    return (
      <div className="planner-shell flex min-h-screen items-center justify-center px-6">
        <div className="glass-card rounded-[32px] px-8 py-10 text-center">
          <p className="text-sm text-[var(--muted)]">Nenhum projeto carregado.</p>
          <button
            className="mt-4 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
            onClick={handleCreateProject}
            type="button"
          >
            Criar primeiro cronograma
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="planner-shell min-h-screen px-4 py-4 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <NoticeBanner notice={notice} />

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
          <ProjectRail
            activeProjectId={activeProjectId}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
            onDuplicateProject={handleDuplicateProject}
            onSelectProject={setActiveProjectId}
            projects={projects}
          />

          <main className="space-y-4">
            <section className="glass-card rounded-[32px] p-6">
              <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-soft)]">
                    Workspace principal
                  </p>
                  <input
                    className="mt-3 w-full bg-transparent text-4xl font-semibold tracking-tight text-[var(--foreground)] outline-none"
                    defaultValue={resolvedProject.project.name}
                    key={`${resolvedProject.project.id}-${resolvedProject.project.updatedAt}-name`}
                    onBlur={(event) => {
                      const nextName = event.target.value.trim();
                      if (nextName.length > 0) {
                        void updateProject({ name: nextName });
                      }
                    }}
                  />
                  <textarea
                    className="mt-3 min-h-20 w-full resize-none bg-transparent text-sm leading-7 text-[var(--muted)] outline-none"
                    defaultValue={resolvedProject.project.description}
                    key={`${resolvedProject.project.id}-${resolvedProject.project.updatedAt}-description`}
                    onBlur={(event) => {
                      void updateProject({ description: event.target.value.trim() });
                    }}
                    placeholder="Descreva a intencao do projeto, o escopo da entrega e a logica do cronograma."
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]"
                    onClick={() => void handleAddTask(resolvedProject.view?.selectedTaskId ?? undefined)}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    Nova tarefa
                  </button>
                  <button
                    className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]"
                    onClick={() => void handleCreateSnapshot()}
                    type="button"
                  >
                    <Save className="h-4 w-4" />
                    Snapshot
                  </button>
                  <button
                    className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]"
                    onClick={() => setIsSnapshotsOpen((current) => !current)}
                    type="button"
                  >
                    <History className="h-4 w-4" />
                    Restaurar
                  </button>
                  <ExportMenu
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
                      if (ganttExportRef.current) {
                        void exportGanttPdf(ganttExportRef.current, resolvedProject.project);
                      }
                    }}
                    onExportPng={() => {
                      if (ganttExportRef.current) {
                        void exportGanttPng(ganttExportRef.current, resolvedProject.project);
                      }
                    }}
                    onExportXlsx={() => exportProjectXlsx(resolvedProject.project, resolvedProject.resolvedTasks)}
                    onImportJson={(file) => {
                      void handleImportJson(file);
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              <StatCard
                hint="itens totais no workspace, incluindo resumos e marcos"
                label="Itens"
                value={String(stats.totalTasks)}
              />
              <StatCard
                hint="percentual medio de progresso do cronograma ativo"
                label="Conclusao"
                value={`${stats.completion}%`}
              />
              <StatCard
                hint="linhas que agrupam subtarefas na estrutura hierarquica"
                label="Resumos"
                value={String(stats.summaryTasks)}
              />
              <StatCard
                hint="vinculos FS atualmente respeitados no motor de cronograma"
                label="Dependencias"
                value={String(stats.dependencies)}
              />
            </section>

            {resolvedProject.issues.length > 0 ? (
              <div className="panel-card rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                <div className="flex items-center gap-2 font-semibold">
                  <Zap className="h-4 w-4" />
                  Pontos para revisar no cronograma
                </div>
                <ul className="mt-3 space-y-1.5 text-sm leading-6">
                  {resolvedProject.issues.slice(0, 4).map((issue) => (
                    <li key={`${issue.type}-${issue.message}`}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {isSnapshotsOpen ? (
              <div className="panel-card rounded-[28px] p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      Snapshots locais
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Restauram o estado do cronograma com backup automatico do momento atual.
                    </p>
                  </div>
                  <p className="text-xs text-[var(--muted-soft)]">
                    {resolvedProject.snapshots.length} snapshots armazenados neste navegador
                  </p>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {resolvedProject.snapshots.length > 0 ? (
                    resolvedProject.snapshots.slice(0, 8).map((snapshot) => (
                      <div
                        key={snapshot.id}
                        className="rounded-[24px] border border-[var(--border)] bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-[var(--foreground)]">
                              {snapshot.label}
                            </p>
                            <p className="mt-1 text-sm text-[var(--muted)]">
                              {new Date(snapshot.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>
                          <button
                            className="flex items-center gap-2 rounded-2xl border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)]"
                            onClick={() => {
                              void handleRestoreSnapshot(snapshot.id);
                            }}
                            type="button"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Restaurar
                          </button>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                          <span className="rounded-full bg-[var(--surface)] px-3 py-1">
                            {snapshot.bundle.tasks.length} tarefas
                          </span>
                          <span className="rounded-full bg-[var(--surface)] px-3 py-1">
                            {snapshot.bundle.dependencies.length} dependências
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-white/70 px-4 py-8 text-center text-sm text-[var(--muted)]">
                      Nenhum snapshot salvo ainda. Crie um snapshot antes de tentar restaurar.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)]">
              <div className="panel-card rounded-[32px] p-4">
                <div className="mb-4 flex items-center justify-between gap-3 px-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      Grade de tarefas
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Edite nome, datas, duracao, dependencias com tipo e lag, alem da hierarquia e da ordem visual.
                    </p>
                  </div>
                  <span className="mono rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                    {visibleTasks.length} linhas visiveis
                  </span>
                </div>
                <TaskGrid
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
                    void updateTask(taskId, (task) => buildTaskPatchFromDates(task, startDate, task.endDate));
                  }}
                  onDelete={(taskId) => {
                    void handleDeleteTask(taskId);
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

              <GanttPanel
                onDateChange={(taskId, startDate, endDate) => {
                  const targetTask = resolvedProject.tasks.find((task) => task.id === taskId);
                  const resolvedTask = resolvedProject.resolvedTasks.find(
                    (task) => task.id === taskId,
                  );
                  if (!targetTask || resolvedTask?.isSummary) {
                    pushNotice(
                      "info",
                      "Tarefas-resumo sao recalculadas pelas subtarefas e nao podem ser movidas direto no Gantt.",
                    );
                    return;
                  }
                  void updateTask(taskId, (task) => buildTaskPatchFromDates(task, startDate, endDate));
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
              />
            </div>
          </main>

          <InspectorPanel
            onToggleOpen={() => {
              void updateView({
                rightPanelOpen: !(resolvedProject.view?.rightPanelOpen ?? true),
              });
            }}
            onUpdateNotes={(taskId, notes) => {
              void updateTask(taskId, (task) => ({ ...task, notes }));
            }}
            onUpdateProgress={(taskId, progress) => {
              void updateTask(taskId, (task) => ({
                ...task,
                progress: Math.max(0, Math.min(progress, 100)),
              }));
            }}
            project={resolvedProject}
            task={selectedTask}
          />
        </div>
      </div>
    </div>
  );
}
