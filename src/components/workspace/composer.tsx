"use client";

import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { continuationState } from "@/lib/context";
import type { ChatMode } from "@/lib/types";
import { LIMITS } from "@/lib/types";
import { CompareVoteBar } from "./column";
import { HeaderModelPicker } from "./model-picker";
import { useWorkspace } from "./provider";

const MODE_CHIP: Record<ChatMode, string> = {
  parallel: "并排对照",
  roundtable: "圆桌",
};

export function Composer({
  inputRef,
  variant = "docked",
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  variant?: "docked" | "home";
}) {
  const { state, current, busy, send, stopAll, continueRound, updateSettings } = useWorkspace();
  const [text, setText] = useState("");
  const home = variant === "home";

  const enabled = state.settings.slots.filter((s) => s.enabled);
  const enabledCount = enabled.length;
  const noSlots = enabledCount === 0;
  const roundsFull = (current?.rounds.length ?? 0) >= LIMITS.rounds;
  const placeholder = noSlots ? "至少启用一个席位" : home ? "问点什么…" : "输入同一条问题，对比各模型的回答…";
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
    <div className={home ? "" : "px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]"}>
      <div className={home ? "w-full space-y-3" : "mx-auto w-full max-w-3xl space-y-3"}>
        {!home && <CompareVoteBar />}
        <div className="rounded-2xl border border-[#e8e4dc] bg-white shadow-[0_8px_24px_rgba(28,25,21,0.05)] focus-within:border-ring">
          <Textarea
            ref={inputRef}
            value={text}
            maxLength={LIMITS.input}
            disabled={noSlots}
            placeholder={placeholder}
            aria-label="输入问题"
            rows={home ? 3 : 2}
            className={
              home
                ? "max-h-48 min-h-20 resize-none border-0 px-4 pt-3.5 text-sm shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0"
                : "max-h-48 min-h-14 resize-none border-0 px-4 pt-3.5 text-sm shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0"
            }
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-auto rounded-full border border-[#ece8e0] bg-[#faf9f6] px-2.5 py-1 text-xs font-normal text-muted-foreground"
                  >
                    {MODE_CHIP[state.settings.mode]}
                    <ChevronDownIcon className="size-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => updateSettings((s) => ({ ...s, mode: "parallel" }))}>
                    并排对照
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => updateSettings((s) => ({ ...s, mode: "roundtable" }))}>
                    圆桌
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {enabled.map((s) => (
                <HeaderModelPicker key={s.id} slot={s} variant="chip" />
              ))}
            </div>
            {noSlots ? (
              <p className="text-xs text-muted-foreground">至少启用一个席位</p>
            ) : roundsFull ? (
              <p className="text-xs text-muted-foreground">单个对话最多 200 轮，请新建对话。</p>
            ) : text.length >= LIMITS.input * 0.8 ? (
              <p className="text-xs text-muted-foreground">
                {text.length} / {LIMITS.input}
              </p>
            ) : null}
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
              <Button
                size="icon-sm"
                disabled={!canSend}
                onClick={submit}
                aria-label="发送"
                className="rounded-full"
              >
                <ArrowRightIcon />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
