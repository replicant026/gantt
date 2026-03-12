import {
  addWorkingDays,
  compareISODate,
  deriveDurationDays,
  deriveEndDate,
  deriveStartDate,
  ensureWorkingDate,
  maxISODate,
  minISODate,
  nextWorkingDay,
} from "@/lib/date-utils";
import type {
  DependencyRecord,
  DependencyType,
  PlannerProjectBundle,
  PlannerStats,
  ResolvedDependencyLink,
  ResolvedPlannerProject,
  ResolvedTask,
  TaskRecord,
  ValidationIssue,
} from "@/types/planner";

const DEPENDENCY_TOKEN_REGEX = /^(\d+)(FS|SS|FF|SF)?(?:([+-])(\d+)D?)?$/i;

function sortByOrder(a: TaskRecord, b: TaskRecord): number {
  return a.order - b.order;
}

function normalizeLeafTask(task: TaskRecord): TaskRecord {
  if (task.kind === "milestone") {
    return {
      ...task,
      durationDays: 0,
      endDate: task.startDate,
    };
  }

  const safeDuration = Math.max(task.durationDays || 1, 1);

  if (compareISODate(task.startDate, task.endDate) > 0) {
    return {
      ...task,
      durationDays: safeDuration,
      endDate: deriveEndDate(task.startDate, safeDuration),
    };
  }

  const derivedDuration = deriveDurationDays(task.startDate, task.endDate);
  return {
    ...task,
    durationDays: Math.max(task.durationDays || derivedDuration, 1),
    endDate: deriveEndDate(task.startDate, Math.max(task.durationDays || derivedDuration, 1)),
  };
}

function buildChildrenMap(tasks: TaskRecord[]): Map<string | null, TaskRecord[]> {
  const map = new Map<string | null, TaskRecord[]>();

  for (const task of tasks) {
    const bucket = map.get(task.parentId) ?? [];
    bucket.push(task);
    map.set(task.parentId, bucket);
  }

  for (const bucket of map.values()) {
    bucket.sort(sortByOrder);
  }

  return map;
}

function createDependencyMaps(dependencies: DependencyRecord[]) {
  const incoming = new Map<string, DependencyRecord[]>();
  const outgoing = new Map<string, DependencyRecord[]>();

  for (const dependency of dependencies) {
    const incomingBucket = incoming.get(dependency.successorId) ?? [];
    incomingBucket.push(dependency);
    incoming.set(dependency.successorId, incomingBucket);

    const outgoingBucket = outgoing.get(dependency.predecessorId) ?? [];
    outgoingBucket.push(dependency);
    outgoing.set(dependency.predecessorId, outgoingBucket);
  }

  return { incoming, outgoing };
}

function collectDescendants(
  taskId: string,
  childrenMap: Map<string | null, TaskRecord[]>,
): Set<string> {
  const result = new Set<string>();
  const stack = [taskId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenMap.get(current) ?? []) {
      result.add(child.id);
      stack.push(child.id);
    }
  }

  return result;
}

function detectDependencyCycles(
  tasks: TaskRecord[],
  dependencies: DependencyRecord[],
): string[] {
  const ids = new Set(tasks.map((task) => task.id));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const task of tasks) {
    adjacency.set(task.id, []);
    indegree.set(task.id, 0);
  }

  for (const dependency of dependencies) {
    if (!ids.has(dependency.predecessorId) || !ids.has(dependency.successorId)) {
      continue;
    }

    adjacency.get(dependency.predecessorId)?.push(dependency.successorId);
    indegree.set(
      dependency.successorId,
      (indegree.get(dependency.successorId) ?? 0) + 1,
    );
  }

  const queue = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
  const visited: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.push(current);

    for (const nextId of adjacency.get(current) ?? []) {
      indegree.set(nextId, (indegree.get(nextId) ?? 0) - 1);
      if ((indegree.get(nextId) ?? 0) === 0) {
        queue.push(nextId);
      }
    }
  }

  if (visited.length === tasks.length) {
    return [];
  }

  return tasks
    .filter((task) => !visited.includes(task.id))
    .map((task) => task.id);
}

