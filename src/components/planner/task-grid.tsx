"use client";

import { forwardRef, useRef, useState } from "react";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  CornerUpLeft,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";

import { formatDependencyLinks } from "@/lib/planner-engine";
import type { ResolvedTask, TaskKind } from "@/types/planner";
import { NotesPopover } from "./notes-popover";

type TaskGridProps = {
  tasks: ResolvedTask[];
  selectedTaskId: string | null;
  rowHeight: number;
  headerOffset: number;
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

  return (
    <div ref={ref} className="planner-scrollbar h-full overflow-auto bg-white">
      <div
        className="border-b border-[var(--border)] bg-[#f5f7f3]"
        style={{ height: headerOffset }}
      />
      <table className="w-[1328px] border-collapse text-sm">
        <colgroup>
          <col style={{ width: 72 }} />
          <col style={{ width: 320 }} />
          <col style={{ width: 94 }} />
          <col style={{ width: 118 }} />
          <col style={{ width: 118 }} />
          <col style={{ width: 92 }} />
          <col style={{ width: 180 }} />
          <col style={{ width: 168 }} />
          <col style={{ width: 78 }} />
          <col style={{ width: 188 }} />
        </colgroup>
        <thead>
          <tr className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#f5f7f3] text-left text-[11px] uppercase tracking-[0.16em] text-[var(--muted-soft)]">
            <th className="w-6 py-2.5" />
            <th className="px-3 py-2.5 font-semibold">Tarefa</th>
            <th className="px-3 py-2.5 font-semibold">Tipo</th>
            <th className="px-3 py-2.5 font-semibold">Início</th>
            <th className="px-3 py-2.5 font-semibold">Fim</th>
            <th className="px-3 py-2.5 font-semibold">Duração</th>
            <th className="px-3 py-2.5 font-semibold">Predecessoras</th>
            <th className="px-3 py-2.5 font-semibold">Sucessoras</th>
            <th className="px-3 py-2.5 font-semibold">%</th>
            <th className="px-3 py-2.5 font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => {
            const selected = task.id === selectedTaskId;
            const rowTone = task.isSummary
              ? "bg-[#f4f8f4]"
              : selected
                ? "bg-[var(--accent-soft)]/70"
                : "bg-white";
            const predecessors = formatDependencyLinks(task.predecessorLinks);
            const successors = formatDependencyLinks(task.successorLinks);

            return (
              <tr
                key={`${task.id}-${task.updatedAt}`}
                className={`border-b border-[var(--border)] align-middle transition hover:bg-[var(--accent-soft)]/35 ${rowTone} ${dragOverIndex === index ? "ring-2 ring-inset ring-[var(--accent)]" : ""}`}
                onClick={() => onSelectTask(task.id)}
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
                <td className="w-6 cursor-grab px-1 align-middle text-[var(--muted-soft)] active:cursor-grabbing" style={cellStyle}>
                  <GripVertical className="h-4 w-4" />
                </td>
                <td className="px-3 align-middle" style={cellStyle}>
                  <div className="mono text-[11px] font-semibold text-[var(--muted-soft)]">
                    {task.wbs}
                  </div>
                  <div className="mono text-[11px] text-[var(--muted)]">#{task.code}</div>
                </td>
                <td className="px-3" style={cellStyle}>
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
                    <div className="min-w-[280px] flex-1">
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
                    </div>
                  </div>
                </td>
                <td className="px-3" style={cellStyle}>
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
                <td className="px-3" style={cellStyle}>
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
                <td className="px-3" style={cellStyle}>
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
                <td className="px-3" style={cellStyle}>
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
                <td className="px-3" style={cellStyle}>
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
                <td className="px-3" style={cellStyle}>
                  <div className="mono rounded-md px-2.5 py-2 text-sm text-[var(--foreground)]">
                    {successors || "—"}
                  </div>
                </td>
                <td className="px-3" style={cellStyle}>
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
                <td className="px-3 align-middle" style={cellStyle}>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  },
);
