"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TeacherClassOption = {
  id: string;
  name: string;
};

type BreadcrumbsProps = {
  teacherClasses: TeacherClassOption[];
};

type Crumb = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ teacherClasses }: BreadcrumbsProps) {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname, teacherClasses);

  if (crumbs.length <= 1) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="border-t bg-background/80 px-6 py-2">
      <ol className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
            {index > 0 ? <span>/</span> : null}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <span>{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function getBreadcrumbs(pathname: string, teacherClasses: TeacherClassOption[]) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0 || segments[0] === "login" || segments[0] === "register") {
    return [];
  }

  if (segments[0] === "teacher") {
    return getTeacherBreadcrumbs(segments, teacherClasses);
  }

  if (segments[0] === "student") {
    return getStudentBreadcrumbs(segments);
  }

  if (segments[0] === "admin") {
    return [
      { label: "Admin", href: "/admin/assessment" },
      { label: "Assessment" },
    ];
  }

  return [];
}

function getTeacherBreadcrumbs(
  segments: string[],
  teacherClasses: TeacherClassOption[],
): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Teacher", href: "/teacher/dashboard" }];

  if (segments[1] === "dashboard") {
    crumbs.push({ label: "Dashboard" });
    return crumbs;
  }

  if (segments[1] === "classes" && segments[2]) {
    const classId = segments[2];
    const className =
      teacherClasses.find((classRecord) => classRecord.id === classId)?.name ??
      "Class";

    crumbs.push({
      label: className,
      href: `/teacher/classes/${classId}`,
    });

    if (segments[3] === "analytics") {
      crumbs.push({ label: "Analytics" });
    }

    if (segments[3] === "students") {
      crumbs.push({ label: "Student" });

      if (segments[5] === "criteria") {
        crumbs.push({ label: "Criterion review" });
      }
    }
  }

  return crumbs;
}

function getStudentBreadcrumbs(segments: string[]): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Student", href: "/student/dashboard" }];

  if (segments[1] === "dashboard") {
    crumbs.push({ label: "Dashboard" });
    return crumbs;
  }

  if (segments[1] === "classes" && segments[2]) {
    crumbs.push({
      label: "Class",
      href: `/student/classes/${segments[2]}`,
    });

    if (segments[3] === "criteria") {
      crumbs.push({ label: "Criterion submission" });
    }
  }

  return crumbs;
}
