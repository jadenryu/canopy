"""LLM client routing — one call site, two providers.

Model ids containing "/" (e.g. anthropic/claude-haiku-4.5) are OpenRouter
catalog ids and route through the OpenRouter client (OpenAI-compatible);
bare house ids (gpt-5.4-nano) keep the stock OpenAI client. Same
@weave.op-decorated call sites either way, so tracing is unchanged.
"""
from openai import AsyncOpenAI

from canopy.config import settings

_openai: AsyncOpenAI | None = None
_openrouter: AsyncOpenAI | None = None


def client_for(model: str) -> AsyncOpenAI:
    global _openai, _openrouter
    if "/" in model:
        if _openrouter is None:
            _openrouter = AsyncOpenAI(
                base_url=settings.openrouter_base_url,
                api_key=settings.openrouter_api_key,
            )
        return _openrouter
    if _openai is None:
        _openai = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai
