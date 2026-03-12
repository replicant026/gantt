"use client";

import { forwardRef, useRef, useState } from "react";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  CornerDownRight,
  CornerUpLeft,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";

import { formatDependencyLinks, isTaskOverdue } from "@/lib/planner-engine";
import type { ResolvedTask, TaskKind, TaskStatus, TaskPriority } from "@/types/planner";
import type { ColumnDef } from "@/lib/column-config";
import { NotesPopover } from "./notes-popover";

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: "pending",     label: "Pendente",      color: "text-slate-600 bg-slate-50" },
  { value: "in_progress", label: "Em andamento",  color: "text-blue-700 bg-blue-50" },
  { value: "done",        label: "Concluída",     color: "text-emerald-700 bg-emerald-50" },
  { value: "blocked",     label: "Bloqueada",     color: "text-rose-700 bg-rose-50" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: "none",   label: "—",      color: "text-[var(--muted-soft)]" },
  { value: "low",    label: "Baixa",  color: "text-slate-600" },
  { value: "medium", label: "Média",  color: "text-amber-700" },
  { value: "high",   label: "Alta",   color: "text-rose-700 font-semibold" },
];

type TaskGridProps = {
  tasks: ResolvedTask[];
  selectedTaskId: string | null;
  rowHeight: number;
  headerOffset: number;
  columns: ColumnDef[];
  onSelectTask: (taskId: string) => void;
  onCommitName: (taskId: string, name: string) => void;
  onCommitStartDate: (taskId: string, startDate: string) => void;
  onCommitEndDate: (taskId: string, endDate: string) => void;
  onCommitDuration: (taskId: string, duration: number) => void;
  onCommitProgress: (taskId: string, progress: number) => void;
  onCommitKind: (taskId: string, kind: TaskKind) => void;
  onCommitPredecessors: (taskId: string, predecessors: string) => void;
  onToggleCollapse: (taskId: string) => void;
  onIndent: (taskId: string) => void;
  onOutdent: (taskId: string) => void;
  onMoveUp: (taskId: string) => void;
  onMoveDown: (taskId: string) => void;
  onAddBelow: (taskId: string) => void;
  onCommitNotes: (taskId: string, notes: string) => void;
  onDelete: (taskId: string) => void;
  onReorder: (taskId: string, targetIndex: number) => void;
  onCommitStatus: (taskId: string, status: TaskStatus) => void;
  onCommitPriority: (taskId: string, priority: TaskPriority) => void;
  onCommitAssignee: (taskId: string, assignee: string) => void;
  onAddAtEnd: () => void;
  onDuplicate: (taskId: string) => void;
  selectedTaskIds: Set<string>;
  onToggleSelect: (taskId: string, multi: boolean) => void;
};

function commitOnEnter(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  if (event.key === "Enter") {
    event.currentTarget.blur();
  }
  if (event.key === "Escape") {
    event.currentTarget.blur();
  }
}

