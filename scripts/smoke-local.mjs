import "dotenv/config";

import { spawn } from "node:child_process";

const defaultPort = 3210;
const defaultBaseUrl = `http://127.0.0.1:${defaultPort}`;

const args = new Set(process.argv.slice(2));
const baseUrlArg = process.argv.find((arg) => arg.startsWith("--base-url="));
const baseUrl = normalizeBaseUrl(baseUrlArg?.split("=")[1] ?? defaultBaseUrl);
const shouldStartServer = !baseUrlArg && !args.has("--no-start");

let serverProcess = null;

async function main() {
  if (shouldStartServer) {
    serverProcess = startServer();
  }

  await waitForServer(baseUrl);

  await verifyLogin({
    label: "Admin",
    email: "admin@example.com",
    password: "password123",
    role: "admin",
    path: "/admin/assessment",
    expectedText: "Assessment reference",
  });
  await verifyAuthenticatedPage({
    label: "Admin system",
    path: "/admin/system",
    expectedText: "System status",
    jar: currentJar,
  });

  await verifyLogin({
    label: "Teacher",
    email: "lucy_yu@ulink.cn",
    password: "password123",
    role: "teacher",
    path: "/teacher/dashboard",
    expectedText: "Review queue",
  });

  await verifyLogin({
    label: "Official student",
    email: "official-example-1@student.test",
    password: "password123",
    role: "student",
    path: "/student/dashboard",
    expectedText: "IB CS IA 2027 Official Examples",
  });

  console.log("\nLocal app smoke test passed.");
}

function startServer() {
  console.log(`Starting local Next server on ${baseUrl}`);

  const child = spawn("npm", [
    "run",
    "dev",
    "--",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(defaultPort),
  ], {
    env: {
      ...process.env,
      NEXTAUTH_URL: baseUrl,
      AI_REVIEW_PROVIDER: "mock",
      DEEPSEEK_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    if (text.includes("Ready") || text.includes("Local:")) {
      process.stdout.write(text);
    }
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  child.on("exit", (code) => {
    if (code !== null && code !== 0 && process.exitCode !== 0) {
      process.stderr.write(`Local server exited with code ${code}.\n`);
    }
  });

  return child;
}

async function waitForServer(url) {
  const startedAt = Date.now();
  const timeoutMs = 90_000;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${url}/login`, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Server is not ready yet.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function verifyLogin({ label, email, password, role, path, expectedText }) {
  console.log(`\n== ${label} smoke ==`);

  const jar = new CookieJar();
  const csrfResponse = await request("/api/auth/csrf", { jar });
  const csrfBody = await csrfResponse.json();

  if (!csrfBody.csrfToken) {
    throw new Error(`${label}: missing CSRF token.`);
  }

  const callbackResponse = await request("/api/auth/callback/credentials?json=true", {
    jar,
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csrfToken: csrfBody.csrfToken,
      email,
      password,
      redirect: "false",
      json: "true",
      callbackUrl: `${baseUrl}${path}`,
    }),
  });

  if (!callbackResponse.ok) {
    throw new Error(`${label}: login failed with HTTP ${callbackResponse.status}.`);
  }

  const sessionResponse = await request("/api/auth/session", { jar });
  const session = await sessionResponse.json();
  if (session.user?.role !== role) {
    throw new Error(`${label}: expected role ${role}, received ${session.user?.role ?? "none"}.`);
  }

  const pageResponse = await request(path, { jar });
  const html = await pageResponse.text();

  if (!pageResponse.ok) {
    throw new Error(`${label}: ${path} returned HTTP ${pageResponse.status}.`);
  }

  if (!html.includes(expectedText)) {
    throw new Error(`${label}: ${path} did not include expected text: ${expectedText}.`);
  }

  console.log(`${label}: ${path} OK`);
  currentJar = jar;
}

let currentJar = null;

async function verifyAuthenticatedPage({ label, path, expectedText, jar }) {
  if (!jar) {
    throw new Error(`${label}: no authenticated session is available.`);
  }

  const pageResponse = await request(path, { jar });
  const html = await pageResponse.text();

  if (!pageResponse.ok) {
    throw new Error(`${label}: ${path} returned HTTP ${pageResponse.status}.`);
  }

  if (!html.includes(expectedText)) {
    throw new Error(`${label}: ${path} did not include expected text: ${expectedText}.`);
  }

  console.log(`${label}: ${path} OK`);
}

async function request(path, options = {}) {
  const jar = options.jar;
  const headers = new Headers(options.headers ?? {});

  if (jar) {
    const cookieHeader = jar.header();
    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    redirect: "manual",
  });

  if (jar) {
    jar.store(response.headers);
  }

  return response;
}

class CookieJar {
  #cookies = new Map();

  store(headers) {
    for (const cookie of getSetCookies(headers)) {
      const [pair] = cookie.split(";");
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      this.#cookies.set(name, value);
    }
  }

  header() {
    return [...this.#cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  if (!combined) {
    return [];
  }

  return splitCombinedSetCookieHeader(combined);
}

function splitCombinedSetCookieHeader(header) {
  const cookies = [];
  let start = 0;
  let inExpires = false;

  for (let index = 0; index < header.length; index += 1) {
    const slice = header.slice(index, index + 8).toLowerCase();
    if (slice === "expires") {
      inExpires = true;
    }

    if (inExpires && header[index] === ";") {
      inExpires = false;
    }

    if (!inExpires && header[index] === ",") {
      cookies.push(header.slice(start, index).trim());
      start = index + 1;
    }
  }

  cookies.push(header.slice(start).trim());
  return cookies.filter(Boolean);
}

function normalizeBaseUrl(url) {
  return url.replace(/\/$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("exit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

process.on("SIGINT", () => {
  process.exitCode = 130;
  process.exit();
});

process.on("SIGTERM", () => {
  process.exitCode = 143;
  process.exit();
});

main()
  .catch((error) => {
    console.error(`\nLocal app smoke test failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
    }
  });
