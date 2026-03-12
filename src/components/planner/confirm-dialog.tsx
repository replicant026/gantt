"use client";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-base font-semibold text-[var(--foreground)]">{title}</h2>
        <p className="mb-6 text-sm text-[var(--muted)]">{description}</p>
        <div className="flex justify-end gap-2">
          <button
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[#f4f6f2]"
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`rounded-md px-4 py-2 text-sm font-medium text-white transition ${
              destructive
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-[var(--accent)] hover:opacity-90"
            }`}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
