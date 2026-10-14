"use client";

import { CodeIcon, LightbulbIcon, MailIcon, MapIcon, PenLineIcon, ScaleIcon } from "lucide-react";
import { useEffect } from "react";
import { Composer } from "./composer";
import { useWorkspace } from "./provider";

const STARTERS = [
  {
    title: "解释一个概念",
    hint: "用大白话讲清楚量子纠缠",
    prompt: "用大白话解释量子纠缠，并举一个生活里的类比。",
    icon: LightbulbIcon,
  },
  {
    title: "写一封邮件",
    hint: "礼貌地拒绝一个邀约",
    prompt: "帮我写一封礼貌但明确的拒信，对方邀请我下周做一次分享，我时间不够。",
    icon: MailIcon,
  },
  {
    title: "对比两个方案",
    hint: "远程办公还是回公司",
    prompt: "比较「长期远程」和「回公司办公」对小团队的利弊，给一个建议。",
    icon: ScaleIcon,
  },
  {
    title: "改得更清楚",
    hint: "把这段话写顺",
    prompt: "把下面这句话改得更清楚、更书面：我们大概下周左右可能会把那个东西弄一下。",
    icon: PenLineIcon,
  },
  {
    title: "周末怎么玩",
    hint: "两天的城市走走",
    prompt: "在杭州过一个轻松的周末，两天行程，不要排太满，偏吃饭和散步。",
    icon: MapIcon,
  },
  {
    title: "找这段的问题",
    hint: "看一段代码哪里不对",
    prompt: "这段 Python 代码可能有什么问题？\n\nfor i in range(len(items)):\n    print(items[i + 1])",
    icon: CodeIcon,
  },
];

export function HomeLanding({ inputRef }: { inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const { state, send } = useWorkspace();
  const noSlots = state.settings.slots.every((s) => !s.enabled);
  const canStart = state.ready && !noSlots;

  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-[640px]">
        <h2 className="mb-8 text-center text-[32px] font-normal tracking-tight text-[#2c2925]">想做什么？</h2>
        <Composer inputRef={inputRef} variant="home" />
        <p className="mt-5 mb-2 text-xs text-muted-foreground">或者从这里开始</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STARTERS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                disabled={!canStart}
                className="flex items-start gap-2.5 rounded-xl border border-[#ece8e0] bg-white px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(28,25,21,0.03)] transition-colors hover:bg-[#faf9f6] disabled:opacity-50"
                onClick={() => send(item.prompt)}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{item.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
