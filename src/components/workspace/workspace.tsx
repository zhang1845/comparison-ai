"use client";

import { DownloadIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { slotTabLabel } from "@/lib/presets";
import type { SlotId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ColumnsGrid, SlotColumn } from "./column";
import { Composer } from "./composer";
import { HomeLanding } from "./home-landing";
import { DB_UNAVAILABLE_TEXT, WorkspaceProvider, useWorkspace } from "./provider";
import { SessionRail } from "./session-rail";
import { SettingsSheet } from "./settings-sheet";
import { Timeline } from "./timeline";
import { Topbar } from "./topbar";
import { WorkspaceUiContext, useLayout, type Layout } from "./ui-state";

function Skeleton({ layout }: { layout: Layout }) {
  const count = layout === "narrow" ? 1 : 5;
  return (
    <div
      aria-hidden
      className={cn(
        "grid h-full gap-5 px-6 py-5",
        layout === "narrow" ? "grid-cols-1" : "grid-cols-[repeat(5,minmax(0,1fr))]",
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border bg-white">
          <div className="h-10" />
          <div className="m-2 mt-0 space-y-2 rounded-xl bg-[#f4f2ee] p-3">
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NarrowView() {
  const { state } = useWorkspace();
  const [picked, setPicked] = useState<"all" | SlotId>("all");
  const slots = state.settings.slots;
  const single = picked === "all" ? undefined : slots.find((s) => s.id === picked);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 overflow-x-auto px-3 pt-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="模型切换"
          value={picked}
          onValueChange={(v) => v && setPicked(v as "all" | SlotId)}
        >
          <ToggleGroupItem value="all" className="px-2.5 text-xs">
            全部
          </ToggleGroupItem>
          {slots.map((s) => {
            const label = slotTabLabel(s, Boolean(state.secrets.keys[s.id]));
            return (
              <ToggleGroupItem
                key={s.id}
                value={s.id}
                title={label}
                className="max-w-[9rem] truncate px-2.5 text-xs whitespace-nowrap"
              >
                {label}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>
      {single ? (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <SlotColumn slot={single} canvas className="flex-1" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {slots.map((s) => (
            <SlotColumn key={s.id} slot={s} canvas className="max-h-[70vh]" />
          ))}
        </div>
      )}
    </div>
  );
}

function Shell() {
  const { state, current, busy, announcement, stopAll, updateSettings, exportCurrent } = useWorkspace();
  const layout = useLayout();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const openSettings = useCallback((slotId?: SlotId) => {
    if (slotId) setExpanded(slotId);
    setSettingsOpen(true);
  }, []);
  const ui = useMemo(() => ({ openSettings }), [openSettings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && !e.defaultPrevented) {
        // Sheet 与对话框自己处理 Esc 关闭
        if (settingsOpen || railOpen || document.querySelector("[role=alertdialog],[role=dialog]")) return;
        if (busy) stopAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, railOpen, settingsOpen, stopAll]);

  const narrow = layout === "narrow";
  const noKeys = state.settings.slots.filter((s) => s.enabled).every((s) => !state.secrets.keys[s.id]);
  const hasRounds = (current?.rounds.length ?? 0) > 0;

  return (
    <WorkspaceUiContext.Provider value={ui}>
      <div className="flex h-dvh overflow-hidden bg-background">
        {layout === "wide" && <SessionRail className="w-[240px] shrink-0 border-r border-[#eeeae3] bg-[#faf9f6]" />}

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            layout={layout}
            home={!hasRounds}
            onOpenRail={() => setRailOpen(true)}
            onOpenSettings={() => openSettings()}
          />

          {hasRounds && state.settings.demo && (
            <div className="mx-3 flex shrink-0 items-center gap-3 rounded-lg bg-[#f1ede6] px-3 py-1.5 text-xs">
              <span className="font-medium">正在使用演示回答</span>
              <span className="hidden text-muted-foreground sm:inline">回答在浏览器本地生成，不访问任何厂商。</span>
              <Button
                variant="link"
                size="xs"
                className="ml-auto h-auto px-0 text-xs"
                onClick={() => updateSettings((s) => ({ ...s, demo: false }))}
              >
                关闭演示
              </Button>
            </div>
          )}
          {hasRounds && narrow && !state.settings.demo && state.ready && noKeys && (
            <div className="flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">尚未配置密钥</span>
              <Button
                variant="link"
                size="xs"
                className="ml-auto h-auto px-0 text-xs"
                onClick={() => updateSettings((s) => ({ ...s, demo: true }))}
              >
                使用演示回答
              </Button>
            </div>
          )}
          {state.ready && !state.dbAvailable && (
            <div role="alert" className="shrink-0 border-b bg-[#f7ecec] px-3 py-1.5 text-xs text-destructive">
              {DB_UNAVAILABLE_TEXT}
            </div>
          )}

          <main className="min-h-0 flex-1">
            {!state.ready ? (
              <Skeleton layout={layout} />
            ) : !hasRounds ? (
              <HomeLanding inputRef={inputRef} />
            ) : narrow ? (
              <NarrowView />
            ) : state.settings.view === "timeline" ? (
              <Timeline />
            ) : (
              <ColumnsGrid />
            )}
          </main>

          {hasRounds && <Composer inputRef={inputRef} />}
        </div>
      </div>

      {layout !== "wide" && (
        <Sheet open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent side="left" className="w-[280px] gap-0 bg-rail p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">会话</SheetTitle>
          <SheetDescription className="sr-only">最近会话</SheetDescription>
          <SessionRail className="min-h-0 flex-1" onPicked={() => setRailOpen(false)} />
          <div className="border-t p-3">
            <Button
              variant="outline"
              className="w-full bg-white"
              disabled={(current?.rounds.length ?? 0) === 0}
              onClick={exportCurrent}
            >
              <DownloadIcon />
              导出
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      )}

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        expanded={expanded}
        onExpandedChange={setExpanded}
      />

      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
    </WorkspaceUiContext.Provider>
  );
}

export function Workspace() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}
