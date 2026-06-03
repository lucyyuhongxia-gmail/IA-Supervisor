import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import type { UserRole } from "@/types/roles";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export function hasRole(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  role: UserRole,
) {
  return user?.role === role;
}

