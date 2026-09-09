import urllib.request, json

data = json.dumps({
    "messages": [{"role": "user", "content": "你好"}],
    "provider": "deepseek",
    "model": "deepseek-ai/DeepSeek-V3"
}).encode()

req = urllib.request.Request(
    "http://localhost:3100/chat",
    data=data,
    headers={"Content-Type": "application/json"}
)

resp = urllib.request.urlopen(req)
print(resp.read().decode()[:1000])
