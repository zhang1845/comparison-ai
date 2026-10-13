import type { SSEEvent } from "../sse";
import {
  errorText,
  joinUrl,
  num,
  safeJson,
  splitSystem,
  type ProviderChunk,
  type UpstreamParams,
  type UpstreamRequest,
} from "./shared";

export function buildGeminiRequest(p: UpstreamParams): UpstreamRequest {
  const { system, rest } = splitSystem(p.messages);
  const body: Record<string, unknown> = {
    contents: rest.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { temperature: p.temperature, maxOutputTokens: p.maxTokens },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return {
    url: joinUrl(p.baseUrl, `/models/${encodeURIComponent(p.model)}:streamGenerateContent?alt=sse`),
    init: {
      method: "POST",
      headers: {
        "x-goog-api-key": p.apiKey,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    },
  };
}

export function parseGeminiEvent(ev: SSEEvent): ProviderChunk {
  const json = safeJson(ev.data);
  if (!json) return {};
  if (json.error) return { error: errorText(json.error) };
  const out: ProviderChunk = {};
  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  const parts = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content?.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .filter((p): p is { text: string; thought?: boolean } => typeof p?.text === "string" && !p.thought)
      .map((p) => p.text)
      .join("");
    if (text !== "") out.text = text;
  }
  const usage = json.usageMetadata as Record<string, unknown> | undefined;
  if (usage) {
    const inputTokens = num(usage.promptTokenCount);
    const outputTokens = num(usage.candidatesTokenCount);
    if (inputTokens !== undefined || outputTokens !== undefined) out.usage = { inputTokens, outputTokens };
  }
  return out;
}
