"""Analyst agent — authors the open-ended gen-UI artifact.

After a scenario, the analyst writes a free-form, self-contained HTML/SVG
market report (its own deliverable, drawn its own way). The frontend
renders it verbatim inside a sandboxed iframe — the high-freedom end of
the CopilotKit gen-UI spectrum, streamed over the same AG-UI connection.
"""
import weave
from openai import AsyncOpenAI

from canopy.config import settings

_client: AsyncOpenAI | None = None


def _openai() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


MOCK_REPORT = """<!doctype html><html><body style="font-family:monospace;
background:#0a0a0a;color:#e5e5e5;padding:16px">
<h2>Market report (mock)</h2>
<svg width="320" height="80"><polyline points="0,60 80,40 160,35 240,32 320,30"
fill="none" stroke="#22c55e" stroke-width="2"/></svg>
<p>Mock run — clearing prices converging.</p></body></html>"""


@weave.op
async def generate_report(market_summary: str, mock: bool = False) -> str:
    if mock:
        return MOCK_REPORT
    resp = await _openai().chat.completions.create(
        model=settings.worker_model_premium,
        max_completion_tokens=settings.analyst_max_tokens,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are the market analyst for Canopy, an AI-agent labor "
                    "market. Produce a SELF-CONTAINED single-file HTML report "
                    "(inline CSS, inline SVG charts, no external resources, no "
                    "scripts). Dark theme (#0a0a0a background, #e5e5e5 text, "
                    "#22c55e accents), monospace font. Include: a headline, "
                    "an SVG line/bar chart of clearing prices, a top-agents "
                    "table, and 2-3 punchy observations. Output ONLY the HTML."
                ),
            },
            {"role": "user", "content": market_summary},
        ],
    )
    html = resp.choices[0].message.content or MOCK_REPORT
    # strip accidental markdown fences
    if html.startswith("```"):
        html = html.split("\n", 1)[1].rsplit("```", 1)[0]
    return html
