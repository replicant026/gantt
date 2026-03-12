import type { GanttAppearanceSettings, GanttFontFamily } from "@/types/planner";

export const DEFAULT_GANTT_APPEARANCE: GanttAppearanceSettings = {
  barColor: "#8cab97",
  progressColor: "#255f48",
  summaryColor: "#1d5a46",
  milestoneColor: "#b86940",
  dependencyColor: "rgba(26, 31, 28, 0.48)",
  labelColor: "#243028",
  showDependencies: true,
  showTodayHighlight: true,
  labelPosition: "inside",
  labelContent: "code-name",
  fontFamily: "manrope",
  barHeight: 28,
  rowPadding: 14,
};

export function getGanttFontFamilyValue(fontFamily: GanttFontFamily): string {
  switch (fontFamily) {
    case "plex":
      return '"IBM Plex Mono", monospace';
    case "georgia":
      return 'Georgia, serif';
    case "system":
      return 'system-ui, sans-serif';
    case "manrope":
    default:
      return 'var(--font-manrope), sans-serif';
  }
}

export function sanitizeAppearanceSettings(
  value: Partial<GanttAppearanceSettings> | null | undefined,
): GanttAppearanceSettings {
  return {
    ...DEFAULT_GANTT_APPEARANCE,
    ...value,
    barHeight: clampNumeric(value?.barHeight, 25, 44, DEFAULT_GANTT_APPEARANCE.barHeight),
    rowPadding: clampNumeric(value?.rowPadding, 11, 24, DEFAULT_GANTT_APPEARANCE.rowPadding),
  };
}

function clampNumeric(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}
