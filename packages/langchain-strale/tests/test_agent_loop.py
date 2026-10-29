"""Offline tests: drive Strale tools through langchain-core's own primitives.

A fake chat model (``GenericFakeChatModel``) emits tool calls; ``bind_tools``
converts the tools with ``convert_to_openai_tool`` exactly as a real provider
integration does; each ``ToolCall`` is passed to ``BaseTool.invoke`` and must
come back as a ``ToolMessage``. HTTP is mocked with ``responses``, so no key
and no network are needed.
"""

from __future__ import annotations

import json
from importlib.metadata import version
from typing import Any

import pytest
import requests
import responses
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.utils.function_calling import convert_to_openai_tool

from langchain_strale import StraleExecuteTool, StraleToolkit

BASE = "https://api.test.strale"
CLIENT_ID = "langchain-strale/" + version("langchain-strale")


class ToolCallingFakeModel(GenericFakeChatModel):
    """GenericFakeChatModel with the bind_tools a provider integration supplies."""

    bound_tools: list[dict[str, Any]] = []

    def bind_tools(self, tools, **kwargs):  # type: ignore[override]
        self.bound_tools = [convert_to_openai_tool(t) for t in tools]
        return self


def run_agent(model, tools, prompt: str) -> list:
    """The minimal tool loop: invoke the model, run each tool call, feed results back."""
    by_name = {t.name: t for t in tools}
    messages: list = [HumanMessage(prompt)]
    while True:
        ai = model.invoke(messages)
        messages.append(ai)
        if not ai.tool_calls:
            return messages
        for call in ai.tool_calls:
            messages.append(by_name[call["name"]].invoke(call))


def call(name: str, args: dict[str, Any], call_id: str) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id, "type": "tool_call"}])


def mock_search() -> None:
    responses.get(
        f"{BASE}/v1/suggest/typeahead",
        json={
            "total": 1,
            "results": [
                {
                    "type": "capability",
                    "slug": "iban-validate",
                    "name": "IBAN Validate",
                    "description": "Validate an IBAN",
                    "category": "finance",
                    "price_cents": 2,
                    "geography": None,
                    "is_free_tier": True,
                }
            ],
        },
    )
    responses.get(
        f"{BASE}/v1/capabilities/iban-validate",
        json={
            "slug": "iban-validate",
            "price_cents": 2,
            "input_schema": {"type": "object", "properties": {"iban": {"type": "string"}}, "required": ["iban"]},
        },
    )


@responses.activate
def test_search_then_execute_through_fake_model():
    mock_search()
    responses.post(
        f"{BASE}/v1/do",
        json={
            "result": {
                "status": "completed",
                "output": {"valid": True, "country": "SE"},
                "price_cents": 0,
                "latency_ms": 12,
                "provenance": {"source": "algorithmic", "fetched_at": "2026-10-29T00:00:00Z"},
                "transaction_id": "tx_1",
            }
        },
    )
    toolkit = StraleToolkit(api_key="sk_test_fixture", base_url=BASE, max_price_cents=50)
    tools = toolkit.get_meta_tools()
    model = ToolCallingFakeModel(
        messages=iter(
            [
                call("strale_search", {"query": "validate iban"}, "c1"),
                call("strale_execute", {"slug": "iban-validate", "inputs": {"iban": "DE89370400440532013000"}}, "c2"),
                AIMessage(content="The IBAN is valid."),
            ]
        )
    ).bind_tools(tools)

    # bind_tools saw provider-ready schemas generated from the args_schema models.
    schemas = {t["function"]["name"]: t["function"]["parameters"] for t in model.bound_tools}
    assert set(schemas) == {"strale_search", "strale_execute", "strale_balance"}
    assert schemas["strale_search"]["required"] == ["query"]
    assert set(schemas["strale_execute"]["required"]) == {"slug", "inputs"}
    assert schemas["strale_execute"]["properties"]["type"]["enum"] == ["capability", "solution"]

    messages = run_agent(model, tools, "Is DE89370400440532013000 a valid IBAN?")

    tool_messages = [m for m in messages if isinstance(m, ToolMessage)]
    assert [m.tool_call_id for m in tool_messages] == ["c1", "c2"]
    assert all(m.status == "success" for m in tool_messages)
    found = json.loads(tool_messages[0].content)
    assert found["ok"] is True
    assert found["results"][0]["slug"] == "iban-validate"
    assert found["results"][0]["input_schema"]["required"] == ["iban"]
    assert found["results"][0]["is_free_tier"] is True
    ran = json.loads(tool_messages[1].content)
    assert ran == {
        "ok": True,
        "rail": "api_key",
        "slug": "iban-validate",
        "output": {"valid": True, "country": "SE"},
        "price_cents": 0,
        "latency_ms": 12,
        "provenance": {"source": "algorithmic", "fetched_at": "2026-10-29T00:00:00Z"},
        "transaction_id": "tx_1",
        "status": "completed",
    }
    assert messages[-1].content == "The IBAN is valid."

    # Attribution on every request; the key only where a charge can happen.
    for c in responses.calls:
        assert c.request.headers["X-Strale-Client"] == CLIENT_ID
        if c.request.url.startswith(f"{BASE}/v1/do"):
            assert c.request.headers["Authorization"] == "Bearer sk_test_fixture"
        else:
            assert "Authorization" not in c.request.headers
    do_body = json.loads(responses.calls[-1].request.body)
    assert do_body == {
        "capability_slug": "iban-validate",
        "inputs": {"iban": "DE89370400440532013000"},
        "max_price_cents": 50,
    }


