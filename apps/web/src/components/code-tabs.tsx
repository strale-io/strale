"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface Tab {
  label: string;
  language: string;
  code: string;
}

export function CodeTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(tabs[active].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActive(i)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                i === active
                  ? "border-b-2 border-accent text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className="mr-3 rounded-md border border-border bg-surface-bright p-1.5 text-muted transition-colors hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      {/* Code */}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="font-mono">{tabs[active].code}</code>
      </pre>
    </div>
  );
}
