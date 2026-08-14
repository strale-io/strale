"""KYB (know-your-business) verification agent.

LangChain agent that uses every active Strale capability as a tool
(via StraleToolkit) to run a company verification: registry lookup +
PEP (politically-exposed-person) screening. Prints a short summary.

Run: python kyb_agent.py [org_number] [company_name]
Defaults to Spotify AB / 556703-7485 (the manifest's own known-answer
fixture for swedish-company-data -- a real, always-resolvable org
number, verified live against https://api.strale.io as part of
building this example).
"""

import os
import sys

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_strale import StraleToolkit

load_dotenv()

STRALE_API_KEY = os.environ.get("STRALE_API_KEY")
if not STRALE_API_KEY:
    raise SystemExit(
        "STRALE_API_KEY is not set. Copy .env.example to .env and fill it in.\n"
        "Get a key (with EUR 2.00 trial credit) at https://strale.dev/signup"
    )
if not os.environ.get("ANTHROPIC_API_KEY"):
    raise SystemExit(
        "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in."
    )


def main() -> None:
    org_number = sys.argv[1] if len(sys.argv) > 1 else "556703-7485"
    company_name = sys.argv[2] if len(sys.argv) > 2 else "Spotify AB"

    # 250+ Strale capabilities become LangChain tools in one call. Filtering
    # by category keeps the tool list (and the agent's context window) to a
    # manageable size -- company-data + compliance is ~30 tools instead of
    # the full catalog. StraleToolkit also always adds strale_search (find
    # a capability by keyword) and strale_balance (check wallet balance).
    toolkit = StraleToolkit(api_key=STRALE_API_KEY)
    tools = toolkit.get_tools(categories=["company-data", "compliance"])
    print(f"Loaded {len(tools)} Strale tools (company-data + compliance)\n")

    agent = create_agent(
        model="anthropic:claude-sonnet-5",
        tools=tools,
        system_prompt=(
            "You are a KYB (know-your-business) verification assistant. "
            "You have Strale tools for company registry lookups and "
            "compliance screening. Swedish company lookups require an "
            "organisation number (format NNNNNN-NNNN), not a free-text "
            "company name -- the underlying registry API has no name "
            "search. If given only a name, say you need the org number "
            "instead of guessing one; use strale_search to find a VAT or "
            "name-resolution capability first if one might apply. "
            "For a full check: call swedish-company-data for registry "
            "status, then pep-check on the company name for "
            "politically-exposed-person screening. Summarize findings "
            "in under 150 words, calling out anything that would block "
            "onboarding."
        ),
    )

    prompt = (
        f"Run a KYB check on {company_name}, Swedish organisation number "
        f"{org_number}."
    )
    result = agent.invoke({"messages": [{"role": "user", "content": prompt}]})

    print("=== SUMMARY ===")
    print(result["messages"][-1].content)


if __name__ == "__main__":
    main()
