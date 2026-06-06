// OpenRouter model catalog — public, no-auth GET. Used by the Arena and
// Benchmarks pages so humans can field any model in the market. Falls back
// to a curated list if the catalog is unreachable (demo must never break).

export type ORModel = {
  id: string; // e.g. "anthropic/claude-haiku-4.5"
  name: string;
  context?: number;
};

export const FALLBACK_MODELS: ORModel[] = [
  { id: "openai/gpt-5.4-nano", name: "GPT-5.4 Nano (house worker)" },
  { id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini (house premium)" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  { id: "anthropic/claude-opus-4.8", name: "Claude Opus 4.8" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick" },
  { id: "mistralai/mistral-small", name: "Mistral Small" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat" },
  { id: "qwen/qwen3-32b", name: "Qwen3 32B" },
];

let cache: { models: ORModel[]; live: boolean } | null = null;

export async function fetchModelCatalog(): Promise<{
  models: ORModel[];
  live: boolean;
}> {
  if (cache) return cache;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as {
      data: { id: string; name?: string; context_length?: number }[];
    };
    const models = body.data
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        context: m.context_length,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    cache = { models, live: true };
  } catch {
    cache = { models: FALLBACK_MODELS, live: false };
  }
  return cache;
}
