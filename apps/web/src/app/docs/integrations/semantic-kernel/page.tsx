import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Semantic Kernel Plugin",
  description: "Use all Strale capabilities as Semantic Kernel functions.",
};

export default function SemanticKernelDocsPage() {
  return (
    <div>
      <h1>Semantic Kernel Plugin</h1>
      <p>
        The <code>strale-semantic-kernel</code> package exposes all Strale capabilities
        as Semantic Kernel functions. Compatible with the community TypeScript port of
        Semantic Kernel.
      </p>

      <h2>Installation</h2>
      <CodeBlock code="npm install strale-semantic-kernel" language="bash" />

      <h2>Quick start</h2>
      <CodeBlock
        code={`import { createStralePlugin } from "strale-semantic-kernel";

const plugin = await createStralePlugin({
  apiKey: "sk_live_YOUR_KEY",
});

console.log(\`\${plugin.functions.length} functions available\`);
// → 200+ functions available`}
        language="typescript"
      />

      <h2>Using with a Kernel</h2>
      <CodeBlock
        code={`import { Kernel } from "@semantic-kernel/core";
import { createStralePlugin } from "strale-semantic-kernel";

const kernel = new Kernel();

const plugin = await createStralePlugin({
  apiKey: "sk_live_YOUR_KEY",
});

kernel.addPlugin(plugin);

// The kernel can now invoke any Strale capability
const result = await kernel.invoke("strale", "swedish-company-data", {
  org_number: "5560125790",
});`}
        language="typescript"
      />

      <h2>Filter by category</h2>
      <CodeBlock
        code={`const plugin = await createStralePlugin({
  apiKey: "sk_live_YOUR_KEY",
  categories: ["validation", "financial"],
});`}
        language="typescript"
      />
    </div>
  );
}
