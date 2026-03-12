import { PDFDocument } from "pdf-lib";
import html2canvas from "html2canvas";
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

async function elementToCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(element, {
    scale: 2,
    backgroundColor: "#f4f5ef",
    useCORS: true,
    logging: false,
  });
}

export async function exportGanttPng(
  element: HTMLElement,
  project: ProjectRecord,
): Promise<void> {
  const canvas = await elementToCanvas(element);
  const anchor = document.createElement("a");
  anchor.href = canvas.toDataURL("image/png");
  anchor.download = `${createFileSlug(project)}-gantt.png`;
  anchor.click();
}

export async function exportGanttPdf(
  element: HTMLElement,
  project: ProjectRecord,
): Promise<void> {
  const canvas = await elementToCanvas(element);
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const pngBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    pngBytes[i] = binary.charCodeAt(i);
  }
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  const page = pdf.addPage([image.width + 48, image.height + 48]);
  page.drawImage(image, {
    x: 24,
    y: 24,
    width: image.width,
    height: image.height,
  });
  const pdfBytes = new Uint8Array(await pdf.save());
  downloadBlob(
    new Blob([pdfBytes], { type: "application/pdf" }),
    `${createFileSlug(project)}-gantt.pdf`,
  );
}
