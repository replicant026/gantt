export type ISODate = string;
export type ISODateTime = string;
export type TaskKind = "task" | "milestone";
export type TaskStatus = "pending" | "in_progress" | "done" | "blocked";
export type TaskPriority = "none" | "low" | "medium" | "high";
export type ComputedTaskKind = TaskKind | "summary";
export type DependencyType = "FS" | "SS" | "FF" | "SF";
export type ChartViewMode = "Day" | "Week" | "Month";
export type GanttLabelPosition = "inside" | "right" | "left" | "hidden";
export type GanttLabelContent =
  | "name"
  | "code-name"
  | "name-progress"
  | "code-name-progress"
  | "wbs-name";
export type GanttFontFamily = "manrope" | "plex" | "georgia" | "system";

export interface GanttAppearanceSettings {
  barColor: string;
  progressColor: string;
  summaryColor: string;
  milestoneColor: string;
  dependencyColor: string;
  labelColor: string;
  showDependencies: boolean;
  showTodayHighlight: boolean;
  labelPosition: GanttLabelPosition;
  labelContent: GanttLabelContent;
  fontFamily: GanttFontFamily;
  barHeight: number;
  rowPadding: number;
}

export interface ResolvedDependencyLink {
  dependencyId: string;
  taskId: string;
  code: number;
  type: DependencyType;
  lagDays: number;
  label: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  accent: string;
  startDate: ISODate;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TaskRecord {
  id: string;
  projectId: string;
  code: number;
  parentId: string | null;
  order: number;
  name: string;
  kind: TaskKind;
  startDate: ISODate;
  endDate: ISODate;
  durationDays: number;
  progress: number;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  collapsed: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface DependencyRecord {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProjectViewRecord {
  projectId: string;
  chartViewMode: ChartViewMode;
  selectedTaskId: string | null;
  rightPanelOpen: boolean;
  updatedAt: ISODateTime;
}

export interface PlannerExportBundle {
  schemaVersion: number;
  exportedAt: ISODateTime;
  project: ProjectRecord;
  tasks: TaskRecord[];
  dependencies: DependencyRecord[];
  view: ProjectViewRecord | null;
}

export interface SnapshotRecord {
  id: string;
  projectId: string;
  label: string;
  createdAt: ISODateTime;
  bundle: PlannerExportBundle;
}

export interface ValidationIssue {
  type: "warning" | "error";
  taskId?: string;
  message: string;
}

export interface ResolvedTask extends TaskRecord {
  computedKind: ComputedTaskKind;
  depth: number;
  wbs: string;
  isSummary: boolean;
  predecessorLinks: ResolvedDependencyLink[];
  successorLinks: ResolvedDependencyLink[];
  predecessorIds: string[];
  successorIds: string[];
  predecessorCodes: number[];
  successorCodes: number[];
  childrenIds: string[];
}

export interface PlannerProjectBundle {
  project: ProjectRecord;
  tasks: TaskRecord[];
  dependencies: DependencyRecord[];
  view: ProjectViewRecord | null;
  snapshots: SnapshotRecord[];
}

export interface ResolvedPlannerProject extends PlannerProjectBundle {
  resolvedTasks: ResolvedTask[];
  issues: ValidationIssue[];
}

export interface PlannerStats {
  totalTasks: number;
  summaryTasks: number;
  milestones: number;
  dependencies: number;
  completion: number;
}
