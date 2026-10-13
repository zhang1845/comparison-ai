"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { continuationState } from "@/lib/context";
import { LIMITS } from "@/lib/types";
import { useWorkspace } from "./provider";

export function Composer({ inputRef }: { inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const { state, current, busy, send, stopAll, continueRound } = useWorkspace();
  const [text, setText] = useState("");

  const enabledCount = state.settings.slots.filter((s) => s.enabled).length;
  const noSlots = enabledCount === 0;
  const roundsFull = (current?.rounds.length ?? 0) >= LIMITS.rounds;
  const placeholder = enabledCount === 5 ? "向五个席位提出同一个问题" : `向已启用的 ${enabledCount} 个席位发送`;
  const canSend = !busy && !noSlots && !roundsFull && text.trim() !== "" && state.ready;

  const lastRound = current?.rounds.at(-1);
  const cont = continuationState(lastRound);
  const showContinue = state.settings.mode === "roundtable" && cont.available && !busy;

  const submit = () => {
    if (!canSend) return;
    if (send(text)) setText("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  };

  return (
    <div className="border-t bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="rounded-lg border bg-white focus-within:border-ring">
        <Textarea
          ref={inputRef}
          value={text}
          maxLength={LIMITS.input}
          disabled={noSlots}
          placeholder={noSlots ? "至少启用一个席位" : placeholder}
          aria-label="输入问题"
          rows={2}
          className="max-h-48 min-h-14 resize-none border-0 shadow-none focus-visible:ring-0"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {noSlots
              ? "至少启用一个席位"
              : roundsFull
                ? "单个对话最多 200 轮，请新建对话。"
                : text.length >= LIMITS.input * 0.8
                  ? `${text.length} / ${LIMITS.input}`
                  : "Enter 发送，Shift+Enter 换行"}
          </p>
          {showContinue && (
            <>
              <span className="text-xs text-muted-foreground">还可续谈 {cont.remaining} 次</span>
              <Button size="sm" variant="outline" onClick={continueRound}>
                续谈
              </Button>
            </>
          )}
          {busy ? (
            <Button size="sm" variant="destructive" onClick={stopAll}>
              停止
            </Button>
          ) : (
            <Button size="sm" disabled={!canSend} onClick={submit}>
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
