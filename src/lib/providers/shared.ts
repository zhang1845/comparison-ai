import type { ChatMessageInput, Usage } from "../types";
import type { SSEEvent } from "../sse";

export interface UpstreamParams {
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  messages: ChatMessageInput[];
  apiKey: string;
}

export interface UpstreamRequest {
  url: string;
  init: { method: "POST"; headers: Record<string, string>; body: string };
}

/** 一条上游事件翻译后的结果。 */
export interface ProviderChunk {
  text?: string;
  usage?: Usage;
  done?: boolean;
  error?: string;
}

export type ParseEvent = (ev: SSEEvent) => ProviderChunk;

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

export function safeJson(data: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(data);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function errorText(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const m = (v as { message?: unknown }).message;
    if (typeof m === "string") return m;
    return JSON.stringify(v);
  }
  return String(v);
}

export function splitSystem(messages: ChatMessageInput[]): { system?: string; rest: ChatMessageInput[] } {
  if (messages[0]?.role === "system") return { system: messages[0].content, rest: messages.slice(1) };
  return { rest: messages };
}
