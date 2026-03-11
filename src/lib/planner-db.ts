import Dexie, { type Table } from "dexie";

import { ensureWorkingDate, nowISO, todayISO } from "@/lib/date-utils";
import { createSeedProjectBundle } from "@/lib/seed-project";
import type {
  DependencyRecord,
  PlannerExportBundle,
  PlannerProjectBundle,
  ProjectRecord,
  ProjectViewRecord,
  SnapshotRecord,
  TaskRecord,
} from "@/types/planner";

class PlannerDb extends Dexie {
  projects!: Table<ProjectRecord, string>;
  tasks!: Table<TaskRecord, string>;
  dependencies!: Table<DependencyRecord, string>;
  views!: Table<ProjectViewRecord, string>;
  snapshots!: Table<SnapshotRecord, string>;

  constructor() {
    super("linea-project-planner");

    this.version(1).stores({
      projects: "id, updatedAt",
      tasks: "id, projectId, parentId, order, code, [projectId+order], [projectId+parentId]",
      dependencies:
        "id, projectId, predecessorId, successorId, [projectId+predecessorId], [projectId+successorId]",
      views: "projectId",
      snapshots: "id, projectId, createdAt",
    });
  }
}

export const plannerDb = new PlannerDb();

function createStarterTask(projectId: string, code = 1, order = 10): TaskRecord {
  const timestamp = nowISO();
  const startDate = ensureWorkingDate(todayISO());

  return {
    id: crypto.randomUUID(),
    projectId,
    code,
    parentId: null,
    order,
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
}

export async function initializePlannerDb(): Promise<void> {
  const totalProjects = await plannerDb.projects.count();
  if (totalProjects > 0) {
    return;
  }

  const seed = createSeedProjectBundle();
  await plannerDb.transaction(
    "rw",
    [
      plannerDb.projects,
      plannerDb.tasks,
      plannerDb.dependencies,
      plannerDb.views,
      plannerDb.snapshots,
    ],
    async () => {
      await plannerDb.projects.add(seed.project);
      await plannerDb.tasks.bulkAdd(seed.tasks);
      await plannerDb.dependencies.bulkAdd(seed.dependencies);
      await plannerDb.views.put(seed.view);
      await plannerDb.snapshots.bulkAdd(seed.snapshots);
    },
  );
}

export async function getProjectBundle(
  projectId: string,
): Promise<PlannerProjectBundle | null> {
  const [project, tasks, dependencies, view, snapshots] = await Promise.all([
    plannerDb.projects.get(projectId),
    plannerDb.tasks.where("projectId").equals(projectId).sortBy("order"),
    plannerDb.dependencies.where("projectId").equals(projectId).toArray(),
    plannerDb.views.get(projectId),
    plannerDb.snapshots.where("projectId").equals(projectId).reverse().sortBy("createdAt"),
  ]);

  if (!project) {
    return null;
  }

  return {
    project,
    tasks,
    dependencies,
    view: view ?? null,
    snapshots,
  };
}

export async function createProject(name = "Novo cronograma"): Promise<string> {
  const timestamp = nowISO();
  const projectId = crypto.randomUUID();
  const startDate = ensureWorkingDate(todayISO());
  const project: ProjectRecord = {
    id: projectId,
    name,
    description: "",
    accent: "#1f6b52",
    startDate,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const starterTask = createStarterTask(projectId);
  const view: ProjectViewRecord = {
    projectId,
    chartViewMode: "Week",
    selectedTaskId: starterTask.id,
    rightPanelOpen: true,
    updatedAt: timestamp,
  };

  await plannerDb.transaction(
    "rw",
    [plannerDb.projects, plannerDb.tasks, plannerDb.views],
    async () => {
      await plannerDb.projects.add(project);
      await plannerDb.tasks.add(starterTask);
      await plannerDb.views.put(view);
    },
  );

  return projectId;
}

export async function duplicateProject(projectId: string): Promise<string | null> {
  const bundle = await getProjectBundle(projectId);
  if (!bundle) {
    return null;
  }

  const timestamp = nowISO();
  const newProjectId = crypto.randomUUID();
  const taskIdMap = new Map<string, string>();

  const project: ProjectRecord = {
    ...bundle.project,
    id: newProjectId,
    name: `${bundle.project.name} (cópia)`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const tasks = bundle.tasks.map((task) => {
    const nextId = crypto.randomUUID();
    taskIdMap.set(task.id, nextId);
    return {
      ...task,
      id: nextId,
      projectId: newProjectId,
      parentId: task.parentId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  const remappedTasks = tasks.map((task) => ({
    ...task,
    parentId: task.parentId ? taskIdMap.get(task.parentId) ?? null : null,
  }));

  const dependencies = bundle.dependencies.map((dependency) => ({
    ...dependency,
    id: crypto.randomUUID(),
    projectId: newProjectId,
    predecessorId: taskIdMap.get(dependency.predecessorId) ?? dependency.predecessorId,
    successorId: taskIdMap.get(dependency.successorId) ?? dependency.successorId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const view: ProjectViewRecord = {
    projectId: newProjectId,
    chartViewMode: bundle.view?.chartViewMode ?? "Week",
    selectedTaskId:
      taskIdMap.get(bundle.view?.selectedTaskId ?? "") ?? remappedTasks[0]?.id ?? null,
    rightPanelOpen: bundle.view?.rightPanelOpen ?? true,
    updatedAt: timestamp,
  };

  await plannerDb.transaction(
    "rw",
    [
      plannerDb.projects,
      plannerDb.tasks,
      plannerDb.dependencies,
      plannerDb.views,
    ],
    async () => {
      await plannerDb.projects.add(project);
      await plannerDb.tasks.bulkAdd(remappedTasks);
      await plannerDb.dependencies.bulkAdd(dependencies);
      await plannerDb.views.put(view);
    },
  );

  return newProjectId;
}

export async function deleteProject(projectId: string): Promise<void> {
  await plannerDb.transaction(
    "rw",
    [
      plannerDb.projects,
      plannerDb.tasks,
      plannerDb.dependencies,
      plannerDb.views,
      plannerDb.snapshots,
    ],
    async () => {
      await plannerDb.projects.delete(projectId);
      await plannerDb.tasks.where("projectId").equals(projectId).delete();
      await plannerDb.dependencies.where("projectId").equals(projectId).delete();
      await plannerDb.views.delete(projectId);
      await plannerDb.snapshots.where("projectId").equals(projectId).delete();
    },
  );
}

export async function saveProjectView(view: ProjectViewRecord): Promise<void> {
  await plannerDb.views.put({ ...view, updatedAt: nowISO() });
}

export async function createSnapshot(
  projectId: string,
  label: string,
): Promise<SnapshotRecord | null> {
  const bundle = await exportProjectBundle(projectId);
  if (!bundle) {
    return null;
  }

  const snapshot: SnapshotRecord = {
    id: crypto.randomUUID(),
    projectId,
    label,
    createdAt: nowISO(),
    bundle,
  };

  await plannerDb.snapshots.add(snapshot);
  return snapshot;
}

export async function restoreSnapshot(snapshotId: string): Promise<boolean> {
  const snapshot = await plannerDb.snapshots.get(snapshotId);
  if (!snapshot) {
    return false;
  }

  const currentBundle = await exportProjectBundle(snapshot.projectId);
  const timestamp = nowISO();
  const safetySnapshot = currentBundle
    ? {
        id: crypto.randomUUID(),
        projectId: snapshot.projectId,
        label: `Backup antes de restaurar ${new Date().toLocaleString("pt-BR")}`,
        createdAt: timestamp,
        bundle: currentBundle,
      }
    : null;

  const restoredProject: ProjectRecord = {
    ...snapshot.bundle.project,
    id: snapshot.projectId,
    updatedAt: timestamp,
  };
  const restoredTasks = snapshot.bundle.tasks.map((task) => ({
    ...task,
    projectId: snapshot.projectId,
    updatedAt: timestamp,
  }));
  const restoredDependencies = snapshot.bundle.dependencies.map((dependency) => ({
    ...dependency,
    projectId: snapshot.projectId,
    updatedAt: timestamp,
  }));
  const restoredView = snapshot.bundle.view
    ? {
        ...snapshot.bundle.view,
        projectId: snapshot.projectId,
        updatedAt: timestamp,
      }
    : null;

  await plannerDb.transaction(
    "rw",
    [
      plannerDb.projects,
      plannerDb.tasks,
      plannerDb.dependencies,
      plannerDb.views,
      plannerDb.snapshots,
    ],
    async () => {
      if (safetySnapshot) {
        await plannerDb.snapshots.add(safetySnapshot);
      }
      await plannerDb.projects.put(restoredProject);
      await plannerDb.tasks.where("projectId").equals(snapshot.projectId).delete();
      if (restoredTasks.length > 0) {
        await plannerDb.tasks.bulkAdd(restoredTasks);
      }
      await plannerDb.dependencies.where("projectId").equals(snapshot.projectId).delete();
      if (restoredDependencies.length > 0) {
        await plannerDb.dependencies.bulkAdd(restoredDependencies);
      }
      if (restoredView) {
        await plannerDb.views.put(restoredView);
      }
    },
  );

  return true;
}

export async function exportProjectBundle(
  projectId: string,
): Promise<PlannerExportBundle | null> {
  const bundle = await getProjectBundle(projectId);
  if (!bundle) {
    return null;
  }

  return {
    schemaVersion: 1,
    exportedAt: nowISO(),
    project: bundle.project,
    tasks: bundle.tasks,
    dependencies: bundle.dependencies,
    view: bundle.view,
  };
}

export async function importProjectBundle(
  bundle: PlannerExportBundle,
): Promise<string> {
  const timestamp = nowISO();
  const newProjectId = crypto.randomUUID();
  const taskIdMap = new Map<string, string>();

  const project: ProjectRecord = {
    ...bundle.project,
    id: newProjectId,
    name: `${bundle.project.name} (importado)`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const tasks = bundle.tasks.map((task) => {
    const nextId = crypto.randomUUID();
    taskIdMap.set(task.id, nextId);
    return {
      ...task,
      id: nextId,
      projectId: newProjectId,
      parentId: task.parentId,
      startDate: ensureWorkingDate(task.startDate),
      endDate: ensureWorkingDate(task.endDate),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  const remappedTasks = tasks.map((task) => ({
    ...task,
    parentId: task.parentId ? taskIdMap.get(task.parentId) ?? null : null,
  }));

  const dependencies = bundle.dependencies.map((dependency) => ({
    ...dependency,
    id: crypto.randomUUID(),
    projectId: newProjectId,
    predecessorId: taskIdMap.get(dependency.predecessorId) ?? dependency.predecessorId,
    successorId: taskIdMap.get(dependency.successorId) ?? dependency.successorId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const view: ProjectViewRecord = {
    projectId: newProjectId,
    chartViewMode: bundle.view?.chartViewMode ?? "Week",
    selectedTaskId: remappedTasks[0]?.id ?? null,
    rightPanelOpen: bundle.view?.rightPanelOpen ?? true,
    updatedAt: timestamp,
  };

  await plannerDb.transaction(
    "rw",
    [
      plannerDb.projects,
      plannerDb.tasks,
      plannerDb.dependencies,
      plannerDb.views,
    ],
    async () => {
      await plannerDb.projects.add(project);
      await plannerDb.tasks.bulkAdd(remappedTasks);
      await plannerDb.dependencies.bulkAdd(dependencies);
      await plannerDb.views.put(view);
    },
  );

  return newProjectId;
}
