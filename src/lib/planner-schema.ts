import { z } from "zod";

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  accent: z.string().min(1),
  startDate: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const taskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  code: z.number().int().nonnegative(),
  parentId: z.string().min(1).nullable(),
  order: z.number(),
  name: z.string().min(1),
  kind: z.enum(["task", "milestone"]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  durationDays: z.number().nonnegative(),
  progress: z.number().min(0).max(100),
  notes: z.string(),
  collapsed: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const dependencySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  predecessorId: z.string().min(1),
  successorId: z.string().min(1),
  type: z.enum(["FS", "SS", "FF", "SF"]),
  lagDays: z.number(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const viewSchema = z.object({
  projectId: z.string().min(1),
  chartViewMode: z.enum(["Day", "Week", "Month"]),
  selectedTaskId: z.string().nullable(),
  rightPanelOpen: z.boolean(),
  updatedAt: z.string().min(1),
});

export const plannerBundleSchema = z.object({
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string().min(1),
  project: projectSchema,
  tasks: z.array(taskSchema),
  dependencies: z.array(dependencySchema),
  view: viewSchema.nullable().optional(),
});
