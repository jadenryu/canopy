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
    default_bounty_cap: float = 10.0
    human_balance: float = 10_000.0  # the human client's wallet

    # --- matching / subcontracting / lifecycle (Phase 3) ---
    match_top_k: int = 4  # RedisVL shortlist size per job
    subcontract_bounty_frac: float = 0.4  # sub-job bounty cap as fraction of parent cap
    manager_hop_discount: float = 0.7  # manager's est cost = hops * cheap_cost * this
    manager_min_hops: int = 3  # managers only bid on jobs this complex
    failure_penalty: float = 10.0  # balance slash on rejection / failed settle
    saboteur_balance: float = 25.0  # demo saboteur starts poor → fast bankruptcy

    # --- worker cost control ---
    worker_max_tokens: int = 600
    analyst_max_tokens: int = 2500  # the HTML/SVG market report


settings = Settings()
