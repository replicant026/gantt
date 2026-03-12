"use client";

import { RotateCcw, X } from "lucide-react";

import type { GanttAppearanceSettings } from "@/types/planner";

type PlannerSettingsDrawerProps = {
  isOpen: boolean;
  settings: GanttAppearanceSettings;
  onClose: () => void;
  onReset: () => void;
  onChange: <K extends keyof GanttAppearanceSettings>(
    key: K,
    value: GanttAppearanceSettings[K],
  ) => void;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-md border border-[var(--border)] bg-[#fafbf8] p-4">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input
          className="h-10 w-12 cursor-pointer rounded-md border border-[var(--border)] bg-white p-1"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={value.startsWith("#") ? value : "#255f48"}
        />
        <input
          className="h-10 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
          onChange={(event) => onChange(event.target.value)}
          type="text"
          value={value}
        />
      </div>
    </Field>
  );
}

export function PlannerSettingsDrawer({
  isOpen,
  settings,
  onClose,
  onReset,
  onChange,
}: PlannerSettingsDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/20">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-white shadow-[0_18px_42px_rgba(18,24,20,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
              Personalização
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">
              Aparência do Gantt
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Ajuste barras, texto, dependências e densidade visual do cronograma.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-[#f4f6f2]"
              onClick={onReset}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              className="rounded-md border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-[#f4f6f2]"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="planner-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
          <Section title="Barras e dependências">
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField
                label="Barra"
                onChange={(value) => onChange("barColor", value)}
                value={settings.barColor}
              />
              <ColorField
                label="Progresso"
                onChange={(value) => onChange("progressColor", value)}
                value={settings.progressColor}
              />
              <ColorField
                label="Resumo"
                onChange={(value) => onChange("summaryColor", value)}
                value={settings.summaryColor}
              />
              <ColorField
                label="Marco"
                onChange={(value) => onChange("milestoneColor", value)}
                value={settings.milestoneColor}
              />
              <ColorField
                label="Dependência"
                onChange={(value) => onChange("dependencyColor", value)}
                value={settings.dependencyColor}
              />
              <ColorField
                label="Texto"
                onChange={(value) => onChange("labelColor", value)}
                value={settings.labelColor}
              />
            </div>
            <label className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)]">
              <input
                checked={settings.showDependencies}
                className="accent-[var(--accent)]"
                onChange={(event) => onChange("showDependencies", event.target.checked)}
                type="checkbox"
              />
              Mostrar linhas de dependência
            </label>
            <label className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)]">
              <input
                checked={settings.showTodayHighlight}
                className="accent-[var(--accent)]"
                onChange={(event) => onChange("showTodayHighlight", event.target.checked)}
                type="checkbox"
              />
              Mostrar destaque da data atual
            </label>
          </Section>

          <Section title="Texto do Gantt">
            <Field label="Conteúdo do rótulo">
              <select
                className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                onChange={(event) => onChange("labelContent", event.target.value as GanttAppearanceSettings["labelContent"])}
                value={settings.labelContent}
              >
                <option value="name">Nome</option>
                <option value="code-name">Código + nome</option>
                <option value="name-progress">Nome + progresso</option>
                <option value="code-name-progress">Código + nome + progresso</option>
                <option value="wbs-name">WBS + nome</option>
              </select>
            </Field>
            <Field label="Posição do rótulo">
              <select
                className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                onChange={(event) => onChange("labelPosition", event.target.value as GanttAppearanceSettings["labelPosition"])}
                value={settings.labelPosition}
              >
                <option value="inside">Dentro da barra</option>
                <option value="right">À direita</option>
                <option value="left">À esquerda</option>
                <option value="hidden">Oculto</option>
              </select>
            </Field>
            <Field label="Fonte do Gantt">
              <select
                className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                onChange={(event) => onChange("fontFamily", event.target.value as GanttAppearanceSettings["fontFamily"])}
                value={settings.fontFamily}
              >
                <option value="manrope">Manrope</option>
                <option value="plex">IBM Plex Mono</option>
                <option value="georgia">Georgia</option>
                <option value="system">System</option>
              </select>
            </Field>
          </Section>

          <Section title="Densidade visual">
            <Field label="Tamanho (linhas e barras)">
              <input
                className="w-full accent-[var(--accent)]"
                max={44}
                min={25}
                onChange={(event) => {
                  const newBarHeight = Number(event.target.value);
                  // Calculate row padding proportionally (barHeight 25-44 -> rowPadding 11-24)
                  // Min value is 25+11=36px total height, matching the gridRowHeight minimum.
                  const p = (newBarHeight - 25) / 19;
                  const newRowPadding = Math.round(11 + p * 13);
                  
                  onChange("barHeight", newBarHeight);
                  onChange("rowPadding", newRowPadding);
                }}
                type="range"
                value={settings.barHeight}
              />
              <div className="mt-1 flex justify-between text-[10px] text-[var(--muted-soft)]">
                <span>Compacto</span>
                <span>Normal</span>
                <span>Expandido</span>
              </div>
            </Field>
          </Section>
        </div>
      </div>
    </div>
  );
}
