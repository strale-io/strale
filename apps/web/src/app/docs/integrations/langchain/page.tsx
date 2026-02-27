import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "LangChain Plugin",
  description: "Use all Strale capabilities as LangChain tools.",
};

export default function LangChainDocsPage() {
  return (
    <div>
      <h1>LangChain Plugin</h1>
      <p>
        The <code>langchain-strale</code> package wraps all 233 Strale capabilities as native
        LangChain tools. Install it with pip and your agents can discover and call them
        through the standard LangChain tool interface.
      </p>

      <h2>Installation</h2>
      <CodeBlock code="pip install langchain-strale" language="bash" />

      <h2>Quick start</h2>
      <CodeBlock
        code={`from langchain_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = toolkit.get_tools()

print(f"{len(tools)} tools available")
# → 233+ tools available`}
        language="python"
      />

      <h2>Using with an agent</h2>
      <CodeBlock
        code={`from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_strale import StraleToolkit

llm = ChatOpenAI(model="gpt-4o")
toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = toolkit.get_tools()

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful business analyst."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_openai_tools_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

result = executor.invoke({
    "input": "Look up Ericsson's company data in Sweden"
})`}
        language="python"
      />

      <h2>Filter by category</h2>
      <p>
        Load only the tools you need by filtering on category:
      </p>
      <CodeBlock
        code={`# Only load validation tools
tools = toolkit.get_tools(categories=["validation"])

# Only load company data tools
tools = toolkit.get_tools(categories=["data-extraction"])`}
        language="python"
      />

      <h2>Individual tool usage</h2>
      <CodeBlock
        code={`tool = toolkit.get_tool("vat-validate")
result = tool.run({"vat_number": "SE556012579001"})
print(result)`}
        language="python"
      />

      <h2>Meta-tools</h2>
      <p>
        The toolkit also includes two meta-tools:
      </p>
      <ul>
        <li><strong className="text-foreground">strale_search_capabilities</strong> &mdash; Search for capabilities by keyword</li>
        <li><strong className="text-foreground">strale_check_balance</strong> &mdash; Check your current wallet balance</li>
      </ul>
    </div>
  );
}
