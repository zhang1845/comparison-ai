"use client";

import { DownloadIcon, MenuIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatMode, WorkspaceView } from "@/lib/types";
import { useWorkspace } from "./provider";
import type { Layout } from "./ui-state";

export function Topbar({
  layout,
  onOpenRail,
  onOpenSettings,
}: {
  layout: Layout;
  onOpenRail: () => void;
  onOpenSettings: () => void;
}) {
  const { state, current, updateSettings, newSession, exportCurrent } = useWorkspace();
  const { settings, secrets } = state;
  const narrow = layout === "narrow";
  const noKeys = settings.slots.filter((s) => s.enabled).every((s) => !secrets.keys[s.id]);
  const canExport = (current?.rounds.length ?? 0) > 0;

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b px-3">
      {layout !== "wide" && (
        <Button variant="ghost" size="icon-sm" aria-label="打开会话列表" onClick={onOpenRail}>
          <MenuIcon />
        </Button>
      )}
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="shrink-0 text-base font-semibold">五席</h1>
        {!narrow && <p className="truncate text-xs text-muted-foreground">一条问题，五个模型并排作答</p>}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="模式"
          value={settings.mode}
          onValueChange={(v) => v && updateSettings((s) => ({ ...s, mode: v as ChatMode }))}
        >
          <ToggleGroupItem value="parallel" className="px-2.5 text-xs">
            并行对比
          </ToggleGroupItem>
          <ToggleGroupItem value="roundtable" className="px-2.5 text-xs">
            圆桌
          </ToggleGroupItem>
        </ToggleGroup>

        {!narrow && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="视图"
            value={settings.view}
            onValueChange={(v) => v && updateSettings((s) => ({ ...s, view: v as WorkspaceView }))}
          >
            <ToggleGroupItem value="columns" className="px-2.5 text-xs">
              分栏
            </ToggleGroupItem>
            <ToggleGroupItem value="timeline" className="px-2.5 text-xs">
              时间线
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {!narrow && state.ready && !settings.demo && noKeys && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => updateSettings((s) => ({ ...s, demo: true }))}
          >
            使用演示回答
          </Button>
        )}

        {!narrow && (
          <>
            <Button variant="ghost" size="sm" onClick={newSession}>
              <PlusIcon />
              新对话
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="ghost" size="sm" disabled={!canExport} onClick={exportCurrent}>
                    <DownloadIcon />
                    导出
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>下载这则对话的 Markdown</TooltipContent>
            </Tooltip>
          </>
        )}

        <Button variant="outline" size="sm" onClick={onOpenSettings}>
          <SlidersHorizontalIcon />
          {narrow ? <span className="sr-only">席位设置</span> : "席位设置"}
        </Button>
      </div>
    </header>
  );
}