function buildTopologicalTaskOrder(
  tasks: TaskRecord[],
  dependencies: DependencyRecord[],
): TaskRecord[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const task of tasks) {
    adjacency.set(task.id, []);
    indegree.set(task.id, 0);
  }

  for (const dependency of dependencies) {
    if (!taskMap.has(dependency.predecessorId) || !taskMap.has(dependency.successorId)) {
      continue;
    }
    adjacency.get(dependency.predecessorId)?.push(dependency.successorId);
    indegree.set(
      dependency.successorId,
      (indegree.get(dependency.successorId) ?? 0) + 1,
    );
  }

  const queue = tasks
    .filter((task) => (indegree.get(task.id) ?? 0) === 0)
    .sort(sortByOrder);
  const result: TaskRecord[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const nextId of adjacency.get(current.id) ?? []) {
      indegree.set(nextId, (indegree.get(nextId) ?? 0) - 1);
      if ((indegree.get(nextId) ?? 0) === 0) {
        const nextTask = taskMap.get(nextId);
        if (nextTask) {
          queue.push(nextTask);
          queue.sort(sortByOrder);
        }
      }
    }
  }

  return result.length === tasks.length ? result : [...tasks].sort(sortByOrder);
}

function getDependencyConstraintDate(
  task: TaskRecord,
  predecessor: Pick<TaskRecord, "startDate" | "endDate">,
  dependency: Pick<DependencyRecord, "type" | "lagDays">,
): string {
  switch (dependency.type) {
    case "SS":
      return addWorkingDays(predecessor.startDate, dependency.lagDays);
    case "FF":
      return task.kind === "milestone"
        ? addWorkingDays(predecessor.endDate, dependency.lagDays)
        : deriveStartDate(
            addWorkingDays(predecessor.endDate, dependency.lagDays),
            task.durationDays,
          );
    case "SF":
      return task.kind === "milestone"
        ? addWorkingDays(predecessor.startDate, dependency.lagDays)
        : deriveStartDate(
            addWorkingDays(predecessor.startDate, dependency.lagDays),
            task.durationDays,
          );
    case "FS":
    default:
      return addWorkingDays(nextWorkingDay(predecessor.endDate), dependency.lagDays);
  }
}

export function formatDependencyToken(
  code: number,
  type: DependencyType,
  lagDays: number,
): string {
  const base = type === "FS" ? `${code}` : `${code}${type}`;
  if (lagDays === 0) {
    return base;
  }

  const lagToken = `${lagDays > 0 ? "+" : ""}${lagDays}d`;
  return `${base}${lagToken}`;
}

export interface ParsedDependencyToken {
  code: number;
  type: DependencyType;
  lagDays: number;
}

export function parseDependencyInput(value: string): ParsedDependencyToken[] {
  if (!value.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const normalized = token.toUpperCase().replace(/\s+/g, "");
      const match = DEPENDENCY_TOKEN_REGEX.exec(normalized);

      if (!match) {
        throw new Error(`Dependencia invalida: ${token}`);
      }

      const [, codeToken, typeToken, sign, lagToken] = match;
      const lagMagnitude = lagToken ? Number.parseInt(lagToken, 10) : 0;
      const lagDays = sign === "-" ? -lagMagnitude : lagMagnitude;

      return {
        code: Number.parseInt(codeToken, 10),
        type: (typeToken ?? "FS") as DependencyType,
        lagDays,
      };
    })
    .filter(
      (token, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.code === token.code &&
            candidate.type === token.type &&
            candidate.lagDays === token.lagDays,
        ) === index,
    );
}

