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

export function buildAnthropicRequest(p: UpstreamParams): UpstreamRequest {
  const { system, rest } = splitSystem(p.messages);
  const body: Record<string, unknown> = {
    model: p.model,
    max_tokens: p.maxTokens,
    temperature: Math.min(p.temperature, 1),
    stream: true,
    messages: rest
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
  };
  if (system) body.system = system;
  return {
    url: joinUrl(p.baseUrl, "/v1/messages"),
    init: {
      method: "POST",
      headers: {
        "x-api-key": p.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    },
  };
}

export function parseAnthropicEvent(ev: SSEEvent): ProviderChunk {
  const json = safeJson(ev.data);
  if (!json) return {};
  const type = (json.type as string | undefined) ?? ev.event;
  switch (type) {
    case "message_start": {
      const usage = (json.message as { usage?: Record<string, unknown> } | undefined)?.usage;
      const inputTokens = num(usage?.input_tokens);
      const outputTokens = num(usage?.output_tokens);
      return inputTokens !== undefined || outputTokens !== undefined ? { usage: { inputTokens, outputTokens } } : {};
    }
    case "content_block_delta": {
      const delta = json.delta as { type?: string; text?: unknown } | undefined;
      return typeof delta?.text === "string" && delta.text !== "" ? { text: delta.text } : {};
    }
    case "message_delta": {
      const usage = json.usage as Record<string, unknown> | undefined;
      const inputTokens = num(usage?.input_tokens);
      const outputTokens = num(usage?.output_tokens);
      return inputTokens !== undefined || outputTokens !== undefined ? { usage: { inputTokens, outputTokens } } : {};
    }
    case "message_stop":
      return { done: true };
    case "error":
      return { error: errorText(json.error) ?? "厂商返回错误" };
    default:
      return {};
  }
}
