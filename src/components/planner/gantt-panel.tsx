"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { BarChart3, CalendarRange } from "lucide-react";

import { formatHumanDate, formatISODate } from "@/lib/date-utils";
import type { ChartViewMode, ResolvedTask } from "@/types/planner";
import type Gantt from "frappe-gantt";

const VIEW_MODES: ChartViewMode[] = ["Day", "Week", "Month"];

type GanttPanelProps = {
  projectName: string;
  tasks: ResolvedTask[];
  viewMode: ChartViewMode;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onDateChange: (taskId: string, startDate: string, endDate: string) => void;
  onViewModeChange: (viewMode: ChartViewMode) => void;
};

export const GanttPanel = forwardRef<HTMLDivElement, GanttPanelProps>(
  function GanttPanel(
    {
      projectName,
      tasks,
      viewMode,
      selectedTaskId,
      onSelectTask,
      onDateChange,
      onViewModeChange,
    },
    ref,
  ) {
    const exportRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<Gantt | null>(null);

    useImperativeHandle(ref, () => exportRef.current as HTMLDivElement, []);

    const visibleIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
    const mappedTasks = useMemo(
      () =>
        tasks.map((task) => ({
          id: task.id,
          name: `${task.code}. ${task.name}`,
          start: task.startDate,
          end: task.computedKind === "milestone" ? task.startDate : task.endDate,
          progress: task.progress,
          dependencies: task.predecessorIds.filter((id) => visibleIds.has(id)),
          custom_class: [
            task.isSummary ? "is-summary" : "",
            task.computedKind === "milestone" ? "is-milestone" : "",
          ]
            .filter(Boolean)
            .join(" "),
          description: `${task.wbs} • ${formatHumanDate(task.startDate)} até ${formatHumanDate(task.endDate)}`,
        })),
      [tasks, visibleIds],
    );

    useEffect(() => {
      if (!chartRef.current) {
        return;
      }

      let cancelled = false;

      void (async () => {
        const { default: FrappeGantt } = await import("frappe-gantt");
        if (cancelled || !chartRef.current) {
          return;
        }

        if (instanceRef.current) {
          instanceRef.current.clear();
          chartRef.current.innerHTML = "";
        }

        instanceRef.current = new FrappeGantt(chartRef.current, mappedTasks, {
          language: "pt",
          move_dependencies: false,
          readonly_progress: true,
          readonly_dates: false,
          scroll_to: "today",
          today_button: false,
          view_mode: viewMode,
          view_modes: VIEW_MODES,
          on_click: (task) => onSelectTask(task.id),
          on_date_change: (task, start, end) => {
            onDateChange(task.id, formatISODate(start), formatISODate(end));
          },
          on_view_change: (mode) => {
            if (VIEW_MODES.includes(mode as ChartViewMode)) {
              onViewModeChange(mode as ChartViewMode);
            }
          },
          popup: (ctx) => {
            ctx.set_title(ctx.task.name);
            ctx.set_subtitle(ctx.task.description ?? projectName);
            ctx.set_details(
              `${formatHumanDate(formatISODate(ctx.task._start))} → ${formatHumanDate(formatISODate(ctx.task._end))}`,
            );
          },
        });
      })();

      return () => {
        cancelled = true;
      };
    }, [mappedTasks, onDateChange, onSelectTask, onViewModeChange, projectName, viewMode]);

    useEffect(() => {
      if (!chartRef.current) {
        return;
      }

      for (const element of chartRef.current.querySelectorAll(".bar-wrapper")) {
        element.classList.remove("is-selected");
      }

      if (selectedTaskId) {
        chartRef.current
          .querySelector(`.bar-wrapper[data-id="${selectedTaskId}"]`)
          ?.classList.add("is-selected");
      }
    }, [selectedTaskId, tasks]);

    return (
      <section className="panel-card rounded-[32px] p-4">
        <div className="mb-4 flex flex-col gap-4 px-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Timeline e Gantt</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Arraste barras para refinar datas e acompanhe dependencias no mesmo fluxo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode}
                className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                  mode === viewMode
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--border-strong)]"
                }`}
                onClick={() => onViewModeChange(mode)}
                type="button"
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div ref={exportRef} className="rounded-[28px] bg-[#f6f8f4] p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-soft)]">
                Janela ativa
              </p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--foreground)]">
                {projectName}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2">
                <BarChart3 className="h-3.5 w-3.5 text-[var(--accent)]" />
                {tasks.length} barras visiveis
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2">
                <CalendarRange className="h-3.5 w-3.5 text-[var(--accent)]" />
                modo {viewMode.toLowerCase()}
              </span>
            </div>
          </div>

          {tasks.length > 0 ? (
            <div className="planner-scrollbar overflow-auto rounded-[24px] border border-[var(--border)] bg-white p-3">
              <div ref={chartRef} className="min-w-[720px]" />
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-white/70 px-6 py-12 text-center text-sm text-[var(--muted)]">
              Crie pelo menos uma tarefa para gerar a visualização do Gantt.
            </div>
          )}
        </div>
      </section>
    );
  },
);