function buildResolvedDependencyLinks(
  dependencies: DependencyRecord[],
  taskMap: Map<string, ResolvedTask>,
  direction: "predecessor" | "successor",
): ResolvedDependencyLink[] {
  return dependencies
    .map((dependency) => {
      const linkedTask = taskMap.get(
        direction === "predecessor"
          ? dependency.predecessorId
          : dependency.successorId,
      );
      if (!linkedTask) {
        return null;
      }

      return {
        dependencyId: dependency.id,
        taskId: linkedTask.id,
        code: linkedTask.code,
        type: dependency.type,
        lagDays: dependency.lagDays,
        label: formatDependencyToken(
          linkedTask.code,
          dependency.type,
          dependency.lagDays,
        ),
      } satisfies ResolvedDependencyLink;
    })
    .filter((value): value is ResolvedDependencyLink => value !== null)
    .sort((a, b) => a.code - b.code || a.label.localeCompare(b.label));
}

export function formatDependencyLinks(links: ResolvedDependencyLink[]): string {
  return links.map((link) => link.label).join(", ");
}

export function resolvePlannerProject(
  bundle: PlannerProjectBundle,
): ResolvedPlannerProject {
  const issues: ValidationIssue[] = [];
  const tasks = bundle.tasks.map((task) => ({ ...task })).sort(sortByOrder);
  const taskMap = new Map<string, TaskRecord>();
  const descendantMap = new Map<string, Set<string>>();

  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  for (const task of tasks) {
    if (task.parentId && !taskMap.has(task.parentId)) {
      issues.push({
        type: "warning",
        taskId: task.id,
        message: `A tarefa ${task.code} perdeu seu pai e foi movida para a raiz.`,
      });
      task.parentId = null;
    }
  }

  const normalizedChildrenMap = buildChildrenMap(tasks);
  for (const task of tasks) {
    descendantMap.set(task.id, collectDescendants(task.id, normalizedChildrenMap));
  }

  const cycles = detectDependencyCycles(tasks, bundle.dependencies);
  if (cycles.length > 0) {
    issues.push({
      type: "error",
      message:
        "Existem dependencias circulares. Revise as predecessoras antes de confiar no cronograma final.",
    });
  }

  const { incoming, outgoing } = createDependencyMaps(bundle.dependencies);
  const resolvedMap = new Map<string, ResolvedTask>();
  const normalizedMap = new Map<string, TaskRecord>();

  for (const task of tasks) {
    normalizedMap.set(task.id, normalizeLeafTask(task));
  }

  const topoTasks = buildTopologicalTaskOrder(tasks, bundle.dependencies);
  for (const task of topoTasks) {
    const hasChildren = (normalizedChildrenMap.get(task.id) ?? []).length > 0;
    const incomingDependencies = incoming.get(task.id) ?? [];
    const normalized = normalizedMap.get(task.id)!;
    let effectiveTask = { ...normalized };

    if (!hasChildren) {
      let earliestStart = effectiveTask.startDate;

      for (const dependency of incomingDependencies) {
        if (dependency.predecessorId === dependency.successorId) {
          issues.push({
            type: "error",
            taskId: task.id,
            message: `A tarefa ${task.code} nao pode depender dela mesma.`,
          });
          continue;
        }

        if (descendantMap.get(task.id)?.has(dependency.predecessorId)) {
          issues.push({
            type: "error",
            taskId: task.id,
            message:
              "Foi detectada uma dependencia entre pai e filho. O vinculo foi ignorado no calculo.",
          });
          continue;
        }

        const predecessor = resolvedMap.get(dependency.predecessorId);
        const predecessorFallback = normalizedMap.get(dependency.predecessorId);

        if (!predecessor && !predecessorFallback) {
          issues.push({
            type: "warning",
            taskId: task.id,
            message:
              "Uma predecessora referenciada nao existe mais. Revise as dependencias deste projeto.",
          });
          continue;
        }

        if (predecessor?.isSummary) {
          issues.push({
            type: "warning",
            taskId: task.id,
            message:
              "Dependencias com tarefas-resumo podem gerar ambiguidade. Prefira vincular tarefas filhas.",
          });
        }

        const dependencySource = predecessor ?? predecessorFallback!;
        const candidateStart = getDependencyConstraintDate(
          effectiveTask,
          dependencySource,
          dependency,
        );

        if (compareISODate(candidateStart, earliestStart) > 0) {
          earliestStart = candidateStart;
        }
      }

      if (effectiveTask.kind === "milestone") {
        const milestoneStart =
          compareISODate(earliestStart, effectiveTask.startDate) > 0
            ? earliestStart
            : effectiveTask.startDate;
        effectiveTask = {
          ...effectiveTask,
          startDate: milestoneStart,
          endDate: milestoneStart,
          durationDays: 0,
        };
      } else {
        const effectiveStart =
          compareISODate(earliestStart, effectiveTask.startDate) > 0
            ? earliestStart
            : effectiveTask.startDate;
        effectiveTask = {
          ...effectiveTask,
          startDate: effectiveStart,
          endDate: deriveEndDate(effectiveStart, effectiveTask.durationDays),
        };
      }
    }

    resolvedMap.set(task.id, {
      ...effectiveTask,
      computedKind: hasChildren ? "summary" : effectiveTask.kind,
      depth: 0,
      wbs: "",
      isSummary: hasChildren,
      predecessorLinks: [],
      successorLinks: [],
      predecessorIds: incomingDependencies.map((dependency) => dependency.predecessorId),
      successorIds: (outgoing.get(task.id) ?? []).map((dependency) => dependency.successorId),
      predecessorCodes: [],
      successorCodes: [],
      childrenIds: (normalizedChildrenMap.get(task.id) ?? []).map((child) => child.id),
    });
  }

  const roots = (normalizedChildrenMap.get(null) ?? []).sort(sortByOrder);
  const orderedResolvedTasks: ResolvedTask[] = [];

  function assignTree(task: TaskRecord, depth: number, prefix: string) {
    const resolved = resolvedMap.get(task.id)!;
    resolved.depth = depth;
    resolved.wbs = prefix;
    orderedResolvedTasks.push(resolved);

    const children = (normalizedChildrenMap.get(task.id) ?? []).sort(sortByOrder);

    for (const [index, child] of children.entries()) {
      assignTree(child, depth + 1, `${prefix}.${index + 1}`);
    }

    if (children.length > 0) {
      const childResolved = children.map((child) => resolvedMap.get(child.id)!);
      const validStarts = childResolved.map((child) => child.startDate);
      const validEnds = childResolved.map((child) => child.endDate);
      resolved.startDate = minISODate(validStarts);
      resolved.endDate = maxISODate(validEnds);
      resolved.durationDays = deriveDurationDays(resolved.startDate, resolved.endDate);
      resolved.progress = Math.round(
        childResolved.reduce((sum, child) => sum + child.progress, 0) /
          childResolved.length,
      );
    }
  }

  for (const [index, root] of roots.entries()) {
    assignTree(root, 0, `${index + 1}`);
  }

  for (const task of resolvedMap.values()) {
    task.predecessorLinks = buildResolvedDependencyLinks(
      incoming.get(task.id) ?? [],
      resolvedMap,
      "predecessor",
    );
    task.successorLinks = buildResolvedDependencyLinks(
      outgoing.get(task.id) ?? [],
      resolvedMap,
      "successor",
    );
    task.predecessorCodes = task.predecessorLinks.map((link) => link.code);
    task.successorCodes = task.successorLinks.map((link) => link.code);
  }

  return {
    ...bundle,
    resolvedTasks: orderedResolvedTasks,
    issues,
  };
}

