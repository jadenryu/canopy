"""Weave initialization — call init_weave() once at process start.

weave.init() auto-patches the OpenAI client, so every LLM call is traced
for free. Agent-native tracing: each job runs inside weave.thread(job_id)
so a job = a thread, and each bid/execution call = a turn.
"""
import os

import weave

from canopy.config import settings

_initialized = False


def init_weave() -> None:
    global _initialized
    if _initialized:
        return
    if settings.wandb_api_key:
        os.environ.setdefault("WANDB_API_KEY", settings.wandb_api_key)
    weave.init(settings.weave_project)
    _initialized = True
