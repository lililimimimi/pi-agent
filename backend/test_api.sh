#!/bin/bash

echo "=== 1. 健康检查 ==="
curl -s http://localhost:8000/api/health
echo ""

echo ""
echo "=== 2. 创建会话 ==="
RESPONSE=$(curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}],"provider":"mock","model":"mock-1"}')
echo $RESPONSE

SESSION=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")
echo "Session ID: $SESSION"

echo ""
echo "=== 3. SSE 流式输出 ==="
curl -sN "http://localhost:8000/api/chat/stream/$SESSION"
echo ""
