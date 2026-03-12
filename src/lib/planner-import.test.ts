import { describe, it, expect } from "vitest";
import { parseCsvImport } from "@/lib/planner-import";

describe("parseCsvImport", () => {
  it("parseia CSV com colunas básicas", () => {
    const csv = `Tarefa,Início,Fim,Duração,Predecessoras\nTarefa 1,2026-03-01,2026-03-05,5,\nTarefa 2,2026-03-06,2026-03-10,5,1`;
    const result = parseCsvImport(csv);
    expect(result.error).toBeUndefined();
    expect(result.tasks.length).toBe(2);
    expect(result.tasks[0].name).toBe("Tarefa 1");
    expect(result.tasks[1].name).toBe("Tarefa 2");
    expect(result.rawPredecessors[1]).toBe("1");
  });

  it("retorna erro se header obrigatório ausente", () => {
    const csv = `Col1,Col2\nA,B`;
    const result = parseCsvImport(csv);
    expect(result.error).toBeTruthy();
  });

  it("ignora linhas vazias", () => {
    const csv = `Tarefa,Início,Fim,Duração,Predecessoras\nTarefa 1,2026-03-01,2026-03-01,1,\n\n\n`;
    const result = parseCsvImport(csv);
    expect(result.tasks.length).toBe(1);
  });

  it("retorna erro para CSV vazio", () => {
    const result = parseCsvImport("");
    expect(result.error).toBeTruthy();
  });

  it("usa duração mínima de 1 para valores inválidos", () => {
    const csv = `Tarefa,Início,Fim,Duração\nTarefa X,2026-01-01,2026-01-01,0`;
    const result = parseCsvImport(csv);
    expect(result.tasks[0].durationDays).toBe(1);
  });
});
