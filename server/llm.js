// llm.js — optional LLM layer (OpenAI-compatible). Fully env-configured.
// When OPENAI_API_KEY is absent every caller must fall back to the
// deterministic engine; this module itself never decides that, it only
// reports configuration and executes chat completions with guardrails.
// No side effects on import: the client is built lazily on first use and
// the API key is never logged.
import OpenAI from 'openai';

export const LLM_TIMEOUT_MS = 10_000;
export const LLM_MAX_TOKENS = 300;
export const LLM_TEMPERATURE = 0.3;

export const isLlmConfigured = () => Boolean(process.env.OPENAI_API_KEY?.trim());

export const llmModel = () => process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

let client = null;
const getClient = () => {
  if (!client) {
    const baseURL = process.env.OPENAI_BASE_URL?.trim();
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(baseURL ? { baseURL } : {}),
    });
  }
  return client;
};

// llmChat({ system, messages, maxTokens }) -> string.
// Throws on network error, timeout (10s abort), or empty completion —
// callers are expected to catch and fall back to deterministic output.
export async function llmChat({ system, messages, maxTokens = LLM_MAX_TOKENS }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const completion = await getClient().chat.completions.create(
      {
        model: llmModel(),
        temperature: LLM_TEMPERATURE,
        max_tokens: Math.min(Math.max(1, Number(maxTokens) || LLM_MAX_TOKENS), LLM_MAX_TOKENS),
        messages: [
          { role: 'system', content: system },
          ...messages,
        ],
      },
      { signal: controller.signal },
    );
    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('LLM returned an empty completion');
    return text;
  } finally {
    clearTimeout(timer);
  }
}
