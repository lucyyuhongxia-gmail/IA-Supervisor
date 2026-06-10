import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

import { Breadcrumbs } from "./breadcrumbs";
import { SignOutButton } from "./sign-out-button";
import { TeacherClassSwitcher } from "./teacher-class-switcher";

export async function GlobalNav() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  if (!user.role) {
    return null;
  }

  const role = user.role;
  const teacherClasses =
    role === "teacher"
      ? await prisma.class.findMany({
          where: { teacherId: user.id, isArchived: false },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            examSession: true,
          },
        })
      : [];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur print:hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={getHomeHref(role)}
            className="text-base font-semibold tracking-normal"
          >
            IA Supervisor
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            {getNavItems(role).map((item) => (
              <Button key={item.href} asChild variant="ghost" size="sm">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
          {role === "teacher" ? (
            <TeacherClassSwitcher classes={teacherClasses} />
          ) : null}
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{user.name ?? "User"}</p>
              <p>
                {formatRole(role)} · {user.email ?? ""}
              </p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </div>
      <Breadcrumbs teacherClasses={teacherClasses} />
    </header>
  );
}

function getHomeHref(role: string) {
  switch (role) {
    case "teacher":
      return "/teacher/dashboard";
    case "student":
      return "/student/dashboard";
    case "admin":
      return "/admin/subjects";
    default:
      return "/login";
  }
}

function getNavItems(role: string) {
  switch (role) {
    case "teacher":
      return [
        { label: "Dashboard", href: "/teacher/dashboard" },
      ];
    case "student":
      return [
        { label: "Dashboard", href: "/student/dashboard" },
      ];
    case "admin":
      return [
        { label: "Subjects", href: "/admin/subjects" },
        { label: "Assessment", href: "/admin/assessment" },
        { label: "System", href: "/admin/system" },
      ];
    default:
      return [];
  }
}

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
