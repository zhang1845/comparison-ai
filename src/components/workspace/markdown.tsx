"use client";

import { memo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

function CodeBlock(props: React.ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.textContent ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默
    }
  };
  return (
    <div className="relative">
      <pre ref={ref} {...props} />
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="absolute top-1.5 right-1.5 bg-white/90"
        onClick={copy}
      >
        {copied ? "已复制" : "复制"}
      </Button>
    </div>
  );
}

const components: Components = {
  a: ({ node, ...props }) => {
    void node;
    return <a {...props} target="_blank" rel="noreferrer" />;
  },
  pre: ({ node, ...props }) => {
    void node;
    return <CodeBlock {...props} />;
  },
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
});
