import { PDFDocument } from "pdf-lib";
import { toPng } from "html-to-image";
import Papa from "papaparse";
import * as XLSX from "xlsx";

import { formatHumanDate } from "@/lib/date-utils";
import { formatDependencyLinks } from "@/lib/planner-engine";
import type {
  PlannerExportBundle,
  ProjectRecord,
  ResolvedTask,
} from "@/types/planner";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createFileSlug(project: ProjectRecord): string {
  return project.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "cronograma";
}

function buildExportRows(tasks: ResolvedTask[]) {
  return tasks.map((task) => ({
    ID: task.code,
    WBS: task.wbs,
    Tarefa: task.name,
    Tipo: task.computedKind,
    Inicio: formatHumanDate(task.startDate),
    Fim: formatHumanDate(task.endDate),
    Duracao: task.durationDays,
    Progresso: `${task.progress}%`,
    Predecessoras: formatDependencyLinks(task.predecessorLinks),
    Sucessoras: formatDependencyLinks(task.successorLinks),
    Nivel: task.depth,
  }));
}

export function exportProjectJson(bundle: PlannerExportBundle) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlob(blob, `${createFileSlug(bundle.project)}.json`);
}

export function exportProjectCsv(project: ProjectRecord, tasks: ResolvedTask[]) {
  const csv = Papa.unparse(buildExportRows(tasks));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${createFileSlug(project)}.csv`);
}

export function exportProjectXlsx(project: ProjectRecord, tasks: ResolvedTask[]) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(buildExportRows(tasks));
  XLSX.utils.book_append_sheet(workbook, worksheet, "Cronograma");
  XLSX.writeFile(workbook, `${createFileSlug(project)}.xlsx`);
}

export async function exportGanttPng(
  element: HTMLElement,
  project: ProjectRecord,
): Promise<void> {
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#f4f5ef",
  });
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  downloadBlob(blob, `${createFileSlug(project)}-gantt.png`);
}

export async function exportGanttPdf(
  element: HTMLElement,
  project: ProjectRecord,
): Promise<void> {
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#f4f5ef",
  });
  const pngBytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  const page = pdf.addPage([image.width + 48, image.height + 48]);
  page.drawImage(image, {
    x: 24,
    y: 24,
    width: image.width,
    height: image.height,
  });
  const pdfBytes = await pdf.save();
  const pdfByteArray = Uint8Array.from(pdfBytes);
  downloadBlob(
    new Blob([pdfByteArray], { type: "application/pdf" }),
    `${createFileSlug(project)}-gantt.pdf`,
  );
}
