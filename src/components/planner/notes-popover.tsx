"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";

interface NotesPopoverProps {
  taskId: string;
  taskName: string;
  notes: string;
  onCommit: (taskId: string, notes: string) => void;
}

export function NotesPopover({ taskId, taskName, notes, onCommit }: NotesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(notes);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [open, notes]);

  function handleClose() {
    onCommit(taskId, draft);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        aria-label="Editar notas"
        className={`rounded-md border p-1.5 transition ${
          notes
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:bg-[#f4f6f2]"
        }`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="Notas"
        type="button"
      >
        <FileText className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={handleClose} />
          <div
            className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-[var(--border)] bg-white p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 truncate text-xs font-semibold text-[var(--muted)]">{taskName}</p>
            <textarea
              ref={textareaRef}
              className="w-full resize-none rounded border border-[var(--border)] p-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              placeholder="Adicionar notas..."
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:bg-[#f4f6f2]"
                onClick={() => { setDraft(notes); setOpen(false); }}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                onClick={handleClose}
                type="button"
              >
                Salvar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
