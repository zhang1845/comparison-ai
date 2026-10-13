import { describe, expect, it } from "vitest";
import {
  ROUNDTABLE_RULES,
  buildMessages,
  continuationState,
  ContinuationUnavailableError,
} from "./context";
import type { ChatMode, Round, SlotId, SlotTurn, TurnStatus } from "./types";

const NAMES: Record<string, { displayName: string; model: string }> = {
  "slot-1": { displayName: "席位 1", model: "gpt-4o" },
  "slot-2": { displayName: "席位 2", model: "deepseek-chat" },
};

function turn(slotId: SlotId, pass: number, content: string, status: TurnStatus = "done"): SlotTurn {
  return {
    id: `${slotId}-${pass}`,
    slotId,
    pass,
    status,
    content,
    kind: "openai",
    temperature: 0.7,
    maxTokens: 2048,
    ...NAMES[slotId],
  };
}

function round(id: string, mode: ChatMode, userText: string, turns: SlotTurn[]): Round {
  return { id, createdAt: 0, mode, userText, turns };
}

const R1_FULL = round("r1", "roundtable", "选一门外语", [
  turn("slot-1", 0, "选日语"),
  turn("slot-1", 1, "我仍选日语"),
  turn("slot-2", 0, "选西班牙语"),
  turn("slot-2", 1, "我仍选西班牙语"),
]);

const base = { globalSystemPrompt: "", slotSystemPrompt: "" };

describe("第 7.3 节装配例子", () => {
  it("圆桌新一轮 pass 0：历史轮附其他席最终回复", () => {
    const rounds = [R1_FULL, round("r2", "roundtable", "那学习顺序呢", [turn("slot-1", 0, "", "pending")])];
    const messages = buildMessages({ ...base, rounds, roundIndex: 1, slotId: "slot-1", pass: 0 });
    expect(messages).toEqual([
      { role: "system", content: ROUNDTABLE_RULES },
      {
        role: "user",
        content: "选一门外语\n\n其他席位在该轮的最终回复如下。\n\n### 席位 2 · deepseek-chat\n我仍选西班牙语",
      },
      { role: "assistant", content: "我仍选日语" },
      { role: "user", content: "那学习顺序呢" },
    ]);
  });

  it("并行新一轮：无 system，且不含其他席文字", () => {
    const rounds = [R1_FULL, round("r2", "parallel", "那学习顺序呢", [turn("slot-1", 0, "", "pending")])];
    const messages = buildMessages({ ...base, rounds, roundIndex: 1, slotId: "slot-1", pass: 0 });
    expect(messages).toEqual([
      { role: "user", content: "选一门外语" },
      { role: "assistant", content: "我仍选日语" },
      { role: "user", content: "那学习顺序呢" },
    ]);
    expect(JSON.stringify(messages)).not.toContain("西班牙语");
  });

  it("续谈 pass 1：自己的 pass 0 在 assistant，最后一条 user 是续谈引用块", () => {
    const r1 = round("r1", "roundtable", "选一门外语", [
      turn("slot-1", 0, "选日语"),
      turn("slot-2", 0, "选西班牙语"),
      turn("slot-1", 1, "", "pending"),
      turn("slot-2", 1, "", "pending"),
    ]);
    const messages = buildMessages({ ...base, rounds: [r1], roundIndex: 0, slotId: "slot-1", pass: 1 });
    expect(messages).toEqual([
      { role: "system", content: ROUNDTABLE_RULES },
      { role: "user", content: "选一门外语" },
      { role: "assistant", content: "选日语" },
      {
        role: "user",
        content:
          "其他席位刚才说：\n\n### 席位 2 · deepseek-chat\n选西班牙语\n\n只写你自己的下一则回复：指出你与他们的实质分歧，或补充一个他们没说到的点。不要复述全文，不要代替别人发言。",
      },
    ]);
  });
});

describe("规范化与边界", () => {
  it("失败轮次不产生 assistant，连续 user 被合并", () => {
    const rounds = [
      round("r1", "parallel", "第一问", [turn("slot-1", 0, "半截", "error")]),
      round("r2", "parallel", "第二问", [turn("slot-1", 0, "", "aborted")]),
      round("r3", "parallel", "第三问", [turn("slot-1", 0, "", "pending")]),
    ];
    const messages = buildMessages({ ...base, rounds, roundIndex: 2, slotId: "slot-1", pass: 0 });
    expect(messages).toEqual([{ role: "user", content: "第一问\n\n第二问\n\n第三问" }]);
  });

  it("空的全局提示与席位提示不会变成空 system", () => {
    const rounds = [round("r1", "parallel", "你好", [])];
    const messages = buildMessages({
      rounds,
      roundIndex: 0,
      slotId: "slot-1",
      pass: 0,
      globalSystemPrompt: "   \n",
      slotSystemPrompt: "",
    });
    expect(messages).toEqual([{ role: "user", content: "你好" }]);
  });

  it("system 按圆桌规则、全局、席位顺序以空行拼接", () => {
    const rounds = [round("r1", "roundtable", "你好", [])];
    const messages = buildMessages({
      rounds,
      roundIndex: 0,
      slotId: "slot-1",
      pass: 0,
      globalSystemPrompt: "先给结论",
      slotSystemPrompt: "用中文",
    });
    expect(messages[0]).toEqual({ role: "system", content: `${ROUNDTABLE_RULES}\n\n先给结论\n\n用中文` });
  });

  it("并行请求去掉历史圆桌引用块", () => {
    const rounds = [R1_FULL, round("r2", "parallel", "再说一次", [])];
    const messages = buildMessages({ ...base, rounds, roundIndex: 1, slotId: "slot-2", pass: 0 });
    expect(JSON.stringify(messages)).not.toContain("日语");
  });

  it("没有其他席的上一 pass 有效回复时禁止续谈", () => {
    const r1 = round("r1", "roundtable", "选一门外语", [
      turn("slot-1", 0, "选日语"),
      turn("slot-2", 0, "", "error"),
    ]);
    expect(() => buildMessages({ ...base, rounds: [r1], roundIndex: 0, slotId: "slot-1", pass: 1 })).toThrow(
      ContinuationUnavailableError,
    );
  });

  it("续谈可用性：至多 pass 2", () => {
    expect(continuationState(R1_FULL)).toEqual({ available: true, remaining: 1 });
    const r2 = round("r", "roundtable", "q", [...R1_FULL.turns, turn("slot-1", 2, "a"), turn("slot-2", 2, "b")]);
    expect(continuationState(r2)).toEqual({ available: false, remaining: 0 });
    const parallel = { ...R1_FULL, mode: "parallel" as const };
    expect(continuationState(parallel).available).toBe(false);
  });
});
