curl -X POST http://127.0.0.1:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: a" \
  -d '{
    "model": "claude-opus-4.6",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ]
  }'