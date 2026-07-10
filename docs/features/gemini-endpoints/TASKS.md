# Google Gemini Endpoints - Tasks

## PHASE 1: GEMINI DIALECT - COMPLETE

**Status:** Complete
**Progress:** 4/4 tasks complete (100%)
**Phase Started:** 2026-07-10
**Last Updated:** 2026-07-10
**Phase Completed:** 2026-07-10

### 1.1 Core types and conversions

- [x] **1.1.1** Add Gemini types to core.ts (2026-07-10)
  - `GeminiPart`, `GeminiContent`, `GeminiTool`, `GeminiRequest`,
    `GeminiCandidate`, `GeminiResponse`, `GeminiUsageMetadata`

- [x] **1.1.2** Add Gemini helpers to core.ts (2026-07-10)
  - `parseGeminiRequestBody`, `validateGeminiRequest`
  - `convertGeminiToInternal`, `convertGeminiToolsToInternal`
  - `createGeminiResponse`, `createGeminiStreamChunk`,
    `createGeminiErrorResponse`, `geminiToolCallId`,
    `generateGeminiResponseId`

### 1.2 HTTP handlers

- [x] **1.2.1** `handleGeminiGenerateContent` (stream + non-stream + auto-exec) (2026-07-10)
- [x] **1.2.2** `handleGeminiModels` and `handleGeminiModel` (2026-07-10)

### 1.3 Routing and logging

- [x] **1.3.1** Route `/v1beta/models/{model}:{method}` and `/v1beta/models` (2026-07-10)
- [x] **1.3.2** Add Gemini endpoint to startup logs (2026-07-10)

### 1.4 Tests

- [x] **1.4.1** Unit tests for Gemini parse/validate/convert/response helpers (2026-07-10)
  - 20 tests added to `src/test/core.test.ts`, all passing

## Notes

- Pre-existing unrelated test failure: `validateAnthropicRequest > should reject
system role in messages` (the validator now accepts inline system roles). Left
  untouched.
