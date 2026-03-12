export type ColumnId =
  | "wbs"
  | "name"
  | "kind"
  | "start-date"
  | "end-date"
  | "duration"
  | "predecessors"
  | "successors"
  | "progress"
  | "status"
  | "priority"
  | "assignee"
  | "actions";

export interface ColumnDef {
  id: ColumnId;
  label: string;
  width: number;
  visible: boolean;
  order: number;
  removable: boolean;
}

export const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: "wbs",          label: "#",             width: 72,  visible: true,  order: 0,  removable: false },
  { id: "name",         label: "Tarefa",         width: 320, visible: true,  order: 1,  removable: false },
  { id: "kind",         label: "Tipo",           width: 94,  visible: true,  order: 2,  removable: true  },
  { id: "start-date",   label: "Início",         width: 118, visible: true,  order: 3,  removable: true  },
  { id: "end-date",     label: "Fim",            width: 118, visible: true,  order: 4,  removable: true  },
  { id: "duration",     label: "Duração",        width: 92,  visible: true,  order: 5,  removable: true  },
  { id: "predecessors", label: "Predecessoras",  width: 180, visible: true,  order: 6,  removable: true  },
  { id: "successors",   label: "Sucessoras",     width: 168, visible: true,  order: 7,  removable: true  },
  { id: "progress",     label: "%",              width: 78,  visible: true,  order: 8,  removable: true  },
  { id: "status",       label: "Status",         width: 130, visible: true,  order: 9,  removable: true  },
  { id: "priority",     label: "Prioridade",     width: 100, visible: true,  order: 10, removable: true  },
  { id: "assignee",     label: "Responsável",    width: 140, visible: true,  order: 11, removable: true  },
  { id: "actions",      label: "Ações",          width: 188, visible: true,  order: 12, removable: false },
];

type SavedColumnEntry = Pick<ColumnDef, "id" | "visible" | "order">;

export function applyColumnConfig(
  defaults: ColumnDef[],
  saved: SavedColumnEntry[],
): ColumnDef[] {
  const savedMap = new Map(saved.map((s) => [s.id, s]));
  return defaults
    .map((col) => {
      const s = savedMap.get(col.id);
      if (!s) return col;
      return { ...col, visible: s.visible, order: s.order };
    })
    .sort((a, b) => a.order - b.order);
}

export function loadColumnConfig(projectId: string): ColumnDef[] {
  try {
    const raw = localStorage.getItem(`col-cfg-${projectId}`);
    if (!raw) return [...DEFAULT_COLUMNS];
    const saved: SavedColumnEntry[] = JSON.parse(raw) as SavedColumnEntry[];
    return applyColumnConfig(DEFAULT_COLUMNS, saved);
  } catch {
    return [...DEFAULT_COLUMNS];
  }
}

export function saveColumnConfig(projectId: string, columns: ColumnDef[]): void {
  const minimal: SavedColumnEntry[] = columns.map(({ id, visible, order }) => ({
    id, visible, order,
  }));
  localStorage.setItem(`col-cfg-${projectId}`, JSON.stringify(minimal));
}
