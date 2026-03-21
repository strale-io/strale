"""
Strale A2A Client Example

Demonstrates:
1. Discovering Strale's Agent Card
2. Listing available skills (capabilities)
3. Calling a free-tier capability via A2A (no API key required)

Requirements:
    pip install httpx

No API key needed for free-tier capabilities.
For paid capabilities, pass: Authorization: Bearer sk_live_...
"""

import httpx
import json
import sys

AGENT_CARD_URL = "https://api.strale.io/.well-known/agent-card.json"
A2A_ENDPOINT = "https://api.strale.io/a2a"


def discover_agent():
    """Fetch and display the Strale Agent Card."""
    print("=" * 60)
    print("Step 1: Discover Strale via Agent Card")
    print("=" * 60)

    resp = httpx.get(AGENT_CARD_URL)
    resp.raise_for_status()
    card = resp.json()

    print(f"Agent: {card['name']}")
    print(f"URL: {card['url']}")
    print(f"Skills: {len(card['skills'])}")
    print(f"Input modes: {card['defaultInputModes']}")
    print(f"Output modes: {card['defaultOutputModes']}")
    print()

    # Show free-tier skills
    free_skills = [s for s in card["skills"] if "FREE" in s.get("description", "")]
    print(f"Free-tier skills ({len(free_skills)}):")
    for skill in free_skills:
        print(f"  - {skill['id']}: {skill['name']}")
    print()

    return card


def call_capability(skill_id: str, inputs: dict, api_key: str | None = None):
    """Call a Strale capability via A2A JSON-RPC."""
    print("=" * 60)
    print(f"Step 2: Call '{skill_id}' via A2A")
    print("=" * 60)

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "jsonrpc": "2.0",
        "method": "message/send",
        "id": "example-1",
        "params": {
            "skillId": skill_id,
            "message": {
                "role": "user",
                "parts": [
                    {
                        "type": "data",
                        "data": inputs,
                    }
                ],
            },
        },
    }

    print(f"Request: message/send -> {skill_id}")
    print(f"Input: {json.dumps(inputs)}")
    print()

    resp = httpx.post(A2A_ENDPOINT, json=payload, headers=headers, timeout=30)
    result = resp.json()

    if "error" in result:
        print(f"Error: {result['error']['message']}")
        return result

    task = result.get("result", {})
    status = task.get("status", {})
    print(f"Status: {status.get('state')}")

    # Extract output from the response
    if status.get("state") == "completed":
        message = status.get("message", {})
        for part in message.get("parts", []):
            if part.get("type") == "data":
                output = part["data"]
                print(f"Output: {json.dumps(output, indent=2)}")

    # Show metadata
    metadata = task.get("metadata", {})
    if metadata:
        print(f"\nMetadata:")
        print(f"  Capability: {metadata.get('capability_used')}")
        print(f"  Latency: {metadata.get('latency_ms')}ms")
        if metadata.get("price_cents") is not None:
            print(f"  Cost: {metadata['price_cents']}c")

    return result


def main():
    # Step 1: Discover
    card = discover_agent()

    # Step 2: Call a free-tier capability (no API key needed)
    print()
    call_capability(
        skill_id="iban-validate",
        inputs={"iban": "DE89370400440532013000"},
    )

    print()
    print("=" * 60)
    print("Step 3: Try another free capability")
    print("=" * 60)
    print()

    call_capability(
        skill_id="email-validate",
        inputs={"email": "test@example.com"},
    )


if __name__ == "__main__":
    main()
