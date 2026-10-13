import type { ChatMessageInput, Round, SlotId, SlotTurn } from "./types";
import { SLOT_IDS } from "./types";

export const ROUNDTABLE_RULES = [
  "你正在一场最多五个席位的圆桌里发言。",
  "只代表你自己，不要替其他模型写回复。",
  "使用与用户相同的语言。",
  "先给出结论，再补充理由，不要开场客套。",
  "若消息里引用了其他席位，只回应实质分歧或遗漏，不要逐段复读。",
  "不要声称你调用了工具、检索了网页或执行了代码。",
].join("\n");

const HISTORY_QUOTE_HEAD = "其他席位在该轮的最终回复如下。";
const CONTINUE_QUOTE_HEAD = "其他席位刚才说：";
const CONTINUE_QUOTE_TAIL =
  "只写你自己的下一则回复：指出你与他们的实质分歧，或补充一个他们没说到的点。不要复述全文，不要代替别人发言。";

export class ContinuationUnavailableError extends Error {
  constructor() {
    super("没有其他席位的有效回复，无法续谈");
    this.name = "ContinuationUnavailableError";
  }
}

export function isValidReply(turn: SlotTurn | undefined): turn is SlotTurn {
  return !!turn && turn.status === "done" && turn.content.trim() !== "";
}

/** 该席在该轮 pass 最大、且 done、非空的那条。 */
export function finalReply(round: Round, slotId: SlotId): SlotTurn | undefined {
  let best: SlotTurn | undefined;
  for (const t of round.turns) {
    if (t.slotId !== slotId || !isValidReply(t)) continue;
    if (!best || t.pass > best.pass) best = t;
  }
  return best;
}

function replyAtPass(round: Round, slotId: SlotId, pass: number): SlotTurn | undefined {
  const t = round.turns.find((x) => x.slotId === slotId && x.pass === pass);
  return isValidReply(t) ? t : undefined;
}

function quoteEntries(turns: SlotTurn[]): string {
  return turns.map((t) => `### ${t.displayName} · ${t.model}\n${t.content.trim()}`).join("\n\n");
}

function othersFinal(round: Round, self: SlotId): SlotTurn[] {
  return SLOT_IDS.filter((id) => id !== self)
    .map((id) => finalReply(round, id))
    .filter((t): t is SlotTurn => !!t);
}

function othersAtPass(round: Round, self: SlotId, pass: number): SlotTurn[] {
  return SLOT_IDS.filter((id) => id !== self)
    .map((id) => replyAtPass(round, id, pass))
    .filter((t): t is SlotTurn => !!t);
}

export function buildSystemPrompt(parts: {
  roundtable: boolean;
  globalSystemPrompt: string;
  slotSystemPrompt: string;
}): string {
  return [parts.roundtable ? ROUNDTABLE_RULES : "", parts.globalSystemPrompt.trim(), parts.slotSystemPrompt.trim()]
    .filter((s) => s !== "")
    .join("\n\n");
}

/** C7：丢空、合并相邻同角色、首条 assistant 前补「请继续」。 */
export function normalizeMessages(messages: ChatMessageInput[]): ChatMessageInput[] {
  const system = messages[0]?.role === "system" ? messages[0] : undefined;
  const body = (system ? messages.slice(1) : messages).filter((m) => m.content.trim() !== "");
  const merged: ChatMessageInput[] = [];
  for (const m of body) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      merged[merged.length - 1] = { role: last.role, content: `${last.content}\n\n${m.content}` };
    } else {
      merged.push({ ...m });
    }
  }
  if (merged[0]?.role === "assistant") merged.unshift({ role: "user", content: "请继续" });
  return system && system.content.trim() !== "" ? [system, ...merged] : merged;
}

export interface BuildMessagesInput {
  rounds: Round[];
  /** 当前轮在 rounds 中的下标；之前的都是历史轮次 */
  roundIndex: number;
  slotId: SlotId;
  pass: number;
  globalSystemPrompt: string;
  slotSystemPrompt: string;
}

export function buildMessages(input: BuildMessagesInput): ChatMessageInput[] {
  const { rounds, roundIndex, slotId, pass } = input;
  const current = rounds[roundIndex];
  if (!current) throw new Error("轮次不存在");
  const roundtable = current.mode === "roundtable";

  const out: ChatMessageInput[] = [];
  const system = buildSystemPrompt({
    roundtable,
    globalSystemPrompt: input.globalSystemPrompt,
    slotSystemPrompt: input.slotSystemPrompt,
  });
  if (system) out.push({ role: "system", content: system });

  for (const round of rounds.slice(0, roundIndex)) {
    let user = round.userText;
    if (roundtable && round.mode === "roundtable") {
      const others = othersFinal(round, slotId);
      if (others.length > 0) user += `\n\n${HISTORY_QUOTE_HEAD}\n\n${quoteEntries(others)}`;
    }
    out.push({ role: "user", content: user });
    const own = finalReply(round, slotId);
    if (own) out.push({ role: "assistant", content: own.content });
  }

  out.push({ role: "user", content: current.userText });

  if (pass > 0) {
    if (!roundtable) throw new ContinuationUnavailableError();
    const others = othersAtPass(current, slotId, pass - 1);
    if (others.length === 0) throw new ContinuationUnavailableError();
    for (let p = 0; p < pass; p++) {
      const own = replyAtPass(current, slotId, p);
      if (own) out.push({ role: "assistant", content: own.content });
    }
    out.push({
      role: "user",
      content: `${CONTINUE_QUOTE_HEAD}\n\n${quoteEntries(others)}\n\n${CONTINUE_QUOTE_TAIL}`,
    });
  }

  return normalizeMessages(out);
}

/** 当前轮里某席能否以 pass 发起续谈（C6：至少有一个其他席的上一 pass 有效回复）。 */
export function hasContinuationSource(round: Round, slotId: SlotId, pass: number): boolean {
  return pass > 0 && othersAtPass(round, slotId, pass - 1).length > 0;
}

export function maxPass(round: Round): number {
  return round.turns.reduce((m, t) => Math.max(m, t.pass), 0);
}

export function isActive(turn: SlotTurn): boolean {
  return turn.status === "pending" || turn.status === "streaming";
}

/** 圆桌续谈可用性：最后一轮全部结束、至少两席在最新 pass 有非空完成回复、未到 pass 2。 */
export function continuationState(round: Round | undefined): { available: boolean; remaining: number } {
  if (!round || round.mode !== "roundtable") return { available: false, remaining: 0 };
  const top = maxPass(round);
  const remaining = Math.max(0, 2 - top);
  if (remaining === 0) return { available: false, remaining };
  if (round.turns.some(isActive)) return { available: false, remaining };
  const valid = round.turns.filter((t) => t.pass === top && isValidReply(t)).length;
  return { available: valid >= 2, remaining };
}
