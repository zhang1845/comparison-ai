export interface SSEEvent {
  event: string;
  data: string;
}

/** 增量 SSE 解析器。分块可以切在任意位置，包括半行和 \r\n 之间。 */
export class SSEParser {
  private buffer = "";
  private eventName = "";
  private dataLines: string[] = [];

  feed(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const out: SSEEvent[] = [];
    for (;;) {
      const idx = this.buffer.search(/[\r\n]/);
      if (idx === -1) break;
      const isCR = this.buffer[idx] === "\r";
      if (isCR && idx === this.buffer.length - 1) break;
      const width = isCR && this.buffer[idx + 1] === "\n" ? 2 : 1;
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + width);
      this.processLine(line, out);
    }
    return out;
  }

  flush(): SSEEvent[] {
    const out: SSEEvent[] = [];
    if (this.buffer !== "") {
      const rest = this.buffer.replace(/\r$/, "");
      this.buffer = "";
      this.processLine(rest, out);
    }
    this.processLine("", out);
    return out;
  }

  private processLine(line: string, out: SSEEvent[]) {
    if (line === "") {
      if (this.dataLines.length > 0) {
        out.push({ event: this.eventName || "message", data: this.dataLines.join("\n") });
      }
      this.eventName = "";
      this.dataLines = [];
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.eventName = value;
    else if (field === "data") this.dataLines.push(value);
  }
}

export type DownstreamEvent =
  | { event: "delta"; data: { text: string } }
  | { event: "usage"; data: { inputTokens?: number; outputTokens?: number } }
  | { event: "done"; data: Record<string, never> }
  | { event: "error"; data: { code: string; message: string } };

export function encodeSSE(e: DownstreamEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

/** 浏览器端：把 /api/chat 的事件流解析为结构化事件。 */
export function parseDownstream(ev: SSEEvent): DownstreamEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(ev.data);
  } catch {
    return null;
  }
  switch (ev.event) {
    case "delta":
    case "usage":
    case "done":
    case "error":
      return { event: ev.event, data } as DownstreamEvent;
    default:
      return null;
  }
}
