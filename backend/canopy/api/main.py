"""FastAPI app entrypoint. Run: uv run uvicorn canopy.api.main:app --reload"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from canopy.api.agui import router as agui_router
from canopy.api.control import router as control_router
from canopy.api.rest import router as rest_router
from canopy.redis_client import get_redis
from canopy.weave_setup import init_weave

app = FastAPI(title="Canopy — agent labor market")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agui_router)
app.include_router(rest_router)
app.include_router(control_router)


@app.on_event("startup")
async def startup():
    init_weave()


@app.get("/health")
async def health():
    r = get_redis()
    return {"status": "ok", "redis": bool(await r.ping())}
