export const userRoles = ["teacher", "student", "admin"] as const;

export type UserRole = (typeof userRoles)[number];
