"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { CalendarCheck } from "lucide-react";

import { getGanttFontFamilyValue } from "@/lib/planner-appearance";
import { formatHumanDate, formatISODate } from "@/lib/date-utils";
import type {
  ChartViewMode,
  GanttAppearanceSettings,
  ResolvedTask,
} from "@/types/planner";
import type Gantt from "frappe-gantt";

const VIEW_MODES: ChartViewMode[] = ["Day", "Week", "Month"];

export type GanttPanelHandle = {
  exportElement: HTMLDivElement | null;
  setScrollTop: (scrollTop: number) => void;
  getGridHeaderHeight: () => number;
  scrollToToday: () => void;
};

type GanttPanelProps = {
  projectName: string;
  tasks: ResolvedTask[];
  viewMode: ChartViewMode;
  selectedTaskId: string | null;
  appearance: GanttAppearanceSettings;
  onSelectTask: (taskId: string) => void;
  onDateChange: (taskId: string, startDate: string, endDate: string) => void;
  onViewModeChange: (viewMode: ChartViewMode) => void;
  onVerticalScroll?: (scrollTop: number) => void;
};

type GanttTaskShape = {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  dependencies: string[];
  custom_class: string;
  description: string;
};

function formatTaskLabel(
  task: ResolvedTask,
  appearance: GanttAppearanceSettings,
): string {
  switch (appearance.labelContent) {
    case "name":
      return task.name;
    case "name-progress":
      return `${task.name} ${task.progress}%`;
    case "code-name-progress":
      return `${task.code}. ${task.name} ${task.progress}%`;
    case "wbs-name":
      return `${task.wbs} ${task.name}`;
    case "code-name":
    default:
      return `${task.code}. ${task.name}`;
  }
}

function stripSvgAnimations(root: HTMLElement | null) {
  if (!root) {
    return;
  }

  for (const element of root.querySelectorAll("animate")) {
    const parent = element.parentElement;
    const attributeName = element.getAttribute("attributeName");
    const to = element.getAttribute("to");

    if (parent && attributeName && to !== null) {
      parent.setAttribute(attributeName, to);
    }

    element.remove();
  }
}

function applyLabelPositions(
  root: HTMLElement | null,
  appearance: GanttAppearanceSettings,
) {
  if (!root) {
    return;
  }

  for (const wrapper of root.querySelectorAll<SVGGElement>(".bar-wrapper")) {
    const bar = wrapper.querySelector<SVGRectElement>(".bar");
    const label = wrapper.querySelector<SVGTextElement>(".bar-label");

    if (!bar || !label) {
      continue;
    }

    if (appearance.labelPosition === "hidden") {
      label.style.display = "none";
      continue;
    }

    label.style.display = "";
    label.style.textAnchor = "start";
    label.classList.add("big");

    if (appearance.labelPosition === "inside") {
      label.classList.remove("big");
      label.style.textAnchor = "middle";
      label.setAttribute("x", String(bar.getBBox().x + bar.getBBox().width / 2));
      continue;
    }

    const labelWidth = label.getBBox().width;
    const barBox = bar.getBBox();
    const y = barBox.y + barBox.height / 2 + 1;
    label.setAttribute("y", String(y));

    if (appearance.labelPosition === "left") {
      label.setAttribute("x", String(barBox.x - labelWidth - 10));
    } else {
      label.setAttribute("x", String(barBox.x + barBox.width + 10));
    }
  }
}

