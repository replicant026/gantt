"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  CornerUpLeft,
  Plus,
  Trash2,
} from "lucide-react";

import { formatDependencyLinks } from "@/lib/planner-engine";
import type { ResolvedTask, TaskKind } from "@/types/planner";

type TaskGridProps = {
  tasks: ResolvedTask[];
  selectedTaskId: string | null;
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
  onDelete: (taskId: string) => void;
};

function commitOnEnter(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  if (event.key === "Enter") {
    event.currentTarget.blur();
  }
  if (event.key === "Escape") {
    event.currentTarget.blur();
  }
}

export function TaskGrid({
  tasks,
  selectedTaskId,
  onSelectTask,
  onCommitDuration,
  onCommitEndDate,
  onCommitKind,
  onCommitName,
  onCommitPredecessors,
  onCommitProgress,
  onCommitStartDate,
  onAddBelow,
  onDelete,
  onIndent,
  onMoveDown,
  onMoveUp,
  onOutdent,
  onToggleCollapse,
}: TaskGridProps) {
  return (
    <div className="planner-scrollbar overflow-auto rounded-[28px] border border-[var(--border)] bg-white">
      <table className="min-w-[1180px] w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-left text-[11px] uppercase tracking-[0.22em] text-[var(--muted-soft)]">
            <th className="px-4 py-3 font-semibold">WBS</th>
            <th className="px-4 py-3 font-semibold">Tarefa</th>
            <th className="px-4 py-3 font-semibold">Tipo</th>
            <th className="px-4 py-3 font-semibold">Início</th>
            <th className="px-4 py-3 font-semibold">Fim</th>
            <th className="px-4 py-3 font-semibold">Duração</th>
            <th className="px-4 py-3 font-semibold">Dependências</th>
            <th className="px-4 py-3 font-semibold">Sucessões</th>
            <th className="px-4 py-3 font-semibold">%</th>
            <th className="px-4 py-3 font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
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
                className={`border-b border-[var(--border)] align-top transition hover:bg-[var(--accent-soft)]/40 ${rowTone}`}
                onClick={() => onSelectTask(task.id)}
              >
                <td className="px-4 py-3 align-middle">
                  <div className="mono text-xs font-semibold text-[var(--muted-soft)]">
                    {task.wbs}
                  </div>
                  <div className="mono mt-1 text-[11px] text-[var(--muted)]">#{task.code}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-2" style={{ paddingLeft: `${task.depth * 18}px` }}>
                    {task.isSummary ? (
                      <button
                        aria-label={task.collapsed ? "Expandir resumo" : "Recolher resumo"}
                        className="mt-2 rounded-full p-1 text-[var(--muted)] transition hover:bg-white"
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
                      <div className="mt-2 h-4 w-4 rounded-full border border-[var(--border)] bg-[var(--surface)]" />
                    )}
                    <div className="min-w-[260px] flex-1">
                      <input
                        className={`w-full rounded-2xl border px-3 py-2.5 text-sm font-medium text-[var(--foreground)] outline-none transition ${
                          task.isSummary
                            ? "border-transparent bg-white/60"
                            : "border-[var(--border)] bg-white focus:border-[var(--accent)]"
                        }`}
                        defaultValue={task.name}
                        onBlur={(event) => {
                          const nextName = event.target.value.trim();
                          if (nextName.length > 0) {
                            onCommitName(task.id, nextName);
                          }
                        }}
                        onKeyDown={commitOnEnter}
                      />
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        {task.isSummary
                          ? "Linha-resumo calculada a partir das subtarefas."
                          : task.computedKind === "milestone"
                            ? "Marco de entrega com duração zero."
                            : "Tarefa executável com edição direta na grade."}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {task.isSummary ? (
                    <div className="rounded-2xl bg-white/70 px-3 py-2 text-sm font-semibold text-[var(--accent)]">
                      resumo
                    </div>
                  ) : (
                    <select
                      className="w-full rounded-2xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      defaultValue={task.computedKind === "milestone" ? "milestone" : "task"}
                      onBlur={(event) => onCommitKind(task.id, event.target.value as TaskKind)}
                      onKeyDown={commitOnEnter}
                    >
                      <option value="task">tarefa</option>
                      <option value="milestone">marco</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3">
                  {task.isSummary ? (
                    <div className="rounded-2xl bg-white/70 px-3 py-2.5 text-sm font-semibold text-[var(--foreground)]">
                      {task.startDate}
                    </div>
                  ) : (
                    <input
                      className="w-full rounded-2xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      defaultValue={task.startDate}
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
                <td className="px-4 py-3">
                  {task.isSummary ? (
                    <div className="rounded-2xl bg-white/70 px-3 py-2.5 text-sm font-semibold text-[var(--foreground)]">
                      {task.endDate}
                    </div>
                  ) : (
                    <input
                      className="w-full rounded-2xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      defaultValue={task.endDate}
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
                <td className="px-4 py-3">
                  {task.isSummary ? (
                    <div className="rounded-2xl bg-white/70 px-3 py-2.5 text-sm font-semibold text-[var(--foreground)]">
                      {task.durationDays}
                    </div>
                  ) : (
                    <input
                      className="w-full rounded-2xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      defaultValue={task.durationDays}
                      min={task.computedKind === "milestone" ? 0 : 1}
                      onBlur={(event) => {
                        onCommitDuration(task.id, Number(event.target.value || 1));
                      }}
                      onKeyDown={commitOnEnter}
                      type="number"
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  {task.isSummary ? (
                    <div className="rounded-2xl bg-white/70 px-3 py-2.5 text-sm text-[var(--muted)]">—</div>
                  ) : (
                    <input
                      className="mono w-full rounded-2xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      defaultValue={predecessors}
                      onBlur={(event) => onCommitPredecessors(task.id, event.target.value)}
                      onKeyDown={commitOnEnter}
                        placeholder="12, 15SS, 18FF+2d"
                      />
                    )}
                  </td>
                <td className="px-4 py-3">
                  <div className="mono rounded-2xl bg-white/70 px-3 py-2.5 text-sm text-[var(--foreground)]">
                    {successors || "—"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {task.isSummary ? (
                    <div className="rounded-2xl bg-white/70 px-3 py-2.5 text-sm font-semibold text-[var(--foreground)]">
                      {task.progress}%
                    </div>
                  ) : (
                    <input
                      className="w-24 rounded-2xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      defaultValue={task.progress}
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
                <td className="px-4 py-3 align-middle">
                  <div className="flex flex-wrap gap-2">
                    <button
                      aria-label="Mover tarefa para cima"
                      className="rounded-2xl border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-white"
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
                      className="rounded-2xl border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-white"
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
                      className="rounded-2xl border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-white"
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
                      className="rounded-2xl border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-white"
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
                      className="rounded-2xl border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-white"
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
                      aria-label="Excluir tarefa"
                      className="rounded-2xl border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
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
}