@responses.activate
def test_keyless_paid_call_returns_payment_guidance(monkeypatch):
    monkeypatch.delenv("STRALE_API_KEY", raising=False)
    responses.post(
        f"{BASE}/v1/do",
        status=401,
        json={"error_code": "unauthorized", "message": "API key required"},
    )
    tools = StraleToolkit(base_url=BASE).get_meta_tools()
    model = ToolCallingFakeModel(
        messages=iter([call("strale_execute", {"slug": "uk-company-data", "inputs": {"company_number": "00000006"}}, "c1"), AIMessage(content="done")])
    ).bind_tools(tools)
    msgs = run_agent(model, tools, "Look up UK company 00000006")
    result = json.loads(msgs[2].content)
    assert result["ok"] is False
    assert result["status"] == 401
    assert result["error_code"] == "unauthorized"
    assert "STRALE_API_KEY" in result["how_to_pay"]
    assert "/x402/uk-company-data" in result["how_to_pay"]
    assert "Authorization" not in responses.calls[0].request.headers


@responses.activate
def test_gated_solution_is_not_ok():
    responses.post(
        f"{BASE}/v1/solutions/kyb-essentials-se/execute",
        json={"result": {"status": "completed", "gated": {"reason": "company not found"}, "steps": []}},
    )
    tool = StraleExecuteTool(client=StraleToolkit(api_key="sk_test_fixture", base_url=BASE)._get_client())
    msg = tool.invoke(
        {
            "name": "strale_execute",
            "args": {"slug": "kyb-essentials-se", "type": "solution", "inputs": {"org_number": "5560000000"}},
            "id": "c1",
            "type": "tool_call",
        }
    )
    assert isinstance(msg, ToolMessage)
    result = json.loads(msg.content)
    assert result["ok"] is False
    assert result["gated"] == {"reason": "company not found"}
    assert json.loads(responses.calls[0].request.body)["max_price_cents"] == 200


@responses.activate
def test_network_failure_becomes_error_tool_message():
    responses.post(f"{BASE}/v1/do", body=requests.ConnectionError("connection reset"))
    tool = StraleToolkit(api_key="sk_test_fixture", base_url=BASE).get_meta_tools()[1]
    msg = tool.invoke(
        {"name": "strale_execute", "args": {"slug": "iban-validate", "inputs": {"iban": "x"}}, "id": "c1", "type": "tool_call"}
    )
    assert isinstance(msg, ToolMessage)
    assert msg.status == "error"
    assert "Do not retry a paid tool" in msg.content


