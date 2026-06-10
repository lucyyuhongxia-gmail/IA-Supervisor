#!/usr/bin/env tsx

import "dotenv/config";

import {
  checkAIReviewProvider,
  formatProviderCheckResult,
  getAIReviewProviderCheckConfig,
} from "./lib/ai-provider-check";

type Args = {
  allowFail: boolean;
  baseUrl: string;
  help: boolean;
  model: string;
  provider: string;
  timeoutMs: number;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const result = await checkAIReviewProvider({
    config: getAIReviewProviderCheckConfig({
      baseUrl: args.baseUrl,
      model: args.model,
      provider: args.provider,
    }),
    timeoutMs: args.timeoutMs,
  });

  const output = formatProviderCheckResult(result);

  if (result.ok) {
    console.log(output);
    return;
  }

  console.error(output);

  if (!args.allowFail) {
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
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

function requireValue(argv: string[], index: number, flag: string) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
