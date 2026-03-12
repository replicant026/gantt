import { describe, expect, it } from "vitest";

import {
  buildDuplicateSubtree,
  computeCriticalPath,
  collectSubtreeIds,
  formatDependencyLinks,
  isTaskOverdue,
  parseDependencyInput,
  resolvePlannerProject,
} from "@/lib/planner-engine";
import { MAX_SNAPSHOTS } from "@/lib/planner-db";
import type {
  DependencyRecord,
  PlannerProjectBundle,
  ProjectRecord,
  TaskRecord,
} from "@/types/planner";

function createProject(): ProjectRecord {
  return {
    id: "project-1",
    name: "Projeto teste",
    description: "",
    accent: "#1f6b52",
    startDate: "2026-03-02",
    createdAt: "2026-03-02T12:00:00.000Z",
    updatedAt: "2026-03-02T12:00:00.000Z",
  };
}

function createTask(partial: Partial<TaskRecord> & Pick<TaskRecord, "id" | "code" | "order" | "name">): TaskRecord {
  return {
    id: partial.id,
    projectId: "project-1",
    code: partial.code,
    parentId: partial.parentId ?? null,
    order: partial.order,
    name: partial.name,
    kind: partial.kind ?? "task",
    startDate: partial.startDate ?? "2026-03-02",
    endDate: partial.endDate ?? "2026-03-02",
    durationDays: partial.durationDays ?? 1,
    progress: partial.progress ?? 0,
    notes: partial.notes ?? "",
    status: partial.status ?? "pending",
    priority: partial.priority ?? "none",
    assignee: partial.assignee ?? "",
    collapsed: partial.collapsed ?? false,
    createdAt: "2026-03-02T12:00:00.000Z",
    updatedAt: "2026-03-02T12:00:00.000Z",
  };
}

function createBundle(tasks: TaskRecord[], dependencies: DependencyRecord[] = []): PlannerProjectBundle {
  return {
    project: createProject(),
    tasks,
    dependencies,
    view: null,
    snapshots: [],
  };
}

