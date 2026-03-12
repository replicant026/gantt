import { nowISO } from "@/lib/date-utils";
import type { TaskRecord } from "@/types/planner";

const REQUIRED_HEADERS = ["tarefa", "início", "fim"];

interface ParseResult {
  tasks: Omit<TaskRecord, "id" | "projectId" | "code" | "order" | "parentId">[];
  rawPredecessors: Record<number, string>;
  error?: string;
}

export function parseCsvImport(csvText: string): ParseResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { tasks: [], rawPredecessors: {}, error: "CSV vazio ou sem dados." };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, ""));

  // Normaliza headers para comparação sem acentos
  const normalizedRequired = REQUIRED_HEADERS.map((r) => r.normalize("NFD").replace(/\p{M}/gu, ""));
  const missing = normalizedRequired.filter((r) => !headers.includes(r));
  if (missing.length > 0) {
    return {
      tasks: [],
      rawPredecessors: {},
      error: `Colunas obrigatórias não encontradas: ${missing.join(", ")}. Headers esperados: Tarefa, Início, Fim.`,
    };
  }

  const col = (name: string) => {
    const normalized = name.normalize("NFD").replace(/\p{M}/gu, "");
    return headers.indexOf(normalized);
  };

  const tasks: ParseResult["tasks"] = [];
  const rawPredecessors: ParseResult["rawPredecessors"] = {};
  const timestamp = nowISO();

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const name = cells[col("tarefa")] ?? "";
    if (!name) continue;

    const startDate = cells[col("inicio")] || timestamp.slice(0, 10);
    const endDate = cells[col("fim")] || startDate;
    const durIdx = col("duracao");
    const durationDays = Math.max(1, Number((durIdx >= 0 ? cells[durIdx] : "") || 1));
    const predIdx = col("predecessoras");
    const pred = predIdx >= 0 ? (cells[predIdx] ?? "") : "";
    const pctIdx = col("%");
    const respIdx = col("responsavel");
    const notasIdx = col("notas");

    tasks.push({
      name,
      kind: "task",
      startDate,
      endDate,
      durationDays,
      progress: Number((pctIdx >= 0 ? cells[pctIdx] : "") || 0),
      notes: notasIdx >= 0 ? (cells[notasIdx] ?? "") : "",
      status: "pending",
      priority: "none",
      assignee: respIdx >= 0 ? (cells[respIdx] ?? "") : "",
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (pred) rawPredecessors[tasks.length - 1] = pred;
  }

  return { tasks, rawPredecessors };
}
