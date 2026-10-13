import { redactSecrets } from "../proxy-guard";
import { encodeSSE, SSEParser, type DownstreamEvent } from "../sse";
import type { ChatProxyRequest, Usage } from "../types";
import { buildAnthropicRequest, parseAnthropicEvent } from "./anthropic";
import { buildGeminiRequest, parseGeminiEvent } from "./gemini";
import { buildOpenAIRequest, parseOpenAIEvent } from "./openai";
import type { ParseEvent, UpstreamParams, UpstreamRequest } from "./shared";

export function proxyTimeoutMs(): number {
  const v = Number(process.env.PROXY_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 90_000;
}

function buildRequest(kind: ChatProxyRequest["kind"], p: UpstreamParams, includeUsage: boolean): UpstreamRequest {
  if (kind === "anthropic") return buildAnthropicRequest(p);
  if (kind === "gemini") return buildGeminiRequest(p);
  return buildOpenAIRequest(p, { includeUsage });
}

function parserFor(kind: ChatProxyRequest["kind"]): ParseEvent {
  if (kind === "anthropic") return parseAnthropicEvent;
  if (kind === "gemini") return parseGeminiEvent;
  return parseOpenAIEvent;
}

export function describeUpstreamFailure(status: number, body: string, apiKey: string): string {
  const detail = redactSecrets(body.replace(/\s+/g, " ").trim(), apiKey).slice(0, 400);
  return detail ? `厂商返回错误（HTTP ${status}）：${detail}` : `厂商返回错误（HTTP ${status}）`;
}

/** 合并上游的用量片段：后到的值覆盖先到的值。 */
function mergeUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: b.inputTokens ?? a.inputTokens,
    outputTokens: b.outputTokens ?? a.outputTokens,
  };
}

/**
 * 把一个已校验的请求转发给厂商，产出第 10 节约定的下游 SSE 字节流。
 * 厂商侧的任何失败都以 error 事件结束，不抛到 HTTP 层。
 */
export function streamChat(req: ChatProxyRequest, apiKey: string, clientSignal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const upstream = new AbortController();
  const timeoutMs = proxyTimeoutMs();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      upstream.abort();
    }, timeoutMs);
  };
  const onClientAbort = () => upstream.abort();
  clientSignal.addEventListener("abort", onClientAbort);

  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: DownstreamEvent) => {
        if (!closed) controller.enqueue(encoder.encode(encodeSSE(e)));
      };
      const fail = (code: string, message: string) => send({ event: "error", data: { code, message } });

      const params: UpstreamParams = { ...req, apiKey };
      const doFetch = (includeUsage: boolean) => {
        const r = buildRequest(req.kind, params, includeUsage);
        return fetch(r.url, { ...r.init, redirect: "manual", signal: upstream.signal, cache: "no-store" });
      };

      arm();
      try {
        let res = await doFetch(true);
        if (req.kind === "openai" && res.status === 400) {
          await res.body?.cancel().catch(() => {});
          res = await doFetch(false);
        }
        if (res.status >= 300 && res.status < 400) {
          await res.body?.cancel().catch(() => {});
          fail("provider_error", `厂商返回错误（HTTP ${res.status} 重定向，已拒绝跟随）`);
          return;
        }
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          fail("provider_error", describeUpstreamFailure(res.status, text, apiKey));
          return;
        }

        const parse = parserFor(req.kind);
        const parser = new SSEParser();
        const decoder = new TextDecoder();
        const reader = res.body.getReader();
        let usage: Usage = {};
        let gotText = false;
        let finished = false;

        const handle = (events: ReturnType<SSEParser["feed"]>): boolean => {
          for (const ev of events) {
            const chunk = parse(ev);
            if (chunk.error) {
              fail("provider_error", `厂商返回错误：${redactSecrets(chunk.error, apiKey).slice(0, 400)}`);
              return true;
            }
            if (chunk.text) {
              gotText = true;
              send({ event: "delta", data: { text: chunk.text } });
            }
            if (chunk.usage) usage = mergeUsage(usage, chunk.usage);
            if (chunk.done) {
              finished = true;
              return false;
            }
          }
          return false;
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          arm();
          if (handle(parser.feed(decoder.decode(value, { stream: true })))) {
            await reader.cancel().catch(() => {});
            return;
          }
          if (finished) {
            await reader.cancel().catch(() => {});
            break;
          }
        }
        if (!finished && handle(parser.feed(decoder.decode()).concat(parser.flush()))) return;

        if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
          send({ event: "usage", data: usage });
        }
        if (!gotText) fail("empty_response", "厂商没有返回正文");
        else send({ event: "done", data: {} });
      } catch {
        if (clientSignal.aborted) return;
        if (timedOut) fail("timeout", "厂商超时");
        else fail("network", "网络连接失败");
      } finally {
        clearTimeout(timer);
        clientSignal.removeEventListener("abort", onClientAbort);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // 客户端已断开
          }
        }
      }
    },
    cancel() {
      closed = true;
      upstream.abort();
    },
  });
}