describe("resolvePlannerProject", () => {
  it("moves a successor after its predecessor for FS dependencies", () => {
    const discovery = createTask({
      id: "t1",
      code: 1,
      order: 10,
      name: "Descoberta",
      startDate: "2026-03-02",
      endDate: "2026-03-03",
      durationDays: 2,
    });
    const build = createTask({
      id: "t2",
      code: 2,
      order: 20,
      name: "Build",
      startDate: "2026-03-03",
      endDate: "2026-03-04",
      durationDays: 2,
    });

    const dependencies: DependencyRecord[] = [
      {
        id: "dep-1",
        projectId: "project-1",
        predecessorId: discovery.id,
        successorId: build.id,
        type: "FS",
        lagDays: 0,
        createdAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:00.000Z",
      },
    ];

    const resolved = resolvePlannerProject(createBundle([discovery, build], dependencies));
    const successor = resolved.resolvedTasks.find((task) => task.id === build.id);

    expect(successor?.startDate).toBe("2026-03-04");
    expect(successor?.endDate).toBe("2026-03-05");
  });

  it("derives summary dates from child tasks", () => {
    const summary = createTask({
      id: "summary",
      code: 1,
      order: 10,
      name: "Fase 1",
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      durationDays: 1,
    });
    const childA = createTask({
      id: "child-a",
      code: 2,
      order: 20,
      name: "Arquitetura",
      parentId: summary.id,
      startDate: "2026-03-02",
      endDate: "2026-03-03",
      durationDays: 2,
    });
    const childB = createTask({
      id: "child-b",
      code: 3,
      order: 30,
      name: "Entrega",
      parentId: summary.id,
      startDate: "2026-03-04",
      endDate: "2026-03-06",
      durationDays: 3,
    });

    const resolved = resolvePlannerProject(createBundle([summary, childA, childB]));
    const resolvedSummary = resolved.resolvedTasks.find((task) => task.id === summary.id);

    expect(resolvedSummary?.computedKind).toBe("summary");
    expect(resolvedSummary?.startDate).toBe("2026-03-02");
    expect(resolvedSummary?.endDate).toBe("2026-03-06");
    expect(resolvedSummary?.durationDays).toBe(5);
  });

  it("surfaces a validation issue when the dependency graph contains a cycle", () => {
    const a = createTask({ id: "a", code: 1, order: 10, name: "A" });
    const b = createTask({ id: "b", code: 2, order: 20, name: "B" });

    const dependencies: DependencyRecord[] = [
      {
        id: "dep-a",
        projectId: "project-1",
        predecessorId: a.id,
        successorId: b.id,
        type: "FS",
        lagDays: 0,
        createdAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:00.000Z",
      },
      {
        id: "dep-b",
        projectId: "project-1",
        predecessorId: b.id,
        successorId: a.id,
        type: "FS",
        lagDays: 0,
        createdAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:00.000Z",
      },
    ];

    const resolved = resolvePlannerProject(createBundle([a, b], dependencies));

    expect(resolved.issues.some((issue) => issue.type === "error")).toBe(true);
  });

  it("supports SS, FF and SF relationships with lag", () => {
    const kickoff = createTask({
      id: "kickoff",
      code: 1,
      order: 10,
      name: "Kickoff",
      startDate: "2026-03-02",
      endDate: "2026-03-04",
      durationDays: 3,
    });
    const ssTask = createTask({
      id: "ss-task",
      code: 2,
      order: 20,
      name: "Paralelo",
      startDate: "2026-03-02",
      endDate: "2026-03-03",
      durationDays: 2,
    });
    const ffTask = createTask({
      id: "ff-task",
      code: 3,
      order: 30,
      name: "Fechamento",
      startDate: "2026-03-02",
      endDate: "2026-03-03",
      durationDays: 2,
    });
    const sfTask = createTask({
      id: "sf-task",
      code: 4,
      order: 40,
      name: "Transição",
      startDate: "2026-03-02",
      endDate: "2026-03-03",
      durationDays: 2,
    });

    const dependencies: DependencyRecord[] = [
      {
        id: "dep-ss",
        projectId: "project-1",
        predecessorId: kickoff.id,
        successorId: ssTask.id,
        type: "SS",
        lagDays: 1,
        createdAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:00.000Z",
      },
      {
        id: "dep-ff",
        projectId: "project-1",
        predecessorId: kickoff.id,
        successorId: ffTask.id,
        type: "FF",
        lagDays: 1,
        createdAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:00.000Z",
      },
      {
        id: "dep-sf",
        projectId: "project-1",
        predecessorId: kickoff.id,
        successorId: sfTask.id,
        type: "SF",
        lagDays: 1,
        createdAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:00.000Z",
      },
    ];

    const resolved = resolvePlannerProject(
      createBundle([kickoff, ssTask, ffTask, sfTask], dependencies),
    );

    expect(resolved.resolvedTasks.find((task) => task.id === ssTask.id)?.startDate).toBe(
      "2026-03-03",
    );
    expect(resolved.resolvedTasks.find((task) => task.id === ffTask.id)?.endDate).toBe(
      "2026-03-05",
    );
    expect(resolved.resolvedTasks.find((task) => task.id === sfTask.id)?.endDate).toBe(
      "2026-03-03",
    );
  });

  it("parses and formats dependency tokens with type and lag", () => {
    const tokens = parseDependencyInput("12, 15SS, 18FF+2d, 20SF-1d");

    expect(tokens).toEqual([
      { code: 12, type: "FS", lagDays: 0 },
      { code: 15, type: "SS", lagDays: 0 },
      { code: 18, type: "FF", lagDays: 2 },
      { code: 20, type: "SF", lagDays: -1 },
    ]);

    expect(
      formatDependencyLinks([
        {
          dependencyId: "a",
          taskId: "t-12",
          code: 12,
          type: "FS",
          lagDays: 0,
          label: "12",
        },
        {
          dependencyId: "b",
          taskId: "t-18",
          code: 18,
          type: "FF",
          lagDays: 2,
          label: "18FF+2d",
        },
      ]),
    ).toBe("12, 18FF+2d");
  });
});

it("MAX_SNAPSHOTS é 20", () => {
  expect(MAX_SNAPSHOTS).toBe(20);
});

