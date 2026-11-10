---
slug: http-to-curl-api
title: "HTTP to cURL API: generate a command from a GET request"
description: "Convert a structured GET request into a cURL command with Strale. Keep the outer API call separate from the generated request and review code before running it."
group: agents
framework: "REST API"
language: "cURL"
tools: [http-to-curl]
---
Use `http-to-curl` to turn request details into code you can inspect. A successful API-key call costs {{price:http-to-curl}}. The converter generates text; it does not send the generated request or return the target server’s response.

## Convert a public catalogue request

Set `STRALE_API_KEY` to your API key. This call asks Strale to generate a GET request for its public tool catalogue:

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability_slug": "http-to-curl",
    "inputs": {
      "url": "https://api.strale.io/v1/capabilities",
      "method": "GET",
      "headers": { "Accept": "application/json" }
    },
    "max_price_cents": 2
  }'
```

The outer POST invokes Strale’s converter. The inner `method: GET` describes the command being generated. The example has no request body. Its `Accept` header requests a JSON response; it does not claim to send JSON data.

## Inspect the generated command

Read `output.curl_command`. For the inputs above it is:

```bash cURL
curl \
  'https://api.strale.io/v1/capabilities' \
  -H 'Accept: application/json'
```

The response also includes `equivalent_fetch` and `equivalent_axios` snippets. Review generated code before running it, especially after changing authentication, method or body. A generated string is not evidence of a successful HTTP call.

## Run or share it deliberately

Run the generated command only when you intend to contact its destination. Keep credentials out of shared examples: authentication supplied as converter input can appear in its output. The API key in the outer call above authenticates to Strale and is not part of the generated catalogue request.

See [HTTP to cURL](/tools/http-to-curl) for the inputs, example output and current limitations.
