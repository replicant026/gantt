"use client";

import { useRef, useState } from "react";
import { Columns3, Eye, EyeOff, GripVertical } from "lucide-react";
import type { ColumnDef } from "@/lib/column-config";

interface ColumnManagerProps {
  columns: ColumnDef[];
  onChange: (columns: ColumnDef[]) => void;
}

export function ColumnManager({ columns, onChange }: ColumnManagerProps) {
  const [open, setOpen] = useState(false);
  const dragIdx = useRef<number | null>(null);

  const manageable = columns.filter((c) => c.removable);

  function toggleVisible(id: string) {
    onChange(columns.map((c) => c.id === id ? { ...c, visible: !c.visible } : c));
  }

  function handleDragStart(index: number) {
    dragIdx.current = index;
  }

  function handleDrop(dropIndex: number) {
    const from = dragIdx.current;
    if (from === null || from === dropIndex) return;
    // Work only within manageable columns, then remerge
    const mutable = [...manageable];
    const [moved] = mutable.splice(from, 1);
    mutable.splice(dropIndex, 0, moved);
    // Rebuild full list: keep non-removable at original positions
    const reordered = [...columns];
    let mi = 0;
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].removable) {
        reordered[i] = { ...mutable[mi], order: i };
        mi++;
      }
    }
    onChange(reordered);
    dragIdx.current = null;
  }

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:border-[var(--border-strong)]"
        onClick={() => setOpen((v) => !v)}
        title="Gerenciar colunas"
        type="button"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Colunas
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-56 rounded-lg border border-[var(--border)] bg-white p-3 shadow-xl">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-soft)]">Colunas</p>
            <ul className="space-y-0.5">
              {manageable.map((col, index) => (
                <li
                  key={col.id}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[#f4f6f2]"
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(index)}
                >
                  <GripVertical className="h-3.5 w-3.5 cursor-grab text-[var(--muted-soft)]" />
                  <span className="flex-1 text-[var(--foreground)]">{col.label}</span>
                  <button
                    className="rounded p-0.5 text-[var(--muted)] transition hover:text-[var(--foreground)]"
                    onClick={() => toggleVisible(col.id)}
                    title={col.visible ? "Ocultar coluna" : "Mostrar coluna"}
                    type="button"
                  >
                    {col.visible
                      ? <Eye className="h-3.5 w-3.5" />
                      : <EyeOff className="h-3.5 w-3.5 opacity-40" />
                    }
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
