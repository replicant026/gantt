import { describe, it, expect } from "vitest";
import { DEFAULT_COLUMNS, applyColumnConfig } from "@/lib/column-config";

describe("column-config", () => {
  it("DEFAULT_COLUMNS contém pelo menos 10 colunas", () => {
    expect(DEFAULT_COLUMNS.length).toBeGreaterThanOrEqual(10);
  });

  it("todas as colunas padrão têm id, label e visible", () => {
    for (const col of DEFAULT_COLUMNS) {
      expect(col.id).toBeTruthy();
      expect(col.label).toBeTruthy();
      expect(typeof col.visible).toBe("boolean");
    }
  });

  it("applyColumnConfig aplica visible e order corretos", () => {
    const saved = [{ id: "kind" as const, visible: false, order: 99, width: 222 }];
    const result = applyColumnConfig(DEFAULT_COLUMNS, saved);
    const kindCol = result.find((c) => c.id === "kind");
    expect(kindCol?.visible).toBe(false);
    expect(kindCol?.order).toBe(99);
    expect(kindCol?.width).toBe(222);
  });

  it("colunas não removíveis são wbs, name e actions", () => {
    const nonRemovable = DEFAULT_COLUMNS.filter((c) => !c.removable).map((c) => c.id);
    expect(nonRemovable).toContain("wbs");
    expect(nonRemovable).toContain("name");
    expect(nonRemovable).toContain("actions");
  });
});
