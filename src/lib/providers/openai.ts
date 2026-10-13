import type { SSEEvent } from "../sse";
import { errorText, joinUrl, num, safeJson, type ProviderChunk, type UpstreamParams, type UpstreamRequest } from "./shared";

export function buildOpenAIRequest(p: UpstreamParams, opts: { includeUsage: boolean }): UpstreamRequest {
  const body: Record<string, unknown> = {
    model: p.model,
    temperature: p.temperature,
    max_tokens: p.maxTokens,
    stream: true,
    messages: p.messages,
  };
  if (opts.includeUsage) body.stream_options = { include_usage: true };
  return {
    url: joinUrl(p.baseUrl, "/chat/completions"),
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    },
  };
}

export function parseOpenAIEvent(ev: SSEEvent): ProviderChunk {
  if (ev.data.trim() === "[DONE]") return { done: true };
  const json = safeJson(ev.data);
  if (!json) return {};
  if (json.error) return { error: errorText(json.error) };
  const out: ProviderChunk = {};
  const choices = Array.isArray(json.choices) ? json.choices : [];
  const delta = (choices[0] as { delta?: { content?: unknown } } | undefined)?.delta;
  if (typeof delta?.content === "string" && delta.content !== "") out.text = delta.content;
  const usage = json.usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | null | undefined;
  if (usage && typeof usage === "object") {
    const inputTokens = num(usage.prompt_tokens);
    const outputTokens = num(usage.completion_tokens);
    if (inputTokens !== undefined || outputTokens !== undefined) out.usage = { inputTokens, outputTokens };
  }
  return out;
}
