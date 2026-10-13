"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatClock, sessionTitle } from "@/lib/format";
import type { Session } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./provider";

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function SessionItem({ session, active, onPicked }: { session: Session; active: boolean; onPicked?: () => void }) {
  const { selectSession, renameSession } = useWorkspace();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const [confirming, setConfirming] = useState(false);

  if (renaming) {
    const commit = () => {
      renameSession(session.id, draft);
      setRenaming(false);
    };
    return (
      <div className="px-2 py-1">
        <Input
          autoFocus
          value={draft}
          maxLength={60}
          aria-label="重命名对话"
          className="h-8 bg-white text-sm"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) commit();
            if (e.key === "Escape") {
              e.stopPropagation();
              setRenaming(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group/item relative flex items-center rounded-md border-l-2 transition-colors",
        active ? "border-l-foreground bg-[#e2dbcf]" : "border-l-transparent hover:bg-[#e6e0d6]",
      )}
    >
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        className="min-w-0 flex-1 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => {
          selectSession(session.id);
          onPicked?.();
        }}
      >
        <span className="block truncate text-sm">{sessionTitle(session)}</span>
        <span className="block font-mono text-[11px] text-muted-foreground">
          {formatClock(session.updatedAt)} · {session.rounds.length} 轮
        </span>
      </button>
      <div className="flex shrink-0 gap-0.5 pr-1 opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="重命名"
          onClick={() => {
            setDraft(sessionTitle(session));
            setRenaming(true);
          }}
        >
          <PencilIcon />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="删除" onClick={() => setConfirming(true)}>
          <Trash2Icon />
        </Button>
      </div>
      <DeleteDialog open={confirming} onOpenChange={setConfirming} sessionId={session.id} />
    </div>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
}) {
  const { removeSession } = useWorkspace();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除这则对话？</AlertDialogTitle>
          <AlertDialogDescription>删除这则对话？此操作只影响这台浏览器。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => removeSession(sessionId)}>
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SessionRail({ onPicked, className }: { onPicked?: () => void; className?: string }) {
  const { state, newSession } = useWorkspace();
  const sessions = state.sessions.filter((s) => s.rounds.length > 0).sort((a, b) => b.updatedAt - a.updatedAt);
  // 预渲染时还没有会话数据，也不能读当前时间
  const today = state.ready ? startOfToday() : 0;
  const groups = [
    { label: "今天", items: sessions.filter((s) => s.updatedAt >= today) },
    { label: "更早", items: sessions.filter((s) => s.updatedAt < today) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className={cn("flex h-full flex-col bg-rail", className)}>
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start bg-white"
          onClick={() => {
            newSession();
            onPicked?.();
          }}
        >
          <PlusIcon />
          新对话
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="最近会话" className="space-y-4 px-2 pb-4">
          {!state.ready ? (
            <div className="space-y-2 px-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded-md bg-[#e6e0d6]" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-2 text-sm leading-relaxed text-muted-foreground">
              还没有对话。发送第一条消息后，会记在这台浏览器里。
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="space-y-0.5">
                <p className="px-2.5 pb-1 text-xs text-muted-foreground">{g.label}</p>
                {g.items.map((s) => (
                  <SessionItem key={s.id} session={s} active={s.id === state.currentId} onPicked={onPicked} />
                ))}
              </div>
            ))
          )}
        </nav>
      </ScrollArea>
    </div>
  );
}
