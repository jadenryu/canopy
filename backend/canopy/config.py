"""Central config — every economic knob lives here, loaded from env.

Verified versions (Step 0, 2026-06-06):
  weave 0.52.42 | openai 2.41.0 | redis 8.0.0 | redisvl 0.3.9
  fastapi 0.136.3 | ag-ui-protocol 0.1.19
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the repo root (one level above backend/)
_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", _REPO_ROOT / "backend" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- keys / endpoints ---
    openai_api_key: str = ""
    wandb_api_key: str = ""
    weave_project: str = "canopy"
    weave_entity: str = "jadenryu_nvcc"  # W&B entity for judge-facing links
    redis_url: str = "redis://localhost:6379"

    # --- model tiers (verified current, Step 0) ---
    worker_model_cheap: str = "gpt-5.4-nano"
    worker_model_premium: str = "gpt-5.4-mini"
    scorer_model: str = "gpt-5.4-mini"
    embedding_model: str = "text-embedding-3-small"
    embedding_dims: int = 256  # Matryoshka truncation — light on Redis free tier

    # --- economy knobs ---
    score_threshold: float = 0.7
    starting_balance: float = 100.0
    bankruptcy_floor: float = 0.0
    fork_balance: float = 500.0
    max_subcontract_depth: int = 2
    rng_seed: int = 42

    # --- auction / bidding ---
    rep_weight_alpha: float = 0.5  # exponent in rep_weight = (rep/0.5)^alpha
    reputation_beta: float = 0.3  # EMA weight of the newest score
    margin_min: float = 0.10
    margin_max: float = 0.60
    reserve_price: float = 0.5  # minimum bid — prevents race-to-zero
    model_cost_cheap: float = 1.0  # nominal per-HOP cost units by model tier
    model_cost_premium: float = 3.0
    # per-model nominal cost basis (per hop) — keeps auctions honest when
    # the fleet mixes real models of different prices; fallback = tier cost
    model_costs: dict[str, float] = {
        "gpt-5.4-nano": 1.0,
        "gpt-5.4-mini": 3.0,
        "openai/gpt-4o-mini": 1.5,
        "openai/gpt-5.4-nano": 1.0,
        "anthropic/claude-haiku-4.5": 2.5,
        "google/gemini-2.5-flash": 1.5,
        "meta-llama/llama-3.1-8b-instruct": 0.8,
        "mistralai/mistral-small-3.1": 1.0,
    }
    default_bounty_cap: float = 10.0
    human_balance: float = 10_000.0  # the human client's wallet

    # --- matching / subcontracting / lifecycle (Phase 3) ---
    match_top_k: int = 4  # RedisVL shortlist size per job
    subcontract_bounty_frac: float = 0.4  # sub-job bounty cap as fraction of parent cap
    manager_hop_discount: float = 0.7  # manager's est cost = hops * cheap_cost * this
    manager_min_hops: int = 3  # managers only bid on jobs this complex
    failure_penalty: float = 10.0  # balance slash on rejection / failed settle
    collusion_min_volume: float = 3.0  # reciprocal-loop volume (each way) to flag
    saboteur_balance: float = 25.0  # demo saboteur starts poor → fast bankruptcy
    busy_surge: float = 1.6  # busy agents bid at a premium (capacity pricing)
    spike_stagger: float = 2.5  # seconds between demand-spike job posts

    # --- worker cost control ---
    worker_max_tokens: int = 600
    analyst_max_tokens: int = 2500  # the HTML/SVG market report

    # --- reward-hacking police (holdout audits) ---
    fraud_strike_threshold: int = 2
    fraud_rep_slash: float = 0.3  # reported delta target; actual via rep EMA
    holdout_paraphrase_rate: float = 0.25  # sample rate for the paraphrase check
    hacker_enabled: bool = True  # seed the criminal in scenarios

    # --- self-improvement loop (lessons from Weave feedback) ---
    lessons_enabled: bool = True
    lessons_max: int = 5
    lesson_max_tokens: int = 60

    # --- Arena: human-fielded OpenRouter agents ---
    openrouter_api_key: str = ""  # feature off when empty
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    max_custom_agents: int = 6
    custom_stake_min: float = 10.0
    custom_stake_max: float = 500.0


settings = Settings()
