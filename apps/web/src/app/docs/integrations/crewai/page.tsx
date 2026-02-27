import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "CrewAI Plugin",
  description: "Use all Strale capabilities as CrewAI tools.",
};

export default function CrewAIDocsPage() {
  return (
    <div>
      <h1>CrewAI Plugin</h1>
      <p>
        The <code>crewai-strale</code> package wraps all 233 Strale capabilities as native
        CrewAI tools. Your crews can discover and call them through the standard CrewAI
        tool interface.
      </p>

      <h2>Installation</h2>
      <CodeBlock code="pip install crewai-strale" language="bash" />

      <h2>Quick start</h2>
      <CodeBlock
        code={`from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = toolkit.get_tools()

print(f"{len(tools)} tools available")
# → 233+ tools available`}
        language="python"
      />

      <h2>Using with a Crew</h2>
      <CodeBlock
        code={`from crewai import Agent, Task, Crew
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")

researcher = Agent(
    role="Business Analyst",
    goal="Research companies and validate their information",
    backstory="Expert at gathering business intelligence",
    tools=toolkit.get_tools(categories=["data-extraction", "validation"]),
    verbose=True,
)

task = Task(
    description="Look up Ericsson (org 5560125790) and validate their VAT number",
    expected_output="Company details and VAT validation result",
    agent=researcher,
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()`}
        language="python"
      />

      <h2>Filter by category</h2>
      <CodeBlock
        code={`# Only compliance tools
tools = toolkit.get_tools(categories=["compliance"])

# Multiple categories
tools = toolkit.get_tools(categories=["financial", "validation"])`}
        language="python"
      />
    </div>
  );
}