export const GanttPanel = forwardRef<GanttPanelHandle, GanttPanelProps>(
  function GanttPanel(
    {
      projectName,
      tasks,
      viewMode,
      selectedTaskId,
      appearance,
      onSelectTask,
      onDateChange,
      onViewModeChange,
      onVerticalScroll,
    },
    ref,
  ) {
    const exportRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<Gantt | null>(null);
    const handlersRef = useRef({ onSelectTask, onDateChange, onViewModeChange });
    const {
      barColor,
      progressColor,
      summaryColor,
      milestoneColor,
      dependencyColor,
      labelColor,
      showDependencies,
      showTodayHighlight,
      labelPosition,
      fontFamily,
      barHeight,
      rowPadding,
    } = appearance;

    handlersRef.current = { onSelectTask, onDateChange, onViewModeChange };

    useImperativeHandle(ref, () => ({
      get exportElement() { return exportRef.current; },
      setScrollTop(scrollTop: number) {
        const container = chartRef.current?.querySelector<HTMLElement>(".gantt-container");
        if (container) {
          container.scrollTop = scrollTop;
        }
      },
      getGridHeaderHeight() {
        const gh = chartRef.current?.querySelector(".grid-header");
        return gh ? gh.getBoundingClientRect().height + 10 : 85;
      },
      scrollToToday() {
        const container = chartRef.current?.querySelector<HTMLElement>(".gantt-container");
        const todayEl = chartRef.current?.querySelector(".current-highlight");
        if (container && todayEl) {
          const containerRect = container.getBoundingClientRect();
          const todayRect = todayEl.getBoundingClientRect();
          const offset = todayRect.left - containerRect.left + container.scrollLeft;
          container.scrollTo({ left: offset - containerRect.width / 3, behavior: "smooth" });
        }
      },
    }), []);

    // Wire up vertical scroll listener on the gantt-container
    useEffect(() => {
      if (!chartRef.current || !onVerticalScroll) {
        return;
      }

      const observer = new MutationObserver(() => {
        const container = chartRef.current?.querySelector<HTMLElement>(".gantt-container");
        if (container) {
          container.addEventListener("scroll", handleScroll);
          observer.disconnect();
        }
      });

      const handleScroll = (event: Event) => {
        const target = event.target as HTMLElement;
        onVerticalScroll(target.scrollTop);
      };

      const container = chartRef.current.querySelector<HTMLElement>(".gantt-container");
      if (container) {
        container.addEventListener("scroll", handleScroll);
      } else {
        observer.observe(chartRef.current, { childList: true, subtree: true });
      }

      return () => {
        observer.disconnect();
        chartRef.current
          ?.querySelector<HTMLElement>(".gantt-container")
          ?.removeEventListener("scroll", handleScroll);
      };
    }, [onVerticalScroll]);

    const visibleIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
    const mappedTasks = useMemo<GanttTaskShape[]>(
      () =>
        tasks.map((task) => ({
          id: task.id,
          name: formatTaskLabel(task, appearance),
          start: task.startDate,
          end: task.computedKind === "milestone" ? task.startDate : task.endDate,
          progress: task.progress,
          dependencies: showDependencies
            ? task.predecessorIds.filter((id) => visibleIds.has(id))
            : [],
          custom_class: [
            task.isSummary ? "is-summary" : "",
            task.computedKind === "milestone" ? "is-milestone" : "",
          ]
            .filter(Boolean)
            .join(" "),
          description: `${task.wbs} • ${formatHumanDate(task.startDate)} até ${formatHumanDate(task.endDate)}`,
        })),
      [appearance, showDependencies, tasks, visibleIds],
    );

    // Destroy existing instance when bar/padding options change so it re-creates
    useEffect(() => {
      if (instanceRef.current && chartRef.current) {
        // Clear the old chart DOM so frappe-gantt creates a fresh one
        instanceRef.current = null;
        chartRef.current.innerHTML = '';
      }
    }, [barHeight, rowPadding]);

    useEffect(() => {
      if (!chartRef.current || instanceRef.current) {
        return;
      }

      let cancelled = false;

      void (async () => {
        const { default: FrappeGantt } = await import("frappe-gantt");
        if (cancelled || !chartRef.current) {
          return;
        }

        instanceRef.current = new FrappeGantt(chartRef.current, mappedTasks, {
          language: "pt",
          move_dependencies: false,
          readonly_progress: true,
          readonly_dates: false,
          scroll_to: null,
          today_button: false,
          view_mode: viewMode,
          view_modes: VIEW_MODES,
          bar_height: barHeight,
          padding: rowPadding,
          on_click: (task) => handlersRef.current.onSelectTask(task.id),
          on_date_change: (task, start, end) => {
            handlersRef.current.onDateChange(
              task.id,
              formatISODate(start),
              formatISODate(end),
            );
          },
          on_view_change: (mode) => {
            if (VIEW_MODES.includes(mode as ChartViewMode)) {
              handlersRef.current.onViewModeChange(mode as ChartViewMode);
            }
          },
          popup: false,
        });

        requestAnimationFrame(() => {
          stripSvgAnimations(chartRef.current);
          applyLabelPositions(chartRef.current, appearance);
        });
      })();

      return () => {
        cancelled = true;
      };
    }, [appearance, barHeight, mappedTasks, rowPadding, viewMode]);

    useEffect(() => {
      if (!instanceRef.current || !chartRef.current) {
        return;
      }

      const scrollContainer = chartRef.current.querySelector<HTMLElement>(".gantt-container");
      const previousScrollLeft = scrollContainer?.scrollLeft ?? 0;
      const previousScrollTop = scrollContainer?.scrollTop ?? 0;

      instanceRef.current.refresh(mappedTasks);

      requestAnimationFrame(() => {
        const nextContainer = chartRef.current?.querySelector<HTMLElement>(".gantt-container");
        if (nextContainer) {
          nextContainer.scrollLeft = previousScrollLeft;
          nextContainer.scrollTop = previousScrollTop;
        }
        stripSvgAnimations(chartRef.current);
        applyLabelPositions(chartRef.current, appearance);
      });
    }, [appearance, labelPosition, mappedTasks]);

    useEffect(() => {
      if (!instanceRef.current || !chartRef.current) {
        return;
      }

      instanceRef.current.update_options({
        bar_height: barHeight,
        padding: rowPadding,
      });

      requestAnimationFrame(() => {
        stripSvgAnimations(chartRef.current);
        applyLabelPositions(chartRef.current, appearance);
      });
    }, [appearance, barHeight, rowPadding]);

    useEffect(() => {
      if (!instanceRef.current) {
        return;
      }

      instanceRef.current.change_view_mode(viewMode, true);

      requestAnimationFrame(() => {
        stripSvgAnimations(chartRef.current);
        applyLabelPositions(chartRef.current, appearance);
      });
    }, [appearance, viewMode]);

    useEffect(() => {
      requestAnimationFrame(() => {
        stripSvgAnimations(chartRef.current);
        applyLabelPositions(chartRef.current, appearance);
      });
    }, [appearance, labelPosition]);

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
    }, [appearance, selectedTaskId, tasks]);

    const ganttStyle = {
      ["--gantt-bar-color" as string]: barColor,
      ["--gantt-progress-color" as string]: progressColor,
      ["--gantt-summary-color" as string]: summaryColor,
      ["--gantt-milestone-color" as string]: milestoneColor,
      ["--gantt-dependency-color" as string]: dependencyColor,
      ["--gantt-label-color" as string]: labelColor,
      ["--gantt-label-font-family" as string]: getGanttFontFamilyValue(fontFamily),
      ["--gantt-today-opacity" as string]: showTodayHighlight ? 1 : 0,
    } as React.CSSProperties;

    return (
      <section className="flex h-full min-h-0 flex-col bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
              Gantt
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
              {projectName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              onClick={() => {
                const container = chartRef.current?.querySelector<HTMLElement>(".gantt-container");
                const todayEl = chartRef.current?.querySelector(".current-highlight");
                if (container && todayEl) {
                  const containerRect = container.getBoundingClientRect();
                  const todayRect = todayEl.getBoundingClientRect();
                  const offset = todayRect.left - containerRect.left + container.scrollLeft;
                  container.scrollTo({ left: offset - containerRect.width / 3, behavior: "smooth" });
                }
              }}
              type="button"
              title="Ir para hoje"
            >
              <CalendarCheck size={14} />
              Hoje
            </button>
            <div className="mx-1 h-5 w-px bg-[var(--border)]" />
            {VIEW_MODES.map((mode) => (
              <button
                key={mode}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
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

        <div
          ref={exportRef}
          className="flex min-h-0 flex-1 flex-col bg-[#f8faf7]"
          style={ganttStyle}
        >
          {tasks.length > 0 ? (
            <div className="planner-scrollbar min-h-0 flex-1 overflow-auto p-3">
              <div ref={chartRef} className="min-w-[720px]" />
            </div>
          ) : (
            <div className="m-3 rounded-md border border-dashed border-[var(--border)] bg-white px-6 py-12 text-center text-sm text-[var(--muted)]">
              Crie pelo menos uma tarefa para gerar a visualização do Gantt.
            </div>
          )}
        </div>
      </section>
    );
  },
);
