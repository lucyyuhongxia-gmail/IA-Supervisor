import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const officialClassName = "IB CS IA 2027 Official Examples";

type HealthTone = "ok" | "warning" | "critical" | "neutral";

type HealthItem = {
  label: string;
  value: string;
  tone: HealthTone;
  detail?: string;
};

export default async function AdminSystemPage() {
  const user = await getCurrentUser();

  if (!user) {
    return <AdminAccessMessage title="Sign in required" description="Use an admin account to view system status." />;
  }

  if (user.role !== "admin") {
    return <AdminAccessMessage title="Admin account required" description="System status is reserved for platform admins." />;
  }

  const [
    roleCounts,
    subjectCount,
    activeSubjectCount,
    classCount,
    enrollmentCount,
    criterionSlotCount,
    deliverableSlotCount,
    aiReviewStatusCounts,
    feedbackStatusCounts,
    activeAssessmentReferences,
    officialFixture,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.subject.count(),
    prisma.subject.count({ where: { isArchived: false } }),
    prisma.class.count({ where: { isArchived: false } }),
    prisma.enrollment.count(),
    prisma.submissionSlot.count(),
    prisma.deliverableSubmissionSlot.count(),
    prisma.aIReviewRun.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.feedbackSnapshot.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.assessmentReference.findMany({
      where: {
        activeForSubjects: {
          some: { isArchived: false },
        },
      },
      select: {
        key: true,
        title: true,
        files: { select: { id: true, fileName: true } },
        activeForSubjects: {
          where: { isArchived: false },
          select: { id: true, name: true },
        },
      },
      orderBy: { title: "asc" },
    }),
    getOfficialFixtureStatus(),
  ]);

  const roleCountMap = new Map(
    roleCounts.map((row) => [row.role, row._count._all]),
  );
  const aiReviewCountMap = new Map(
    aiReviewStatusCounts.map((row) => [row.status, row._count._all]),
  );
  const feedbackCountMap = new Map(
    feedbackStatusCounts.map((row) => [row.status, row._count._all]),
  );
  const provider = getConfiguredProvider();
  const checks = getHealthChecks({
    provider,
    roleCountMap,
    activeAssessmentReferences,
    officialFixture,
    failedAIReviewCount: aiReviewCountMap.get("failed") ?? 0,
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Admin workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            System status
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Read-only local health overview for setup, AI review configuration, and seeded test data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/subjects">Subjects</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/assessment">Assessment reference</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((item) => (
          <StatusCard key={item.label} item={item} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI provider configuration</CardTitle>
            <CardDescription>
              Secrets are masked. Run the CLI preflight before real AI review batches.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm">
              <KeyValue label="Provider" value={provider.provider} />
              <KeyValue label="Model" value={provider.modelName} />
              <KeyValue label="Base URL" value={provider.baseUrl} />
              <KeyValue label="API key" value={provider.maskedApiKey} />
              <KeyValue
                label="Preflight"
                value="npm run ai-review:check-provider"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Core data</CardTitle>
            <CardDescription>
              Current database shape across users, classes, and submission records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Metric label="Admins" value={roleCountMap.get("admin") ?? 0} />
              <Metric label="Teachers" value={roleCountMap.get("teacher") ?? 0} />
              <Metric label="Students" value={roleCountMap.get("student") ?? 0} />
              <Metric label="Subjects" value={`${activeSubjectCount}/${subjectCount} active`} />
              <Metric label="Classes" value={classCount} />
              <Metric label="Enrollments" value={enrollmentCount} />
              <Metric label="Criterion slots" value={criterionSlotCount} />
              <Metric label="Deliverable slots" value={deliverableSlotCount} />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assessment references</CardTitle>
            <CardDescription>
              Active standards used by AI review through subject mapping.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeAssessmentReferences.length > 0 ? (
              <div className="grid gap-3">
                {activeAssessmentReferences.map((reference) => (
                  <div key={reference.key} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">{reference.title}</p>
                        <p className="text-muted-foreground">{reference.key}</p>
                      </div>
                      <StatusBadge tone={reference.files.length >= 3 ? "ok" : "warning"}>
                        {reference.files.length} files
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-muted-foreground">
                      Subjects: {reference.activeForSubjects.map((subject) => subject.name).join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-amber-700">
                No active assessment reference is mapped to an active subject.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Official example fixture</CardTitle>
            <CardDescription>
              Local benchmark readiness for the eight official IA example students.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Metric label="Class" value={officialFixture.exists ? "Present" : "Missing"} />
              <Metric label="Students" value={officialFixture.studentCount} />
              <Metric label="Criterion slots" value={officialFixture.criterionSlotCount} />
              <Metric label="Deliverable slots" value={officialFixture.deliverableSlotCount} />
              <Metric label="File assets" value={officialFixture.fileAssetCount} />
              <Metric label="AI review runs" value={officialFixture.aiReviewRunCount} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Expected setup: 8 students, 40 criterion slots, 56 deliverable slots, and 120 file assets.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI review runs</CardTitle>
            <CardDescription>
              Stored provider runs by status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <Metric label="Completed" value={aiReviewCountMap.get("completed") ?? 0} />
              <Metric label="Pending" value={aiReviewCountMap.get("pending") ?? 0} />
              <Metric label="Failed" value={aiReviewCountMap.get("failed") ?? 0} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Feedback snapshots</CardTitle>
            <CardDescription>
              Teacher feedback lifecycle records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <Metric label="Draft" value={feedbackCountMap.get("draft") ?? 0} />
              <Metric label="Approved" value={feedbackCountMap.get("approved") ?? 0} />
              <Metric label="Sent" value={feedbackCountMap.get("sent") ?? 0} />
              <Metric label="Superseded" value={feedbackCountMap.get("superseded") ?? 0} />
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

async function getOfficialFixtureStatus() {
  const classRecord = await prisma.class.findFirst({
    where: { name: officialClassName },
    include: {
      enrollments: { select: { id: true } },
    },
  });

  if (!classRecord) {
    return {
      exists: false,
      studentCount: 0,
      criterionSlotCount: 0,
      deliverableSlotCount: 0,
      fileAssetCount: 0,
      aiReviewRunCount: 0,
    };
  }

  const enrollmentIds = classRecord.enrollments.map((enrollment) => enrollment.id);
  const [
    criterionSlotCount,
    deliverableSlotCount,
    fileAssetCount,
    aiReviewRunCount,
  ] = await Promise.all([
    prisma.submissionSlot.count({
      where: { enrollmentId: { in: enrollmentIds } },
    }),
    prisma.deliverableSubmissionSlot.count({
      where: { enrollmentId: { in: enrollmentIds } },
    }),
    prisma.fileAsset.count({
      where: {
        owner: {
          enrollments: {
            some: { classId: classRecord.id },
          },
        },
      },
    }),
    prisma.aIReviewRun.count({
      where: {
        submissionSlot: {
          enrollmentId: { in: enrollmentIds },
        },
      },
    }),
  ]);

  return {
    exists: true,
    studentCount: classRecord.enrollments.length,
    criterionSlotCount,
    deliverableSlotCount,
    fileAssetCount,
    aiReviewRunCount,
  };
}

function getConfiguredProvider() {
  const provider =
    process.env.AI_REVIEW_PROVIDER?.trim().toLowerCase() ||
    (process.env.DEEPSEEK_API_KEY ? "deepseek" : "mock");
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim() ?? "";

  return {
    provider,
    baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    modelName: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
    maskedApiKey: maskSecret(apiKey),
    hasApiKey: Boolean(apiKey),
  };
}

function getHealthChecks({
  provider,
  roleCountMap,
  activeAssessmentReferences,
  officialFixture,
  failedAIReviewCount,
}: {
  provider: ReturnType<typeof getConfiguredProvider>;
  roleCountMap: Map<string, number>;
  activeAssessmentReferences: Array<{ files: Array<{ id: string }> }>;
  officialFixture: Awaited<ReturnType<typeof getOfficialFixtureStatus>>;
  failedAIReviewCount: number;
}): HealthItem[] {
  const hasSeedUsers =
    (roleCountMap.get("admin") ?? 0) > 0 &&
    (roleCountMap.get("teacher") ?? 0) > 0 &&
    (roleCountMap.get("student") ?? 0) > 0;
  const referencesReady =
    activeAssessmentReferences.length > 0 &&
    activeAssessmentReferences.every((reference) => reference.files.length >= 3);
  const fixtureReady =
    officialFixture.exists &&
    officialFixture.studentCount === 8 &&
    officialFixture.criterionSlotCount === 40 &&
    officialFixture.deliverableSlotCount === 56 &&
    officialFixture.fileAssetCount === 120;
  const providerReady =
    provider.provider === "mock" ||
    (provider.provider === "deepseek" && provider.hasApiKey);

  return [
    {
      label: "Seed users",
      value: hasSeedUsers ? "Ready" : "Needs seed",
      tone: hasSeedUsers ? "ok" : "warning",
      detail: hasSeedUsers
        ? "Admin, teacher, and student roles exist."
        : "Run npx prisma db seed.",
    },
    {
      label: "Assessment reference",
      value: referencesReady ? "Ready" : "Incomplete",
      tone: referencesReady ? "ok" : "critical",
      detail: referencesReady
        ? "Active subject references include expected files."
        : "Check admin assessment reference mapping.",
    },
    {
      label: "AI provider",
      value: providerReady ? provider.provider : "Needs key",
      tone: providerReady ? "ok" : "warning",
      detail:
        provider.provider === "deepseek"
          ? "Use npm run ai-review:check-provider before real reviews."
          : "Mock mode is suitable for local workflow testing.",
    },
    {
      label: "Official fixture",
      value: fixtureReady ? "Ready" : "Missing",
      tone: fixtureReady ? "ok" : "warning",
      detail: fixtureReady
        ? "Official example benchmark data is loaded."
        : "Run npm run demo:official-examples.",
    },
    {
      label: "Failed AI runs",
      value: String(failedAIReviewCount),
      tone: failedAIReviewCount > 0 ? "warning" : "ok",
      detail:
        failedAIReviewCount > 0
          ? "Review failed rows before trusting queue health."
          : "No failed AI review rows are stored.",
    },
  ];
}

function StatusCard({ item }: { item: HealthItem }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{item.label}</CardTitle>
          <StatusBadge tone={item.tone}>{item.value}</StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {item.detail ? (
          <p className="text-sm text-muted-foreground">{item.detail}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-medium">{label}</span>
      <span className="break-all text-muted-foreground">{value}</span>
    </div>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: HealthTone;
}) {
  return (
    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${getToneClass(tone)}`}>
      {children}
    </span>
  );
}

function getToneClass(tone: HealthTone) {
  switch (tone) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "critical":
      return "border-red-200 bg-red-50 text-red-800";
    case "neutral":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function maskSecret(value: string) {
  if (!value) {
    return "(empty)";
  }

  return value.length <= 8 ? "****" : `****${value.slice(-4)}`;
}

function AdminAccessMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/login">Go to login</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
