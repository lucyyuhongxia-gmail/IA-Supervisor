import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const maxUploadSizeBytes = 25 * 1024 * 1024;

export const allowedUploadTypes = new Map([
  ["application/pdf", ".pdf"],
]);

const uploadRoot = path.join(process.cwd(), "uploads");
const supabaseStoragePrefix = "supabase://";

export function getUploadRoot() {
  return uploadRoot;
}

export function getFileStorageProvider() {
  return process.env.FILE_STORAGE_PROVIDER?.trim().toLowerCase() || "local";
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
  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = await writeStoredFile({
    buffer,
    storedName,
    mimeType: file.type || "application/octet-stream",
  });

  return {
    originalName,
    storedName,
    storagePath,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

export async function readStoredFile(storagePath: string) {
  const supabaseObject = parseSupabaseStoragePath(storagePath);

  if (!supabaseObject) {
    return readFile(storagePath);
  }

  const client = getSupabaseStorageClient();
  const { data, error } = await client.storage
    .from(supabaseObject.bucket)
    .download(supabaseObject.objectPath);

  if (error) {
    throw new Error(`Could not download stored file: ${error.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function deleteStoredFile(storagePath: string) {
  const supabaseObject = parseSupabaseStoragePath(storagePath);

  if (supabaseObject) {
    const client = getSupabaseStorageClient();
    const { error } = await client.storage
      .from(supabaseObject.bucket)
      .remove([supabaseObject.objectPath]);

    if (error) {
      throw new Error(`Could not delete stored file: ${error.message}`);
    }

    return;
  }

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

async function writeStoredFile({
  buffer,
  mimeType,
  storedName,
}: {
  buffer: Buffer;
  mimeType: string;
  storedName: string;
}) {
  const provider = getFileStorageProvider();

  if (provider === "local") {
    const storagePath = path.join(uploadRoot, storedName);

    await mkdir(uploadRoot, { recursive: true });
    await writeFile(storagePath, buffer);

    return storagePath;
  }

  if (provider === "supabase") {
    const bucket = getSupabaseStorageBucket();
    const objectPath = `uploads/${storedName}`;
    const client = getSupabaseStorageClient();
    const { error } = await client.storage.from(bucket).upload(objectPath, buffer, {
      cacheControl: "3600",
      contentType: mimeType,
      upsert: false,
    });

    if (error) {
      throw new Error(`Could not upload file to Supabase Storage: ${error.message}`);
    }

    return `${supabaseStoragePrefix}${bucket}/${objectPath}`;
  }

  throw new Error(
    `Unsupported FILE_STORAGE_PROVIDER "${provider}". Use "local" or "supabase".`,
  );
}

function getSupabaseStorageClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when FILE_STORAGE_PROVIDER=supabase.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getSupabaseStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "ia-supervisor-uploads";
}

function parseSupabaseStoragePath(storagePath: string) {
  if (!storagePath.startsWith(supabaseStoragePrefix)) {
    return null;
  }

  const value = storagePath.slice(supabaseStoragePrefix.length);
  const separatorIndex = value.indexOf("/");

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(`Invalid Supabase storage path: ${storagePath}`);
  }

  return {
    bucket: value.slice(0, separatorIndex),
    objectPath: value.slice(separatorIndex + 1),
  };
}
