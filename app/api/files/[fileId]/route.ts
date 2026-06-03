import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const user = await getCurrentUser();
  const { fileId } = await params;

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const fileAsset = await prisma.fileAsset.findUnique({
    where: { id: fileId },
    include: {
      submissionSlot: {
        include: {
          enrollment: {
            include: {
              class: { select: { teacherId: true } },
            },
          },
        },
      },
      submissionVersion: {
        include: {
          submissionSlot: {
            include: {
              enrollment: {
                include: {
                  class: { select: { teacherId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!fileAsset) {
    return new NextResponse("Not found", { status: 404 });
  }

  const slot = fileAsset.submissionSlot ?? fileAsset.submissionVersion?.submissionSlot;

  if (!slot) {
    return new NextResponse("Not found", { status: 404 });
  }

  const canAccess =
    user.role === "admin" ||
    fileAsset.ownerId === user.id ||
    slot.enrollment.studentId === user.id ||
    slot.enrollment.class.teacherId === user.id;

  if (!canAccess) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const fileBuffer = await readFile(fileAsset.storagePath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": fileAsset.mimeType,
      "Content-Length": fileAsset.sizeBytes.toString(),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(
        fileAsset.originalName,
      )}"`,
    },
  });
}
