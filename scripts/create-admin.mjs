#!/usr/bin/env node

import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();
  const name = process.env.ADMIN_NAME?.trim() || "System Admin";

  if (!email || !email.includes("@")) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }

  if (!password || password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: "admin",
      passwordHash,
    },
    create: {
      email,
      name,
      role: "admin",
      passwordHash,
    },
    select: {
      email: true,
      name: true,
      role: true,
    },
  });

  console.log(`Admin account ready: ${user.email} (${user.name}, ${user.role})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