@responses.activate
def test_per_capability_tool_through_fake_model():
    responses.get(
        f"{BASE}/v1/capabilities",
        json={
            "capabilities": [
                {
                    "slug": "vat-format-validate",
                    "description": "Check an EU VAT number's format",
                    "category": "validation",
                    "price_cents": 2,
                    "input_schema": {
                        "type": "object",
                        "properties": {"vat_number": {"type": "string", "description": "VAT number"}},
                        "required": ["vat_number"],
                    },
                }
            ]
        },
    )
    responses.post(f"{BASE}/v1/do", json={"result": {"status": "completed", "output": {"valid": True}}, "meta": {}})
    tools = StraleToolkit(api_key="sk_test_fixture", base_url=BASE).get_tools()
    assert [t.name for t in tools] == ["vat-format-validate", "strale_search", "strale_execute", "strale_balance"]
    model = ToolCallingFakeModel(
        messages=iter([call("vat-format-validate", {"vat_number": "SE556703748501"}, "c1"), AIMessage(content="ok")])
    ).bind_tools(tools)
    schema = next(t for t in model.bound_tools if t["function"]["name"] == "vat-format-validate")
    assert schema["function"]["parameters"]["required"] == ["vat_number"]
    assert "€0.02" in schema["function"]["description"]
    msgs = run_agent(model, tools, "Check SE556703748501")
    assert json.loads(msgs[2].content)["output"] == {"valid": True}
    assert json.loads(responses.calls[1].request.body) == {
        "capability_slug": "vat-format-validate",
        "inputs": {"vat_number": "SE556703748501"},
        "max_price_cents": 2,
    }


def test_max_price_cap_is_bounded():
    with pytest.raises(ValueError):
        StraleToolkit(max_price_cents=0)
    with pytest.raises(ValueError):
        StraleToolkit(max_price_cents=2001)


X402_CHALLENGE = {"x402Version": 1, "accepts": [{"scheme": "exact", "network": "base"}], "error": "Payment required"}


def capability_tool(input_schema, api_key=None):
    responses.get(
        f"{BASE}/v1/capabilities",
        json={"capabilities": [{"slug": "uk-company-data", "description": "UK company", "category": "company-data", "price_cents": 10, "input_schema": input_schema}]},
    )
    return StraleToolkit(api_key=api_key, base_url=BASE).get_tools()[0]


@responses.activate
def test_keyless_x402_challenge_is_an_error_on_both_paths(monkeypatch):
    # The x402 challenge body has no error_code; the 402 status must decide.
    monkeypatch.delenv("STRALE_API_KEY", raising=False)
    responses.post(f"{BASE}/v1/do", status=402, json=X402_CHALLENGE)
    tool = capability_tool({"type": "object", "properties": {"company_number": {"type": "string"}}, "required": ["company_number"]})
    msg = tool.invoke({"name": tool.name, "args": {"company_number": "00000006"}, "id": "c1", "type": "tool_call"})
    assert msg.status == "error"
    err = json.loads(msg.content)
    assert err["ok"] is False and err["status"] == 402 and err["message"] == "Payment required"
    assert "/x402/uk-company-data" in err["how_to_pay"]

    execute = StraleToolkit(base_url=BASE).get_meta_tools()[1]
    out = json.loads(execute.invoke({"slug": "uk-company-data", "inputs": {"company_number": "00000006"}}))
    assert out["ok"] is False and out["error_code"] == "payment_required" and "how_to_pay" in out


@responses.activate
def test_omitted_optional_fields_are_not_sent_as_null():
    responses.post(f"{BASE}/v1/do", json={"result": {"status": "completed", "output": {}}})
    tool = capability_tool(
        {"type": "object", "properties": {"company_number": {"type": "string"}, "include_officers": {"type": "boolean"}}, "required": ["company_number"]},
        api_key="sk_test_fixture",
    )
    tool.invoke({"company_number": "00000006"})
    assert json.loads(responses.calls[-1].request.body)["inputs"] == {"company_number": "00000006"}


@responses.activate
def test_per_capability_timeout_warns_against_retry():
    responses.post(f"{BASE}/v1/do", body=requests.Timeout("read timed out"))
    tool = capability_tool({"type": "object", "properties": {"company_number": {"type": "string"}}}, api_key="sk_test_fixture")
    msg = tool.invoke({"name": tool.name, "args": {"company_number": "00000006"}, "id": "c1", "type": "tool_call"})
    assert msg.status == "error"
    assert "Do not retry a paid tool" in msg.content
