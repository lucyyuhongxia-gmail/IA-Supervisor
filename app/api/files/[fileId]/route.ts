import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { readStoredFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const user = await getCurrentUser();
  const { fileId } = await params;
  const requestUrl = new URL(request.url);

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
      deliverableSubmissionSlot: {
        include: {
          enrollment: {
            include: {
              class: { select: { teacherId: true } },
            },
          },
        },
      },
      deliverableSubmissionVersion: {
        include: {
          deliverableSubmissionSlot: {
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

  const submissionSlot =
    fileAsset.submissionSlot ?? fileAsset.submissionVersion?.submissionSlot;
  const deliverableSlot =
    fileAsset.deliverableSubmissionSlot ??
    fileAsset.deliverableSubmissionVersion?.deliverableSubmissionSlot;

  if (!submissionSlot && !deliverableSlot) {
    return new NextResponse("Not found", { status: 404 });
  }

  const canAccess =
    user.role === "admin" ||
    fileAsset.ownerId === user.id ||
    submissionSlot?.enrollment.studentId === user.id ||
    submissionSlot?.enrollment.class.teacherId === user.id ||
    deliverableSlot?.enrollment.studentId === user.id ||
    deliverableSlot?.enrollment.class.teacherId === user.id;

  if (!canAccess) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const fileBuffer = await readStoredFile(fileAsset.storagePath);
  const shouldPreviewInline =
    requestUrl.searchParams.get("disposition") === "inline" &&
    fileAsset.mimeType === "application/pdf";
  const disposition = shouldPreviewInline ? "inline" : "attachment";

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": fileAsset.mimeType,
      "Content-Length": fileAsset.sizeBytes.toString(),
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(
        fileAsset.originalName,
      )}"`,
    },
  });
}
