#!/bin/bash
TYPEFULLY_MCP="https://mcp.typefully.com/mcp?TYPEFULLY_API_KEY=dced9NYbgoQdgbqrADTF70g7AuwYWCJz"
GRAPHICS_DIR="/c/Users/pette/Projects/strale/growth-plan/graphics"

upload_and_attach() {
  local DRAFT_ID=$1
  local FILENAME=$2
  local TITLE=$3

  echo "=== $TITLE (draft $DRAFT_ID) ==="

  # Step 1: Get upload URL via structuredContent
  RESP=$(curl -s -X POST "$TYPEFULLY_MCP" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":100,\"method\":\"tools/call\",\"params\":{\"name\":\"typefully_create_media_upload\",\"arguments\":{\"social_set_id\":298868,\"requestBody\":{\"file_name\":\"$FILENAME\"}}}}" 2>&1)

  MEDIA_ID=$(python3 -c "
import json, re, sys
data = sys.stdin.read()
m = re.search(r'data: ({.*})', data)
if m:
    parsed = json.loads(m.group(1))
    sc = parsed.get('result',{}).get('structuredContent',{})
    print(sc.get('media_id',''))
" <<< "$RESP")

  UPLOAD_URL=$(python3 -c "
import json, re, sys
data = sys.stdin.read()
m = re.search(r'data: ({.*})', data)
if m:
    parsed = json.loads(m.group(1))
    sc = parsed.get('result',{}).get('structuredContent',{})
    print(sc.get('upload_url',''))
" <<< "$RESP")

  if [ -z "$MEDIA_ID" ] || [ -z "$UPLOAD_URL" ]; then
    echo "  ERROR: no media_id or upload_url"
    return 1
  fi
  echo "  media_id: $MEDIA_ID"

  # Step 2: Upload raw bytes with PUT
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -T "$GRAPHICS_DIR/$FILENAME" "$UPLOAD_URL")
  echo "  upload: HTTP $HTTP_CODE"

  if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "204" ]; then
    echo "  ERROR: Upload failed ($HTTP_CODE)"
    return 1
  fi

  sleep 1

  # Step 3: Get current draft to preserve text
  DRAFT_RESP=$(curl -s -X POST "$TYPEFULLY_MCP" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":102,\"method\":\"tools/call\",\"params\":{\"name\":\"typefully_get_draft\",\"arguments\":{\"social_set_id\":298868,\"draft_id\":$DRAFT_ID}}}" 2>&1)

  # Step 4: Build edit payload with media on first post
  EDIT_BODY=$(python3 -c "
import json, re, sys
data = sys.stdin.read()
m = re.search(r'data: ({.*})', data)
if m:
    parsed = json.loads(m.group(1))
    sc = parsed.get('result',{}).get('structuredContent',{})
    x_posts = sc.get('platforms',{}).get('x',{}).get('posts',[])
    result_posts = []
    for i, p in enumerate(x_posts):
        entry = {'text': p['text']}
        if i == 0:
            entry['media_ids'] = ['$MEDIA_ID']
        result_posts.append(entry)
    body = {'platforms':{'x':{'enabled':True,'posts':result_posts}}}
    print(json.dumps(body))
" <<< "$DRAFT_RESP")

  # Step 5: Edit draft to attach media
  EDIT_RESP=$(curl -s -X POST "$TYPEFULLY_MCP" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":103,\"method\":\"tools/call\",\"params\":{\"name\":\"typefully_edit_draft\",\"arguments\":{\"social_set_id\":298868,\"draft_id\":$DRAFT_ID,\"requestBody\":$EDIT_BODY}}}" 2>&1)

  STATUS=$(python3 -c "
import json, re, sys
data = sys.stdin.read()
m = re.search(r'data: ({.*})', data)
if m:
    parsed = json.loads(m.group(1))
    sc = parsed.get('result',{}).get('structuredContent',{})
    print(sc.get('status','unknown'))
" <<< "$EDIT_RESP")

  echo "  result: $STATUS"
  echo ""
}

# Map: draft_id, filename, title
upload_and_attach 8749312 "2-x-17apr-problem-statement.png" "#2 Problem statement"
upload_and_attach 8749313 "3-x-17apr-capability-count.png" "#3 Capability count"
upload_and_attach 8749318 "5-x-20apr-kyb-demo.png" "#5 KYB demo"
upload_and_attach 8749323 "8-x-21apr-sqs-distribution.png" "#8 SQS distribution"
upload_and_attach 8749326 "11-x-22apr-email-validate.png" "#11 Email validate"
upload_and_attach 8749339 "14-x-23apr-mcp-quality.png" "#14 MCP quality gap"
upload_and_attach 8749340 "15-x-23apr-pep-check.png" "#15 PEP check"
upload_and_attach 8749341 "16-x-24apr-dns-demo.png" "#16 DNS demo"
upload_and_attach 8749351 "18-x-25apr-free-tier.png" "#18 Free tier"
upload_and_attach 8749356 "22-x-28apr-langchain.png" "#22 LangChain"
upload_and_attach 8749364 "25-x-29apr-audit-trail.png" "#25 Audit trail"

echo "=== ALL DONE ==="