export function collectSubtreeIds(taskId: string, tasks: TaskRecord[]): Set<string> {
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

export function buildDuplicateSubtree(
  rootId: string,
  allTasks: TaskRecord[],
  projectId: string,
  nextCode: number,
): TaskRecord[] {
  const timestamp = new Date().toISOString();
  const idMap = new Map<string, string>();

  const subtreeIds = collectSubtreeIds(rootId, allTasks);
  const subtree = allTasks.filter((t) => subtreeIds.has(t.id));

  for (const task of subtree) {
    idMap.set(task.id, crypto.randomUUID());
  }

  return subtree.map((task, i) => ({
    ...task,
    id: idMap.get(task.id)!,
    projectId,
    parentId: task.parentId ? (idMap.get(task.parentId) ?? null) : null,
    code: nextCode + i,
    name: task.id === rootId ? `${task.name} (cópia)` : task.name,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function parsePredecessorInput(value: string): number[] {
  return parseDependencyInput(value).map((token) => token.code);
}

export function formatPredecessorCodes(codes: number[]): string {
  return codes.join(", ");
}

export function buildTaskPatchFromDates(
  task: TaskRecord,
  startDate: string,
  endDate: string,
): TaskRecord {
  const normalizedStart = ensureWorkingDate(startDate);
  const normalizedEnd = ensureWorkingDate(endDate);

  if (task.kind === "milestone") {
    return {
      ...task,
      startDate: normalizedStart,
      endDate: normalizedStart,
      durationDays: 0,
    };
  }

  if (compareISODate(normalizedStart, normalizedEnd) > 0) {
    return {
      ...task,
      startDate: normalizedStart,
      endDate: deriveEndDate(normalizedStart, task.durationDays),
      durationDays: task.durationDays,
    };
  }

  return {
    ...task,
    startDate: normalizedStart,
    endDate: normalizedEnd,
    durationDays: deriveDurationDays(normalizedStart, normalizedEnd),
  };
}

export function buildTaskPatchFromDuration(
  task: TaskRecord,
  durationDays: number,
): TaskRecord {
  if (task.kind === "milestone") {
    return {
      ...task,
      durationDays: 0,
      endDate: task.startDate,
    };
  }

  const safeDuration = Math.max(durationDays, 1);
  return {
    ...task,
    durationDays: safeDuration,
    endDate: deriveEndDate(task.startDate, safeDuration),
  };
}

export function buildTaskPatchFromEndDate(
  task: TaskRecord,
  endDate: string,
): TaskRecord {
  const normalizedEnd = ensureWorkingDate(endDate);

  if (task.kind === "milestone") {
    return {
      ...task,
      startDate: normalizedEnd,
      endDate: normalizedEnd,
      durationDays: 0,
    };
  }

  if (compareISODate(task.startDate, normalizedEnd) > 0) {
    const startDate = deriveStartDate(normalizedEnd, task.durationDays);
    return {
      ...task,
      startDate,
      endDate: normalizedEnd,
      durationDays: deriveDurationDays(startDate, normalizedEnd),
    };
  }

  return {
    ...task,
    endDate: normalizedEnd,
    durationDays: deriveDurationDays(task.startDate, normalizedEnd),
  };
}

export function isTaskOverdue(task: Pick<ResolvedTask, "endDate" | "status" | "computedKind">): boolean {
  if (task.status === "done" || task.computedKind !== "task") return false;
  const today = new Date().toISOString().slice(0, 10);
  return task.endDate < today;
}

export function calculatePlannerStats(
  resolvedTasks: ResolvedTask[],
  dependencyCount: number,
): PlannerStats {
  const totalTasks = resolvedTasks.length;
  const summaryTasks = resolvedTasks.filter((task) => task.isSummary).length;
  const milestones = resolvedTasks.filter(
    (task) => task.computedKind === "milestone",
  ).length;
  const executableTasks = resolvedTasks.filter((task) => !task.isSummary);
  const completion = executableTasks.length
    ? Math.round(
        executableTasks.reduce((sum, task) => sum + task.progress, 0) /
          executableTasks.length,
      )
    : 0;

  return {
    totalTasks,
    summaryTasks,
    milestones,
    dependencies: dependencyCount,
    completion,
  };
}