export const TaskGrid = forwardRef<HTMLDivElement, TaskGridProps>(
  function TaskGrid({
    tasks,
    selectedTaskId,
    rowHeight,
    headerOffset,
    columns,
    onSelectTask,
    onCommitDuration,
    onCommitEndDate,
    onCommitKind,
    onCommitName,
    onCommitPredecessors,
    onCommitProgress,
    onCommitStartDate,
    onAddBelow,
    onCommitNotes,
    onDelete,
    onIndent,
    onMoveDown,
    onMoveUp,
    onOutdent,
    onToggleCollapse,
    onReorder,
    onCommitStatus,
    onCommitPriority,
    onCommitAssignee,
    onAddAtEnd,
    onDuplicate,
    selectedTaskIds,
    onToggleSelect,
  }, ref) {
  const draggedIdRef = useRef<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const cellPaddingY = 3;
  const controlHeight = Math.max(28, rowHeight - cellPaddingY * 2);
  const cellStyle = {
    height: rowHeight,
    maxHeight: rowHeight,
    paddingTop: cellPaddingY,
    paddingBottom: cellPaddingY,
    overflow: "hidden" as const,
    boxSizing: "border-box" as const,
  } satisfies React.CSSProperties;

  const visibleColumns = columns.filter((c) => c.visible);
  const totalWidth = visibleColumns.reduce((sum, c) => sum + c.width, 0);

  return (
    <div ref={ref} className="planner-scrollbar h-full overflow-auto bg-white">
      <div
        className="border-b border-[var(--border)] bg-[#f5f7f3]"
        style={{ height: headerOffset }}
      />
      <table className="border-collapse text-sm" style={{ width: totalWidth }}>
        <colgroup>
          {visibleColumns.map((col) => (
            <col key={col.id} style={{ width: col.width }} />
          ))}
        </colgroup>
        <thead>
          <tr className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#f5f7f3] text-left text-[11px] uppercase tracking-[0.16em] text-[var(--muted-soft)]">
            {visibleColumns.map((col) => (
              <th key={col.id} className={`py-2.5 font-semibold ${col.id === "wbs" ? "" : "px-3"}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => {
            const selected = task.id === selectedTaskId;
            const overdue = isTaskOverdue(task);
            const multiSelected = selectedTaskIds.has(task.id) && selectedTaskIds.size > 1;
            const rowTone = task.isSummary
              ? "bg-[#f4f8f4]"
              : multiSelected
                ? "bg-[var(--accent-soft)]"
                : selected
                  ? "bg-[var(--accent-soft)]/70"
                  : overdue
                    ? "bg-rose-50"
                    : "bg-white";
            const predecessors = formatDependencyLinks(task.predecessorLinks);
            const successors = formatDependencyLinks(task.successorLinks);

            function renderCell(col: ColumnDef): React.ReactNode {
              if (!col.visible) return null;
              switch (col.id) {
                case "wbs":
                  return (
                    <td key="wbs" className="cursor-grab px-1 align-middle text-[var(--muted-soft)] active:cursor-grabbing" style={cellStyle}>
                      <div className="flex flex-col items-start">
                        <GripVertical className="h-4 w-4" />
                        <div className="mono text-[10px] font-semibold leading-none text-[var(--muted-soft)]">{task.wbs}</div>
                        <div className="mono text-[10px] leading-none text-[var(--muted)]">#{task.code}</div>
                      </div>
                    </td>
                  );
                case "name":
                  return (
                    <td key="name" className="px-3" style={cellStyle}>
                      <div className="flex items-center gap-2" style={{ paddingLeft: `${task.depth * 14}px` }}>
                        {task.isSummary ? (
                          <button
                            aria-label={task.collapsed ? "Expandir resumo" : "Recolher resumo"}
                            className="rounded-sm p-1 text-[var(--muted)] transition hover:bg-[#eef2ec]"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleCollapse(task.id);
                            }}
                            title={task.collapsed ? "Expandir resumo" : "Recolher resumo"}
                            type="button"
                          >
                            {task.collapsed ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <div className="h-2.5 w-2.5 rounded-full border border-[var(--border-strong)] bg-white" />
                        )}
                        <div className="min-w-[280px] flex-1 flex items-center">
                          <input
                            className={`w-full rounded-md border px-2.5 text-sm font-medium text-[var(--foreground)] outline-none transition ${
                              task.isSummary
                                ? "border-transparent bg-transparent"
                                : "border-transparent bg-transparent focus:border-[var(--accent)] focus:bg-white"
                            }`}
                            defaultValue={task.name}
                            style={{ height: controlHeight }}
                            onBlur={(event) => {
                              const nextName = event.target.value.trim();
                              if (nextName.length > 0) {
                                onCommitName(task.id, nextName);
                              }
                            }}
                            onKeyDown={commitOnEnter}
                          />
                          {isTaskOverdue(task) && (
                            <CircleAlert className="ml-1 inline h-3 w-3 flex-shrink-0 text-rose-500" title="Tarefa atrasada" />
                          )}
                        </div>
                      </div>
                    </td>
                  );
                case "kind":
                  return (
                    <td key="kind" className="px-3" style={cellStyle}>
                      {task.isSummary ? (
                        <div className="rounded-md bg-[#eef3ee] px-2.5 py-2 text-sm font-semibold text-[var(--accent)]">
                          resumo
                        </div>
                      ) : (
                        <select
                          className="w-full rounded-md border border-transparent bg-transparent px-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:bg-white"
                          defaultValue={task.computedKind === "milestone" ? "milestone" : "task"}
                          style={{ height: controlHeight }}
                          onBlur={(event) => onCommitKind(task.id, event.target.value as TaskKind)}
                          onKeyDown={commitOnEnter}
                        >
                          <option value="task">tarefa</option>
                          <option value="milestone">marco</option>
                        </select>
                      )}
                    </td>
                  );
                case "start-date":
                  return (
                    <td key="start-date" className="px-3" style={cellStyle}>
                      {task.isSummary ? (
                        <div className="rounded-md px-2.5 py-2 text-sm font-semibold text-[var(--foreground)]">
                          {task.startDate}
                        </div>
                      ) : (
                        <input
                          className="w-full rounded-md border border-transparent bg-transparent px-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:bg-white"
                          defaultValue={task.startDate}
                          style={{ height: controlHeight }}
                          onBlur={(event) => {
                            if (event.target.value) {
                              onCommitStartDate(task.id, event.target.value);
                            }
                          }}
                          onKeyDown={commitOnEnter}
                          type="date"
                        />
                      )}
                    </td>
                  );
                case "end-date":
                  return (
                    <td key="end-date" className="px-3" style={cellStyle}>
                      {task.isSummary ? (
                        <div className="rounded-md px-2.5 py-2 text-sm font-semibold text-[var(--foreground)]">
                          {task.endDate}
                        </div>
                      ) : (
                        <input
                          className="w-full rounded-md border border-transparent bg-transparent px-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:bg-white"
                          defaultValue={task.endDate}
                          style={{ height: controlHeight }}
                          onBlur={(event) => {
                            if (event.target.value) {
                              onCommitEndDate(task.id, event.target.value);
                            }
                          }}
                          onKeyDown={commitOnEnter}
                          type="date"
                        />
                      )}
                    </td>
                  );
                case "duration":
                  return (
                    <td key="duration" className="px-3" style={cellStyle}>
                      {task.isSummary ? (
                        <div className="rounded-md px-2.5 py-2 text-sm font-semibold text-[var(--foreground)]">
                          auto
                        </div>
                      ) : task.computedKind === "milestone" ? (
                        <div className="rounded-md px-2.5 py-2 text-sm text-[var(--muted)]">—</div>
                      ) : (
                        <input
                          className="w-full rounded-md border border-transparent bg-transparent px-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:bg-white"
                          defaultValue={task.durationDays}
                          style={{ height: controlHeight }}
                          min={1}
                          onBlur={(event) => {
                            onCommitDuration(task.id, Number(event.target.value || 1));
                          }}
                          onKeyDown={commitOnEnter}
                          type="number"
                        />
                      )}
                    </td>
                  );
                case "predecessors":
                  return (
                    <td key="predecessors" className="px-3" style={cellStyle}>
                      {task.isSummary ? (
                        <div className="rounded-md px-2.5 py-2 text-sm text-[var(--muted)]">—</div>
                      ) : (
                        <input
                          className="mono w-full rounded-md border border-transparent bg-transparent px-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:bg-white"
                          defaultValue={predecessors}
                          style={{ height: controlHeight }}
                          onBlur={(event) => onCommitPredecessors(task.id, event.target.value)}
                          onKeyDown={commitOnEnter}
                          placeholder="12, 15SS, 18FF+2d"
                        />
                      )}
                    </td>
                  );
                case "successors":
                  return (
                    <td key="successors" className="px-3" style={cellStyle}>
                      <div className="mono rounded-md px-2.5 py-2 text-sm text-[var(--foreground)]">
                        {successors || "—"}
                      </div>
                    </td>
                  );
                case "progress":
                  return (
                    <td key="progress" className="px-3" style={cellStyle}>
                      {task.isSummary ? (
                        <div className="rounded-md px-2.5 py-2 text-sm font-semibold text-[var(--foreground)]">
                          {task.progress}%
                        </div>
                      ) : (
                        <input
                          className="w-16 rounded-md border border-transparent bg-transparent px-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:bg-white"
                          defaultValue={task.progress}
                          style={{ height: controlHeight }}
                          max={100}
                          min={0}
                          onBlur={(event) => {
                            onCommitProgress(task.id, Number(event.target.value || 0));
                          }}
                          onKeyDown={commitOnEnter}
                          type="number"
                        />
                      )}
                    </td>
                  );
                case "status":
                  return (
                    <td key="status" className="px-2 align-middle" style={cellStyle}>
                      <select
                        className={`w-full cursor-pointer rounded px-1 text-xs font-medium outline-none ${
                          STATUS_OPTIONS.find((o) => o.value === (task.status ?? "pending"))?.color ?? ""
                        }`}
                        style={{ height: controlHeight, border: "none" }}
                        value={task.status ?? "pending"}
                        onChange={(e) => onCommitStatus(task.id, e.target.value as TaskStatus)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                  );
                case "priority":
                  return (
                    <td key="priority" className="px-2 align-middle" style={cellStyle}>
                      <select
                        className={`w-full cursor-pointer rounded px-1 text-xs outline-none ${
                          PRIORITY_OPTIONS.find((o) => o.value === (task.priority ?? "none"))?.color ?? ""
                        }`}
                        style={{ height: controlHeight, border: "none" }}
                        value={task.priority ?? "none"}
                        onChange={(e) => onCommitPriority(task.id, e.target.value as TaskPriority)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {PRIORITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                  );
                case "assignee":
                  return (
                    <td key="assignee" className="px-3 align-middle" style={cellStyle}>
                      <input
                        className="w-full rounded border border-transparent bg-transparent px-1 text-sm text-[var(--foreground)] transition focus:border-[var(--border)] focus:bg-white focus:outline-none"
                        defaultValue={task.assignee ?? ""}
                        key={`${task.id}-assignee-${task.assignee}`}
                        placeholder="—"
                        style={{ height: controlHeight }}
                        onBlur={(e) => onCommitAssignee(task.id, e.target.value.trim())}
                        onKeyDown={commitOnEnter}
                        onClick={(e) => e.stopPropagation()}
                        type="text"
                      />
                    </td>
                  );
                case "actions":
                  return (
                    <td key="actions" className="px-3 align-middle" style={cellStyle}>
                      <div className="flex flex-wrap gap-1" style={{ maxHeight: rowHeight - cellPaddingY * 2, overflow: "hidden" }}>
                        <button
                          aria-label="Mover tarefa para cima"
                          className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-[#f4f6f2]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onMoveUp(task.id);
                          }}
                          title="Mover tarefa para cima"
                          type="button"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Mover tarefa para baixo"
                          className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-[#f4f6f2]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onMoveDown(task.id);
                          }}
                          title="Mover tarefa para baixo"
                          type="button"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Indentar tarefa"
                          className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-[#f4f6f2]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onIndent(task.id);
                          }}
                          title="Indentar tarefa"
                          type="button"
                        >
                          <CornerDownRight className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Desindentar tarefa"
                          className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-[#f4f6f2]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOutdent(task.id);
                          }}
                          title="Desindentar tarefa"
                          type="button"
                        >
                          <CornerUpLeft className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Inserir nova tarefa abaixo"
                          className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-[#f4f6f2]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onAddBelow(task.id);
                          }}
                          title="Inserir nova tarefa abaixo"
                          type="button"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Duplicar tarefa"
                          className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-[#f4f6f2]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDuplicate(task.id);
                          }}
                          title="Duplicar tarefa"
                          type="button"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <NotesPopover
                          taskId={task.id}
                          taskName={task.name}
                          notes={task.notes}
                          onCommit={onCommitNotes}
                        />
                        <button
                          aria-label="Excluir tarefa"
                          className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(task.id);
                          }}
                          title="Excluir tarefa"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  );
                default:
                  return null;
              }
            }

            return (
              <tr
                key={`${task.id}-${task.updatedAt}`}
                className={`border-b border-[var(--border)] align-middle transition hover:bg-[var(--accent-soft)]/35 ${rowTone} ${dragOverIndex === index ? "ring-2 ring-inset ring-[var(--accent)]" : ""}`}
                onClick={(e) => {
                  onToggleSelect(task.id, e.ctrlKey || e.metaKey);
                  if (!e.ctrlKey && !e.metaKey) {
                    onSelectTask(task.id);
                  }
                }}
                style={{ height: rowHeight, maxHeight: rowHeight, overflow: "hidden" }}
                draggable
                onDragStart={(e) => {
                  draggedIdRef.current = task.id;
                  e.dataTransfer.effectAllowed = "move";
                  if (e.currentTarget instanceof HTMLElement) {
                    e.currentTarget.style.opacity = "0.5";
                  }
                }}
                onDragEnd={(e) => {
                  draggedIdRef.current = null;
                  setDragOverIndex(null);
                  if (e.currentTarget instanceof HTMLElement) {
                    e.currentTarget.style.opacity = "1";
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverIndex(index);
                }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverIndex(null);
                  if (draggedIdRef.current && draggedIdRef.current !== task.id) {
                    onReorder(draggedIdRef.current, index);
                  }
                  draggedIdRef.current = null;
                }}
              >
                {visibleColumns.map((col) => renderCell(col))}
              </tr>
            );
          })}
          <tr
            className="cursor-pointer border-b border-[var(--border)] bg-white transition hover:bg-[var(--accent-soft)]/20"
            style={{ height: rowHeight }}
            onClick={onAddAtEnd}
            title="Clique para adicionar nova tarefa"
          >
            <td
              colSpan={columns.filter((c) => c.visible).length}
              className="px-4 align-middle"
            >
              <div className="flex items-center gap-2 text-sm text-[var(--muted-soft)]">
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar tarefa...</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  },
);
