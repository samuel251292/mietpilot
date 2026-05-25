"use client";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { fileToBlob, hasFileContent } from "@/lib/storage/file-resolver";
import { attachStorageMetaToTemplate, buildTemplateStorageMeta } from "@/lib/storage/template-storage";
import type { StoredFileMeta } from "@/types/storage";

export type TemplateStatus = "Aktiv" | "Inaktiv";

export type StoredWordTemplate = {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  status: TemplateStatus;
  placeholders: string[];
  unknownPlaceholders: string[];
  lastTestStatus: string;
  dataUrl?: string;
  storage?: StoredFileMeta;
  storageStatus?: StoredFileMeta["storageStatus"];
  source?: "mock" | "upload" | "legacy" | "storage";
};

const storageKey = "mietpilot-word-templates";
const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function loadWordTemplates() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as StoredWordTemplate[]) : [];
  } catch {
    return [];
  }
}

export function saveWordTemplates(templates: StoredWordTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(templates));
}

export function loadActiveStoredWordTemplate() {
  return loadWordTemplates().find((template) => template.status === "Aktiv" && hasTemplateFileContent(template));
}

export async function createStoredTemplateFromFile({
  file,
  uploadedBy,
  uploadedById,
  recommendedPlaceholders,
}: {
  file: File;
  uploadedBy: string;
  uploadedById?: string;
  recommendedPlaceholders: string[];
}): Promise<StoredWordTemplate> {
  const dataUrl = await fileToDataUrl(file);
  const placeholders = await extractDocxPlaceholdersFromDataUrl(dataUrl);
  const unknownPlaceholders = placeholders.filter((placeholder) => !recommendedPlaceholders.includes(placeholder));
  const templateId = `tpl-${Date.now()}`;
  const storage = await buildTemplateStorageMeta(templateId, file, dataUrl, uploadedById ?? uploadedBy);

  return attachStorageMetaToTemplate({
    id: templateId,
    fileName: file.name,
    uploadedAt: new Intl.DateTimeFormat("de-AT", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date()),
    uploadedBy,
    status: "Inaktiv",
    placeholders,
    unknownPlaceholders,
    lastTestStatus: "Noch nicht getestet",
    dataUrl,
    source: "upload",
  }, storage);
}

export async function createDocxFromTemplate(template: StoredWordTemplate, values: Record<string, string>) {
  if (!hasTemplateFileContent(template)) {
    throw new Error("Keine echte DOCX-Datei fuer die aktive Vorlage vorhanden.");
  }

  const blob = await templateToBlob(template);
  if (!blob) throw new Error("Die DOCX-Vorlage konnte nicht geladen werden.");

  const zip = new PizZip(await blob.arrayBuffer());
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: {
      start: "{{",
      end: "}}",
    },
  });

  doc.render(values);

  return doc.getZip().generate({
    type: "blob",
    mimeType: docxMime,
  }) as Blob;
}

export async function extractDocxPlaceholdersFromDataUrl(dataUrl: string) {
  const zip = new PizZip(await dataUrlToArrayBuffer(dataUrl));
  const xmlFiles = zip.file(/word\/.*\.xml$/);
  const placeholders = new Set<string>();
  const placeholderPattern = /\{\{\s*[\w_]+\s*\}\}/g;

  xmlFiles.forEach((entry) => {
    const xml = entry.asText();
    const text = xml
      .replace(/<w:t[^>]*>/g, "")
      .replace(/<\/w:t>/g, "")
      .replace(/<[^>]+>/g, "");
    const matches = text.match(placeholderPattern) ?? [];
    matches.forEach((match) => placeholders.add(match.replace(/\s+/g, "")));
  });

  return Array.from(placeholders).sort((a, b) => a.localeCompare(b));
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function hasTemplateFileContent(template?: StoredWordTemplate | null) {
  return hasFileContent(toTemplateFileReference(template));
}

export function templateToBlob(template?: StoredWordTemplate | null) {
  return fileToBlob(toTemplateFileReference(template));
}

function toTemplateFileReference(template?: StoredWordTemplate | null) {
  if (!template) return undefined;
  return {
    dataUrl: template.dataUrl,
    storage: template.storage,
    fileName: template.fileName,
    storageStatus: template.storageStatus,
    uploadedAt: template.uploadedAt,
  };
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Die DOCX-Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

async function dataUrlToArrayBuffer(dataUrl: string) {
  return fetch(dataUrl).then((response) => response.arrayBuffer());
}
