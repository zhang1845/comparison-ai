import { SSEParser, parseDownstream } from "./sse";
import type { ChatProxyRequest, Usage } from "./types";

export type ProxyResult = { ok: true } | { ok: false; code: string; message: string };

export interface ProxyHandlers {
  onOpen?: () => void;
  onDelta?: (text: string) => void;
  onUsage?: (usage: Usage) => void;
}

/** 浏览器调用同源 /api/chat。中止时抛出 AbortError，由调用方处理。 */
export async function streamFromProxy(
  req: ChatProxyRequest,
  apiKey: string,
  signal: AbortSignal,
  handlers: ProxyHandlers = {},
): Promise<ProxyResult> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
    return {
      ok: false,
      code: j?.code ?? "provider_error",
      message: j?.message ?? `请求失败（HTTP ${res.status}）`,
    };
  }
  handlers.onOpen?.();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SSEParser();
  const handle = (events: ReturnType<SSEParser["feed"]>): ProxyResult | null => {
    for (const raw of events) {
      const ev = parseDownstream(raw);
      if (!ev) continue;
      if (ev.event === "delta" && ev.data.text) handlers.onDelta?.(ev.data.text);
      else if (ev.event === "usage") handlers.onUsage?.(ev.data);
      else if (ev.event === "done") return { ok: true };
      else if (ev.event === "error") return { ok: false, code: ev.data.code, message: ev.data.message };
    }
    return null;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const r = handle(parser.feed(decoder.decode(value, { stream: true })));
    if (r) {
      await reader.cancel().catch(() => {});
      return r;
    }
  }
  const tail = handle(parser.feed(decoder.decode()).concat(parser.flush()));
  return tail ?? { ok: false, code: "network", message: "网络连接失败：连接意外中断" };
}

export async function fetchModelIds(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: true; ids: string[] } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ baseUrl }),
    });
    const j = (await res.json().catch(() => null)) as { ids?: string[]; message?: string } | null;
    if (res.ok && Array.isArray(j?.ids)) return { ok: true, ids: j.ids };
    return { ok: false, message: j?.message ?? `请求失败（HTTP ${res.status}）` };
  } catch {
    return { ok: false, message: "网络连接失败" };
  }
}
