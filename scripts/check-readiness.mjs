#!/usr/bin/env node

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

const defaultDeepSeekBaseUrl = "https://api.deepseek.com";
const defaultDeepSeekModel = "deepseek-v4-flash";
const placeholderPatterns = [
  /^replace-/i,
  /your-/i,
  /placeholder/i,
  /example/i,
];

const args = new Set(process.argv.slice(2));
const productionMode = args.has("--production");

const results = [];

checkRequired("DATABASE_URL", process.env.DATABASE_URL);
checkPostgresUrl("DATABASE_URL", process.env.DATABASE_URL);
checkRequired("NEXTAUTH_URL", process.env.NEXTAUTH_URL);
checkUrl("NEXTAUTH_URL", process.env.NEXTAUTH_URL, {
  requireHttps: productionMode,
});
checkSecret("NEXTAUTH_SECRET", process.env.NEXTAUTH_SECRET, {
  minLength: productionMode ? 32 : 16,
});
checkSecret("TEACHER_SIGNUP_CODE", process.env.TEACHER_SIGNUP_CODE, {
  minLength: 8,
});
checkAIProvider();
checkUploadsDirectory();

if (productionMode) {
  warn(
    "FILE_STORAGE",
    "Uploaded files still use local disk storage. Production should run on durable private storage or a persistent volume with backups.",
  );
  warn(
    "RATE_LIMITING",
    "Rate limits are in-memory only. Multi-instance deployments need Redis or database-backed limits.",
  );
}

printResults();

const failures = results.filter((result) => result.level === "fail");
if (failures.length > 0) {
  process.exitCode = 1;
}

function checkAIProvider() {
  const provider =
    process.env.AI_REVIEW_PROVIDER?.trim().toLowerCase() ||
    (process.env.DEEPSEEK_API_KEY ? "deepseek" : "mock");

  if (!["mock", "deepseek"].includes(provider)) {
    fail(
      "AI_REVIEW_PROVIDER",
      `Unsupported provider "${provider}". Use "mock" or "deepseek".`,
    );
    return;
  }

  if (provider === "mock") {
    if (productionMode) {
      fail(
        "AI_REVIEW_PROVIDER",
        "Production readiness requires AI_REVIEW_PROVIDER=\"deepseek\".",
      );
    } else {
      pass("AI_REVIEW_PROVIDER", "mock provider is valid for local testing.");
    }
    return;
  }

  checkSecret("DEEPSEEK_API_KEY", process.env.DEEPSEEK_API_KEY, {
    minLength: 16,
  });
  checkUrl("DEEPSEEK_BASE_URL", process.env.DEEPSEEK_BASE_URL || defaultDeepSeekBaseUrl, {
    requireHttps: true,
  });

  const model = process.env.DEEPSEEK_MODEL?.trim() || defaultDeepSeekModel;
  if (!model) {
    fail("DEEPSEEK_MODEL", "DeepSeek model is required when provider=deepseek.");
  } else if (isPlaceholder(model)) {
    fail("DEEPSEEK_MODEL", "DeepSeek model still looks like a placeholder.");
  } else {
    pass("DEEPSEEK_MODEL", `model configured: ${model}`);
  }
}

function checkUploadsDirectory() {
  const uploadsPath = path.join(process.cwd(), "uploads");

  if (!fs.existsSync(uploadsPath)) {
    fail("uploads/", "uploads directory is missing.");
    return;
  }

  try {
    fs.accessSync(uploadsPath, fs.constants.R_OK | fs.constants.W_OK);
    pass("uploads/", "directory exists and is readable/writable.");
  } catch {
    fail("uploads/", "uploads directory is not readable/writable.");
  }
}

function checkRequired(name, value) {
  if (!value?.trim()) {
    fail(name, "required environment variable is missing.");
    return false;
  }

  pass(name, "present.");
  return true;
}

function checkSecret(name, value, { minLength }) {
  if (!value?.trim()) {
    fail(name, "required secret is missing.");
    return;
  }

  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    fail(name, `secret must be at least ${minLength} characters.`);
    return;
  }

  if (isPlaceholder(trimmed)) {
    fail(name, "secret still looks like a placeholder.");
    return;
  }

  pass(name, `configured (${trimmed.length} chars).`);
}

function checkPostgresUrl(name, value) {
  if (!value?.trim()) {
    return;
  }

  try {
    const parsed = new URL(value);
    if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
      fail(name, "must be a PostgreSQL connection URL.");
      return;
    }

    pass(name, `PostgreSQL host: ${parsed.hostname || "(socket)"}.`);
  } catch {
    fail(name, "must be a valid PostgreSQL connection URL.");
  }
}

function checkUrl(name, value, { requireHttps }) {
  if (!value?.trim()) {
    fail(name, "URL is missing.");
    return;
  }

  try {
    const parsed = new URL(value);
    if (requireHttps && parsed.protocol !== "https:") {
      fail(name, "must use https in production.");
      return;
    }

    pass(name, `URL is valid: ${parsed.origin}.`);
  } catch {
    fail(name, "must be a valid URL.");
  }
}

function isPlaceholder(value) {
  return placeholderPatterns.some((pattern) => pattern.test(value));
}

function pass(name, message) {
  results.push({ level: "pass", name, message });
}

function warn(name, message) {
  results.push({ level: "warn", name, message });
}

function fail(name, message) {
  results.push({ level: "fail", name, message });
}

function printResults() {
  console.log(
    productionMode
      ? "Production readiness check\n"
      : "Local readiness check\n",
  );

  for (const result of results) {
    const marker =
      result.level === "pass" ? "PASS" : result.level === "warn" ? "WARN" : "FAIL";
    console.log(`[${marker}] ${result.name}: ${result.message}`);
  }

  const counts = results.reduce(
    (acc, result) => {
      acc[result.level] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );

  console.log(
    `\nSummary: ${counts.pass} passed, ${counts.warn} warnings, ${counts.fail} failed.`,
  );
}