describe("collectSubtreeIds", () => {
  it("retorna apenas o próprio id sem filhos", () => {
    const tasks = [createTask({ id: "a", code: 1, order: 10, name: "A" })];
    const ids = collectSubtreeIds("a", tasks);
    expect(ids.size).toBe(1);
    expect(ids.has("a")).toBe(true);
  });

  it("inclui filhos e netos recursivamente", () => {
    const tasks = [
      createTask({ id: "p", code: 1, order: 10, name: "Pai" }),
      createTask({ id: "c", code: 2, order: 20, name: "Filho", parentId: "p" }),
      createTask({ id: "g", code: 3, order: 30, name: "Neto", parentId: "c" }),
    ];
    const ids = collectSubtreeIds("p", tasks);
    expect(ids.size).toBe(3);
  });
});

describe("buildDuplicateSubtree", () => {
  it("cria cópias com novos IDs mantendo hierarquia", () => {
    const tasks = [
      createTask({ id: "p", code: 1, order: 10, name: "Pai" }),
      createTask({ id: "c", code: 2, order: 20, name: "Filho", parentId: "p" }),
    ];
    const result = buildDuplicateSubtree("p", tasks, "project-1", 10);
    expect(result.length).toBe(2);
    const newParent = result.find((t) => t.name === "Pai (cópia)")!;
    const newChild = result.find((t) => t.name === "Filho")!;
    expect(newParent).toBeDefined();
    expect(newChild.parentId).toBe(newParent.id);
    expect(newParent.id).not.toBe("p");
    expect(newChild.id).not.toBe("c");
  });

  it("tarefa sem filhos gera apenas uma cópia", () => {
    const tasks = [createTask({ id: "a", code: 1, order: 10, name: "Solo" })];
    const result = buildDuplicateSubtree("a", tasks, "project-1", 5);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Solo (cópia)");
    expect(result[0].code).toBe(5);
  });
});

describe("isTaskOverdue", () => {
  it("retorna false para tarefa concluída mesmo vencida", () => {
    expect(isTaskOverdue({ endDate: "2020-01-01", status: "done", computedKind: "task" })).toBe(false);
  });
  it("retorna false para milestone", () => {
    expect(isTaskOverdue({ endDate: "2020-01-01", status: "pending", computedKind: "milestone" })).toBe(false);
  });
  it("retorna true para task pendente com endDate no passado", () => {
    expect(isTaskOverdue({ endDate: "2020-01-01", status: "pending", computedKind: "task" })).toBe(true);
  });
  it("retorna false para task com endDate futuro", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const iso = future.toISOString().slice(0, 10);
    expect(isTaskOverdue({ endDate: iso, status: "pending", computedKind: "task" })).toBe(false);
  });
});

describe("computeCriticalPath", () => {
  it("identifica a sequência mais longa como crítica", () => {
    const tasks = [
      createTask({
        id: "A",
        code: 1,
        order: 10,
        name: "A",
        startDate: "2026-03-01",
        endDate: "2026-03-05",
        durationDays: 5,
      }),
      createTask({
        id: "B",
        code: 2,
        order: 20,
        name: "B",
        startDate: "2026-03-06",
        endDate: "2026-03-10",
        durationDays: 5,
      }),
      createTask({
        id: "C",
        code: 3,
        order: 30,
        name: "C",
        startDate: "2026-03-01",
        endDate: "2026-03-03",
        durationDays: 3,
      }),
    ];
    const deps: DependencyRecord[] = [
      {
        id: "d1",
        projectId: "project-1",
        predecessorId: "A",
        successorId: "B",
        type: "FS",
        lagDays: 0,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    ];

    const critical = computeCriticalPath(tasks, deps);
    expect(critical.has("A")).toBe(true);
    expect(critical.has("B")).toBe(true);
    expect(critical.has("C")).toBe(false);
  });

  it("retorna conjunto vazio sem dependências", () => {
    const tasks = [createTask({ id: "A", code: 1, order: 10, name: "A" })];
    const critical = computeCriticalPath(tasks, []);
    expect(critical.size).toBe(0);
  });
});
