import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { FileAsset } from "@prisma/client";

export type FileExtractionResult = {
  text: string;
  status: "success" | "limited";
  characterCount: number;
  message?: string;
};

const maxExtractedTextCharacters = 22000;

export async function extractFileText(
  file: Pick<FileAsset, "originalName" | "mimeType" | "storagePath">,
): Promise<FileExtractionResult> {
  const text = await readSupportedFileText(file);
  const extractionFailed = isExtractionLimited(text);

  return {
    text,
    status: extractionFailed ? "limited" : "success",
    characterCount: extractionFailed ? 0 : text.length,
    message: extractionFailed ? text : undefined,
  };
}

async function readSupportedFileText(
  file: Pick<FileAsset, "originalName" | "mimeType" | "storagePath">,
) {
  const extension = path.extname(file.originalName).toLowerCase();
  const normalizedMimeType = file.mimeType.toLowerCase();
  const isTextLike =
    normalizedMimeType.startsWith("text/") ||
    [".txt", ".md", ".csv", ".json", ".ts", ".tsx", ".js", ".jsx"].includes(
      extension,
    );

  try {
    if (normalizedMimeType === "application/pdf" || extension === ".pdf") {
      return await extractPdfText(file.storagePath);
    }

    if (
      normalizedMimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      extension === ".docx"
    ) {
      return await extractDocxText(file.storagePath);
    }

    if (isTextLike) {
      const content = await readFile(file.storagePath, "utf8");

      return truncate(cleanExtractedText(content), maxExtractedTextCharacters);
    }

    return `Text extraction is not supported for ${extension || file.mimeType}.`;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown extraction error.";

    return `Text extraction failed for ${file.originalName}: ${message}`;
  }
}

async function extractPdfText(storagePath: string) {
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(
    pathToFileURL(
      path.join(
        process.cwd(),
        "node_modules",
        "pdfjs-dist",
        "legacy",
        "build",
        "pdf.worker.mjs",
      ),
    ).href,
  );

  const buffer = await readFile(storagePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText();

    return formatExtractedText(result.text, "PDF");
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(storagePath: string) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: storagePath });

  return formatExtractedText(result.value, "DOCX");
}

function formatExtractedText(value: string, fileType: string) {
  const cleaned = cleanExtractedText(value);

  if (!cleaned) {
    return `${fileType} text extraction completed, but no readable text was found. The file may be scanned, image-only, encrypted, or structurally unsupported.`;
  }

  return truncate(cleaned, maxExtractedTextCharacters);
}

function cleanExtractedText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isExtractionLimited(value: string) {
  return (
    value.includes("Text extraction is not supported") ||
    value.includes("Text extraction failed") ||
    value.includes("no readable text was found")
  );
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n[truncated]` : value;
}
