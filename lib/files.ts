import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const maxUploadSizeBytes = 25 * 1024 * 1024;

export const allowedUploadTypes = new Map([
  ["application/pdf", ".pdf"],
]);

const uploadRoot = path.join(process.cwd(), "uploads");

export function getUploadRoot() {
  return uploadRoot;
}

export function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function getUploadExtension(file: File) {
  const extension = path.extname(file.name).toLowerCase();

  if (file.type === "application/pdf" || extension === ".pdf") {
    return ".pdf";
  }

  return allowedUploadTypes.get(file.type) ?? null;
}

export async function saveUploadedFile(file: File) {
  const extension = getUploadExtension(file);

  if (!extension) {
    throw new Error("Only PDF files are supported.");
  }

  if (file.size > maxUploadSizeBytes) {
    throw new Error("File must be 25 MB or smaller.");
  }

  const originalName = sanitizeFileName(file.name || `upload${extension}`);
  const storedName = `${randomUUID()}${extension}`;
  const storagePath = path.join(uploadRoot, storedName);

  await mkdir(uploadRoot, { recursive: true });
  await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));

  return {
    originalName,
    storedName,
    storagePath,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

export async function deleteStoredFile(storagePath: string) {
  await unlink(storagePath).catch((error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  });
}

export function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
