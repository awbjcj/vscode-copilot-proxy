# Google Gemini Endpoints - Feature Design Document

## Overview

Add a Google Gemini (`generateContent`) API dialect to the Copilot Proxy so that
clients using the `google-genai` SDK - pointed at this proxy's base URL - can
talk to GitHub Copilot models. This mirrors the existing Anthropic Messages
support: incoming Gemini requests are converted to the internal `ChatMessage`
format and served through `vscode.lm`, exactly like the OpenAI and Anthropic
dialects.

The proxy does **not** call Google's API and requires no `GEMINI_API_KEY`. It
speaks the Gemini wire format but the responses come from Copilot models.

## Problem Statement

The proxy already speaks two dialects (OpenAI `/v1/chat/completions` and
Anthropic `/v1/messages`). Tooling built on the Google Gen AI SDK expects the
Gemini REST surface (`/v1beta/models/{model}:generateContent`). Without it,
those clients cannot use Copilot models through the proxy.

## Solution

Add the Gemini dialect endpoints and the conversions needed to bridge them to
the internal format.

### Endpoints

| Method | Path                                           | Purpose                              |
| ------ | ---------------------------------------------- | ------------------------------------ |
| POST   | `/v1beta/models/{model}:generateContent`       | Non-streaming generation             |
| POST   | `/v1beta/models/{model}:streamGenerateContent` | SSE streaming generation             |
| GET    | `/v1beta/models`                               | List available models (Gemini shape) |
| GET    | `/v1beta/models/{model}`                       | Single-model lookup                  |

The `{model}` segment is matched against Copilot models via the existing
`findBestModel` logic (`gemini` is already a key identifier), so a request for
`gemini-2.5-flash` resolves to the best available Copilot model, or the
configured default, or the first available model.

### Request/response mapping

| Gemini                                   | Internal / VS Code                      |
| ---------------------------------------- | --------------------------------------- |
| `systemInstruction.parts[].text`         | system message (converted to user role) |
| `contents[]` role `user`                 | user message                            |
| `contents[]` role `model`                | assistant message                       |
| part `functionCall`                      | assistant `tool_calls`                  |
| part `functionResponse`                  | `tool` result message                   |
| request `tools[].functionDeclarations[]` | internal `Tool[]`                       |
| response text                            | candidate part `{ text }`               |
| response tool call                       | candidate part `{ functionCall }`       |

Gemini function calls/responses have no ids and are correlated by name. The
internal format and VS Code LM API correlate by id, so a stable id is derived
from the function name (`gemini-call-{name}`). Limitation: multiple concurrent
calls to the same function in one turn share an id; distinct names are the norm.

### Streaming

`:streamGenerateContent` emits Server-Sent Events (`data: {json}\n\n`), which is
what the `google-genai` SDK requests via `?alt=sse`. Intermediate chunks carry
delta parts; the final chunk carries `finishReason: STOP` and `usageMetadata`.
If Copilot yields nothing, an empty text part is emitted so the stream stays
well-formed (same guard as the Anthropic handler).

### Proxy extensions

The proxy-specific `use_vscode_tools`, `tool_execution: 'auto'`, and
`max_tool_rounds` options are honored (non-standard fields ignored by Google
SDKs), reusing the shared `runAutoExecuteLoop`.

## Architecture

```
google-genai SDK                       Proxy                          VS Code LM API
    |                                    |                                  |
    |  POST /v1beta/models/{m}:...       |                                  |
    |  { contents, systemInstruction }   |                                  |
    |----------------------------------->|                                  |
    |                                    | convertGeminiToInternal()        |
    |                                    | convertToVSCodeMessages()        |
    |                                    | sendRequestWithRetry()           |
    |                                    |--------------------------------->|
    |                                    |     text / tool-call parts       |
    |                                    |<---------------------------------|
    |   GeminiResponse / SSE chunks      | createGeminiResponse()           |
    |<-----------------------------------| createGeminiStreamChunk()        |
```

## Files

- `src/core.ts` - Gemini types + `parseGeminiRequestBody`,
  `validateGeminiRequest`, `convertGeminiToInternal`,
  `convertGeminiToolsToInternal`, `createGeminiResponse`,
  `createGeminiStreamChunk`, `createGeminiErrorResponse`, `geminiToolCallId`
- `src/extension.ts` - `handleGeminiGenerateContent`, `handleGeminiModels`,
  `handleGeminiModel`, routing in `createServer`
- `src/test/core.test.ts` - conversion/validation/response unit tests

## Non-goals

- Calling Google's API directly (no external key / backend).
- `countTokens`, embeddings, image generation, or file upload endpoints.
- Multimodal `inlineData` / `fileData` parts (text and tools only).
