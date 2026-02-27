"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({
  code,
  language = "typescript",
  filename,
}: {
  code: string;
  language?: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-surface">
      {filename && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="font-mono text-xs text-muted">{filename}</span>
          <span className="font-mono text-xs text-muted">{language}</span>
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
          <code className="font-mono">{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute right-3 top-3 rounded-md border border-border bg-surface-bright p-1.5 text-muted opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
          aria-label="Copy code"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
