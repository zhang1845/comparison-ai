import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "./providers";
import { parseAnthropicEvent } from "./providers/anthropic";
import { parseGeminiEvent } from "./providers/gemini";
import { parseOpenAIEvent } from "./providers/openai";
import type { ProviderChunk } from "./providers/shared";
import { SSEParser, parseDownstream, type SSEEvent } from "./sse";
import type { ChatProxyRequest } from "./types";

const OPENAI_FIXTURE = [
  'data: {"id":"1","choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}',
  "",
  'data: {"id":"1","choices":[{"index":0,"delta":{"content":"你好"}}]}',
  "",
  'data: {"id":"1","choices":[{"index":0,"delta":{"content":"，世界"}}]}',
  "",
  'data: {"id":"1","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":5}}',
  "",
  "data: [DONE]",
  "",
  "",
].join("\n");

const ANTHROPIC_FIXTURE = [
  "event: message_start",
  'data: {"type":"message_start","message":{"id":"m","usage":{"input_tokens":30,"output_tokens":1}}}',
  "",
  "event: content_block_start",
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
  "",
  "event: ping",
  'data: {"type":"ping"}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"选"}}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"日语"}}',
  "",
  "event: message_delta",
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":9}}',
  "",
  "event: message_stop",
  'data: {"type":"message_stop"}',
  "",
  "",
].join("\r\n");

const GEMINI_FIXTURE = [
  'data: {"candidates":[{"content":{"parts":[{"text":"第一"}],"role":"model"}}]}',
  "",
  'data: {"candidates":[{"content":{"parts":[{"text":"步"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":3}}',
  "",
  "",
].join("\n");

/** 按固定步长切块，模拟分块边界切在半条事件上。 */
function feedInChunks(text: string, size: number): SSEEvent[] {
  const p = new SSEParser();
  const out: SSEEvent[] = [];
  for (let i = 0; i < text.length; i += size) out.push(...p.feed(text.slice(i, i + size)));
  out.push(...p.flush());
  return out;
}

function collect(events: SSEEvent[], parse: (e: SSEEvent) => ProviderChunk) {
  let text = "";
  const log: string[] = [];
  let usage: ProviderChunk["usage"] = {};
  for (const e of events) {
    const c = parse(e);
    if (c.text) {
      text += c.text;
      log.push("text");
    }
    if (c.usage) {
      usage = { ...usage, ...Object.fromEntries(Object.entries(c.usage).filter(([, v]) => v !== undefined)) };
      log.push("usage");
    }
    if (c.done) log.push("done");
  }
  return { text, usage, log };
}

describe("SSEParser", () => {
  it.each([1, 3, 7, 64, 10_000])("分块大小 %i 时结果一致", (size) => {
    const events = feedInChunks(OPENAI_FIXTURE, size);
    expect(events.map((e) => e.data)).toHaveLength(5);
    expect(events[4].data).toBe("[DONE]");
  });

  it("支持 event 字段、多行 data 与注释", () => {
    const events = feedInChunks(": ping\nevent: delta\ndata: a\ndata: b\n\n", 2);
    expect(events).toEqual([{ event: "delta", data: "a\nb" }]);
  });

  it("\\r\\n 被切开时不产生空事件", () => {
    const events = feedInChunks(ANTHROPIC_FIXTURE, 1);
    expect(events.map((e) => e.event)).toEqual([
      "message_start",
      "content_block_start",
      "ping",
      "content_block_delta",
      "content_block_delta",
      "message_delta",
      "message_stop",
    ]);
  });
});

describe("厂商夹具", () => {
  it("OpenAI：拼出增量文本，并在 [DONE] 前读到 usage", () => {
    const { text, usage, log } = collect(feedInChunks(OPENAI_FIXTURE, 5), parseOpenAIEvent);
    expect(text).toBe("你好，世界");
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 5 });
    expect(log.indexOf("usage")).toBeLessThan(log.indexOf("done"));
    expect(log[log.length - 1]).toBe("done");
  });

  it("Anthropic：content_block_delta 拼出文本，usage 来自 message_start 与 message_delta", () => {
    const { text, usage, log } = collect(feedInChunks(ANTHROPIC_FIXTURE, 4), parseAnthropicEvent);
    expect(text).toBe("选日语");
    expect(usage).toEqual({ inputTokens: 30, outputTokens: 9 });
    expect(log[log.length - 1]).toBe("done");
  });

  it("Gemini：parts 文本与 usageMetadata", () => {
    const { text, usage } = collect(feedInChunks(GEMINI_FIXTURE, 6), parseGeminiEvent);
    expect(text).toBe("第一步");
    expect(usage).toEqual({ inputTokens: 7, outputTokens: 3 });
  });
});

describe("streamChat 下游契约", () => {
  const req: ChatProxyRequest = {
    kind: "openai",
    baseUrl: "https://api.example.com/v1",
    model: "m",
    temperature: 0.7,
    maxTokens: 2048,
    messages: [{ role: "user", content: "hi" }],
  };

  afterEach(() => vi.unstubAllGlobals());

  async function readAll(stream: ReadableStream<Uint8Array>) {
    const text = await new Response(stream).text();
    return feedInChunks(text, 100).map((e) => parseDownstream(e));
  }

  it("转出 delta、usage、done", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(OPENAI_FIXTURE, { status: 200 })));
    const events = await readAll(streamChat(req, "sk-test", new AbortController().signal));
    expect(events).toEqual([
      { event: "delta", data: { text: "你好" } },
      { event: "delta", data: { text: "，世界" } },
      { event: "usage", data: { inputTokens: 12, outputTokens: 5 } },
      { event: "done", data: {} },
    ]);
  });

  it("400 时去掉 stream_options 重试一次", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unknown field stream_options", { status: 400 }))
      .mockResolvedValueOnce(new Response(OPENAI_FIXTURE, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const events = await readAll(streamChat(req, "sk-test", new AbortController().signal));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toHaveProperty("stream_options");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("stream_options");
    expect(events.at(-1)).toEqual({ event: "done", data: {} });
  });

  it("上游 401 变成 provider_error，且说明里没有密钥", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":{"message":"Incorrect API key provided: sk-abc123"}}', { status: 401 })),
    );
    const events = await readAll(streamChat(req, "sk-abc123", new AbortController().signal));
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("error");
    const data = events[0]?.data as { code: string; message: string };
    expect(data.code).toBe("provider_error");
    expect(data.message).toContain("HTTP 401");
    expect(data.message).not.toContain("sk-abc123");
  });

  it("3xx 不跟随，视为 provider_error", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://10.0.0.1/" } }));
    vi.stubGlobal("fetch", fetchMock);
    const events = await readAll(streamChat({ ...req, kind: "gemini" }, "k-1234", new AbortController().signal));
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ redirect: "manual" });
    expect((events[0]?.data as { code: string }).code).toBe("provider_error");
  });

  it("没有正文时返回 empty_response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("data: [DONE]\n\n", { status: 200 })));
    const events = await readAll(streamChat(req, "sk-test", new AbortController().signal));
    expect(events).toEqual([{ event: "error", data: { code: "empty_response", message: "厂商没有返回正文" } }]);
  });
});
