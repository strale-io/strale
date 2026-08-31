Read-only recovery check. Do not edit any local file or mutate Notion.

Using the configured Notion MCP connection, query data source
`collection://5e1a81ee-7b9f-4d3c-b58d-c8d97ae6386c` with:

`SELECT * FROM "collection://5e1a81ee-7b9f-4d3c-b58d-c8d97ae6386c" ORDER BY createdTime, url LIMIT 100 OFFSET 200`

Return only whether the query succeeded, the row count, and whether the tool
reported an entitlement/usage limit. Do not summarize or reproduce row data.
