#!/usr/bin/env node

import "dotenv/config";

const defaultDeepSeekBaseUrl = "https://api.deepseek.com";
const defaultDeepSeekModel = "deepseek-chat";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const config = getConfig(args);

  if (config.provider === "mock") {
    console.log("AI review provider check passed.");
    console.log("Provider: mock");
    console.log("Model: mock-ai-review");
    console.log("Network call: skipped");
    return;
  }

  if (config.provider !== "deepseek") {
    return fail({
      args,
      message: `Unsupported AI_REVIEW_PROVIDER: ${config.provider}`,
      detail: "Supported values are mock and deepseek.",
    });
  }

  if (!config.apiKey) {
    return fail({
      args,
      message: "DEEPSEEK_API_KEY is required for AI_REVIEW_PROVIDER=deepseek.",
      detail: "Set DEEPSEEK_API_KEY in .env, then rerun this command.",
    });
  }

  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelName,
        temperature: 0,
        max_tokens: 12,
        messages: [
          {
            role: "system",
            content: "Return only the word OK.",
          },
          {
            role: "user",
            content: "Provider health check.",
          },
        ],
      }),
    });
    const elapsedMs = Date.now() - startedAt;
    const body = await response.text();

    if (!response.ok) {
      return fail({
        args,
        message: `DeepSeek provider check failed: HTTP ${response.status}`,
        detail: scrubSecrets(body, config.apiKey),
      });
    }

    const payload = parseJson(body);
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      return fail({
        args,
        message: "DeepSeek provider check failed: empty model response.",
        detail: scrubSecrets(body, config.apiKey),
      });
    }

    console.log("AI review provider check passed.");
    console.log(`Provider: deepseek`);
    console.log(`Base URL: ${config.baseUrl}`);
    console.log(`Model: ${config.modelName}`);
    console.log(`API key: ${maskSecret(config.apiKey)}`);
    console.log(`Latency: ${elapsedMs} ms`);
    console.log(`Response preview: ${content.trim().slice(0, 80)}`);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `DeepSeek provider check timed out after ${args.timeoutMs} ms.`
        : error instanceof Error
          ? error.message
          : "Unknown provider check error.";

    return fail({
      args,
      message,
      detail: `Endpoint: ${endpoint}`,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv) {
  const args = {
    allowFail: false,
    baseUrl: "",
    help: false,
    model: "",
    provider: "",
    timeoutMs: 15000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--allow-fail":
        args.allowFail = true;
        break;
      case "--base-url":
        args.baseUrl = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--model":
        args.model = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--provider":
        args.provider = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--timeout-ms": {
        const value = Number(requireValue(argv, index, arg));

        if (!Number.isInteger(value) || value < 1000) {
          throw new Error("--timeout-ms must be an integer >= 1000.");
        }

        args.timeoutMs = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function getConfig(args) {
  const provider =
    args.provider.trim().toLowerCase() ||
    process.env.AI_REVIEW_PROVIDER?.trim().toLowerCase() ||
    (process.env.DEEPSEEK_API_KEY ? "deepseek" : "mock");

  return {
    provider,
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? "",
    baseUrl:
      args.baseUrl.trim() ||
      process.env.DEEPSEEK_BASE_URL?.trim() ||
      defaultDeepSeekBaseUrl,
    modelName:
      args.model.trim() ||
      process.env.DEEPSEEK_MODEL?.trim() ||
      defaultDeepSeekModel,
  };
}

function printHelp() {
  console.log(`AI review provider preflight

Usage:
  npm run ai-review:check-provider
  npm run ai-review:check-provider -- --allow-fail
  npm run ai-review:check-provider -- --provider mock
  npm run ai-review:check-provider -- --model deepseek-chat

The command loads .env, masks secrets in output, and performs one minimal
OpenAI-compatible chat completions request when provider=deepseek.`);
}

function fail({ args, message, detail }) {
  console.error(message);

  if (detail) {
    console.error(detail);
  }

  if (!args.allowFail) {
    process.exitCode = 1;
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function maskSecret(value) {
  if (!value) {
    return "(empty)";
  }

  return value.length <= 8 ? "****" : `****${value.slice(-4)}`;
}

function scrubSecrets(value, secret) {
  if (!value) {
    return value;
  }

  const withoutKnownSecret = secret
    ? value.split(secret).join("[redacted-api-key]")
    : value;

  return withoutKnownSecret.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted-api-key]");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
