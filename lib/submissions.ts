// File submissions: which formats a deadline accepts, and whether a student may still upload.
// Shared by the server (checks) and the browser (file picker, hints), so no server-only imports here.
import { MIN } from "./time";

/** Formats a teacher can ask for, each with the file extensions it covers. */
export const FILE_FORMATS = {
  pdf: ["pdf"],
  word: ["doc", "docx"],
  ppt: ["ppt", "pptx"],
  excel: ["xls", "xlsx", "csv"],
  ipynb: ["ipynb"],
  zip: ["zip", "rar", "7z"],
  image: ["jpg", "jpeg", "png"],
} as const satisfies Record<string, readonly string[]>;

export type FileFormat = keyof typeof FILE_FORMATS;
export const FORMAT_KEYS = Object.keys(FILE_FORMATS) as FileFormat[];
export const isFileFormat = (v: unknown): v is FileFormat => typeof v === "string" && v in FILE_FORMATS;

/** Per file, so one upload stays under Vercel's 4.5 MB request limit. */
export const MAX_FILE_MB = 4;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const MAX_FILES = 5;

export const extOf = (name: string) => /\.([a-z0-9]{1,8})$/i.exec(name)?.[1].toLowerCase() ?? "";

export const extensionsOf = (formats: readonly string[]) => formats.filter(isFileFormat).flatMap((f) => FILE_FORMATS[f]);

/** The extension decides, not the browser's MIME type (it is empty for .ipynb and varies for .pptx). */
export const acceptsFile = (formats: readonly string[], name: string) => (extensionsOf(formats) as string[]).includes(extOf(name));

/** `accept` attribute of the file picker: ".pdf,.ppt,.pptx". */
export const acceptAttr = (formats: readonly string[]) => extensionsOf(formats).map((e) => "." + e).join(",");

export interface FileRules {
  due_at: Date | string;
  /** null: the deadline takes no files (a test in Canvas, a talk…), students tick it off instead. */
  file_types: string[] | null;
  allow_late: boolean;
}

/**
 * "none": no files on this deadline. "open": before the due time. "late": after it, and the teacher
 * accepts late work (the delay is shown). "closed": after it, uploads are off.
 */
export function uploadState(d: FileRules, now = new Date()): "none" | "open" | "late" | "closed" {
  if (!d.file_types) return "none";
  if (now.getTime() <= new Date(d.due_at).getTime()) return "open";
  return d.allow_late ? "late" : "closed";
}

/** How late a file came, in ms (0 when on time). Shown as at least a minute. */
export function lateBy(due: Date | string, uploadedAt: Date | string) {
  const ms = new Date(uploadedAt).getTime() - new Date(due).getTime();
  return ms > 0 ? Math.max(MIN, ms) : 0;
}

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ipynb: "application/x-ipynb+json",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** Content type to serve a stored file with, and whether the browser may show it in place. */
export function servedAs(name: string) {
  const ext = extOf(name);
  return { type: TYPES[ext] ?? "application/octet-stream", inline: ["pdf", "jpg", "jpeg", "png"].includes(ext) };
}

/** "12 КБ", "1,4 МБ" */
export function fileSize(bytes: number, locale: string) {
  const kb = bytes / 1024;
  const unit = locale === "en" ? ["KB", "MB"] : ["КБ", "МБ"];
  return kb < 1024 ? `${Math.max(1, Math.round(kb))} ${unit[0]}` : `${(kb / 1024).toLocaleString(locale === "kk" ? "kk-KZ" : locale, { maximumFractionDigits: 1 })} ${unit[1]}`;
}
