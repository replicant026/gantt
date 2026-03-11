import { addWorkingDays, deriveEndDate, nowISO, todayISO } from "@/lib/date-utils";
import type {
  DependencyRecord,
  PlannerExportBundle,
  ProjectRecord,
  ProjectViewRecord,
  SnapshotRecord,
  TaskRecord,
} from "@/types/planner";

function createTask(
  projectId: string,
  code: number,
  order: number,
  name: string,
  startDate: string,
  durationDays: number,
  parentId: string | null = null,
  kind: TaskRecord["kind"] = "task",
  progress = 0,
): TaskRecord {
  const timestamp = nowISO();

  return {
    id: crypto.randomUUID(),
    projectId,
    code,
    parentId,
    order,
    name,
    kind,
    startDate,
    endDate: kind === "milestone" ? startDate : deriveEndDate(startDate, durationDays),
    durationDays: kind === "milestone" ? 0 : durationDays,
    progress,
    notes: "",
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createSeedProjectBundle(name = "Lançamento da Plataforma Linea"): {
  project: ProjectRecord;
  tasks: TaskRecord[];
  dependencies: DependencyRecord[];
  view: ProjectViewRecord;
  snapshots: SnapshotRecord[];
} {
  const projectId = crypto.randomUUID();
  const timestamp = nowISO();
  const startDate = todayISO();

  const project: ProjectRecord = {
    id: projectId,
    name,
    description:
      "Cronograma piloto para validar a estrutura local-first, dependencias e a experiencia visual do workspace.",
    accent: "#1f6b52",
    startDate,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const discovery = createTask(projectId, 1, 10, "Descoberta e alinhamento", startDate, 3, null, "task", 100);
  const design = createTask(projectId, 2, 20, "Design do workspace", addWorkingDays(discovery.endDate, 1), 4, null, "task", 68);
  const engine = createTask(projectId, 3, 30, "Motor de cronograma", addWorkingDays(design.endDate, 1), 5, null, "task", 48);
  const qa = createTask(projectId, 4, 40, "Validação e polimento", addWorkingDays(engine.endDate, 1), 3, null, "task", 12);
  const launch = createTask(projectId, 5, 50, "Deploy privado na Vercel", addWorkingDays(qa.endDate, 1), 1, null, "milestone", 0);

  const tasks = [discovery, design, engine, qa, launch];

  const dependencies: DependencyRecord[] = [
    [discovery.id, design.id],
    [design.id, engine.id],
    [engine.id, qa.id],
    [qa.id, launch.id],
  ].map(([predecessorId, successorId]) => ({
    id: crypto.randomUUID(),
    projectId,
    predecessorId,
    successorId,
    type: "FS",
    lagDays: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const view: ProjectViewRecord = {
    projectId,
    chartViewMode: "Week",
    selectedTaskId: discovery.id,
    rightPanelOpen: true,
    updatedAt: timestamp,
  };

  const bundle: PlannerExportBundle = {
    schemaVersion: 1,
    exportedAt: timestamp,
    project,
    tasks,
    dependencies,
    view,
  };

  const snapshots: SnapshotRecord[] = [
    {
      id: crypto.randomUUID(),
      projectId,
      label: "Seed inicial",
      createdAt: timestamp,
      bundle,
    },
  ];

  return { project, tasks, dependencies, view, snapshots };
}
