const defaultDeepSeekBaseUrl = "https://api.deepseek.com";
const defaultDeepSeekModel = "deepseek-chat";

export type AIReviewProviderCheckConfig = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
};

export type AIReviewProviderCheckResult = {
  ok: boolean;
  provider: string;
  baseUrl?: string;
  modelName: string;
  maskedApiKey?: string;
  latencyMs?: number;
  responsePreview?: string;
  message: string;
  detail?: string;
};

export function getAIReviewProviderCheckConfig({
  baseUrl = "",
  model = "",
  provider = "",
}: {
  baseUrl?: string;
  model?: string;
  provider?: string;
} = {}): AIReviewProviderCheckConfig {
  const resolvedProvider =
    provider.trim().toLowerCase() ||
    process.env.AI_REVIEW_PROVIDER?.trim().toLowerCase() ||
    (process.env.DEEPSEEK_API_KEY ? "deepseek" : "mock");

  return {
    provider: resolvedProvider,
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? "",
    baseUrl:
      baseUrl.trim() ||
      process.env.DEEPSEEK_BASE_URL?.trim() ||
      defaultDeepSeekBaseUrl,
    modelName:
      model.trim() ||
      process.env.DEEPSEEK_MODEL?.trim() ||
      defaultDeepSeekModel,
  };
}

export async function checkAIReviewProvider({
  config,
  timeoutMs = 15000,
}: {
  config: AIReviewProviderCheckConfig;
  timeoutMs?: number;
}): Promise<AIReviewProviderCheckResult> {
  if (config.provider === "mock") {
    return {
      ok: true,
      provider: "mock",
      modelName: "mock-ai-review",
      message: "AI review provider check passed.",
      detail: "Network call: skipped",
    };
  }

  if (config.provider !== "deepseek") {
    return {
      ok: false,
      provider: config.provider,
      modelName: config.modelName,
      message: `Unsupported AI_REVIEW_PROVIDER: ${config.provider}`,
      detail: "Supported values are mock and deepseek.",
    };
  }

  if (!config.apiKey) {
    return {
      ok: false,
      provider: "deepseek",
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      maskedApiKey: "(empty)",
      message: "DEEPSEEK_API_KEY is required for AI_REVIEW_PROVIDER=deepseek.",
      detail: "Set DEEPSEEK_API_KEY in .env, then rerun this command.",
    };
  }

  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
        max_tokens: 96,
        messages: [
          {
            role: "system",
            content: "Answer with exactly one short word.",
          },
          {
            role: "user",
            content: "Say OK.",
          },
        ],
      }),
    });
    const latencyMs = Date.now() - startedAt;
    const body = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        provider: "deepseek",
        baseUrl: config.baseUrl,
        modelName: config.modelName,
        maskedApiKey: maskSecret(config.apiKey),
        latencyMs,
        message: `DeepSeek provider check failed: HTTP ${response.status}`,
        detail: scrubSecrets(body, config.apiKey),
      };
    }

    const payload = parseJson(body);
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      return {
        ok: false,
        provider: "deepseek",
        baseUrl: config.baseUrl,
        modelName: config.modelName,
        maskedApiKey: maskSecret(config.apiKey),
        latencyMs,
        message: "DeepSeek provider check failed: empty model response.",
        detail: scrubSecrets(body, config.apiKey),
      };
    }

    return {
      ok: true,
      provider: "deepseek",
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      maskedApiKey: maskSecret(config.apiKey),
      latencyMs,
      responsePreview: content.trim().slice(0, 80),
      message: "AI review provider check passed.",
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `DeepSeek provider check timed out after ${timeoutMs} ms.`
        : error instanceof Error
          ? error.message
          : "Unknown provider check error.";

    return {
      ok: false,
      provider: "deepseek",
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      maskedApiKey: maskSecret(config.apiKey),
      message,
      detail: `Endpoint: ${endpoint}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatProviderCheckResult(
  result: AIReviewProviderCheckResult,
) {
  if (!result.ok) {
    return [result.message, result.detail].filter(Boolean).join("\n");
  }

  const lines = [
    result.message,
    `Provider: ${result.provider}`,
    result.baseUrl ? `Base URL: ${result.baseUrl}` : null,
    `Model: ${result.modelName}`,
    result.maskedApiKey ? `API key: ${result.maskedApiKey}` : null,
    result.latencyMs === undefined ? null : `Latency: ${result.latencyMs} ms`,
    result.responsePreview
      ? `Response preview: ${result.responsePreview}`
      : result.detail,
  ];

  return lines.filter(Boolean).join("\n");
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } catch {
    return null;
  }
}

function maskSecret(value: string) {
  if (!value) {
    return "(empty)";
  }

  return value.length <= 8 ? "****" : `****${value.slice(-4)}`;
}

function scrubSecrets(value: string, secret: string) {
  if (!value) {
    return value;
  }

  const withoutKnownSecret = secret
    ? value.split(secret).join("[redacted-api-key]")
    : value;

  return withoutKnownSecret.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted-api-key]");
}
