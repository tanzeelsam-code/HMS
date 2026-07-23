import process from 'node:process';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.6-sol';
const REQUEST_TIMEOUT_MS = 20_000;

export const getAiProviderStatus = () => ({
  configured: Boolean(process.env.OPENAI_API_KEY),
  provider: process.env.OPENAI_API_KEY ? 'openai' : 'rules',
  model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
});

const extractResponseText = (response) => {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }
  for (const output of response?.output || []) {
    if (output?.type !== 'message') continue;
    for (const item of output.content || []) {
      if (item?.type === 'refusal') {
        throw Object.assign(new Error(item.refusal || 'The AI request was refused'), { code: 'AI_REFUSAL' });
      }
      if (item?.type === 'output_text' && item.text) return item.text;
    }
  }
  throw new Error('The AI provider returned no usable response');
};

export async function createStructuredAiResponse({
  schemaName,
  schema,
  instructions,
  input,
  maxOutputTokens = 1200,
}) {
  const status = getAiProviderStatus();
  if (!status.configured) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: status.model,
        store: false,
        reasoning: { effort: 'low' },
        max_output_tokens: maxOutputTokens,
        instructions,
        input,
        text: {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: schemaName,
            strict: true,
            schema,
          },
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `AI provider request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return JSON.parse(extractResponseText(payload));
  } finally {
    clearTimeout(timeout);
  }
}
