# crm/api/app/main.py
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.apps.academico.router import router as academico_router
from app.apps.comercial.router import router as comercial_router
from app.apps.financeiro.router import router as financeiro_router
from app.apps.crm.router import router as crm_router
from app.apps.crm.seed import ensure_seed_crm_field_layout
from app.auth.router import router as auth_router
from app.auth.csrf_router import router as csrf_router
from app.auth.seed import ensure_seed_admin
from app.bu.router import router as context_router
from app.bu.seed import ensure_seed_business_units
from app.roles.seed import ensure_seed_profiles
from app.contracts.seed import ensure_seed_plans
from app.users.router import router as users_router
from app.roles.router import router as roles_router
from app.tenants.router import router as tenants_router, legacy_router as tenants_legacy_router
from app.tenants.apps_router import router as tenant_apps_router
from app.contracts.router import router as contracts_router
from app.limits.router import router as limits_router
from app.core.redis import close_redis, init_redis
from app.core.db_guard import enforce_safe_db_role
from app.db.session import SessionLocal, engine

app = FastAPI(title="Nimbus API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _legacy_auth_alias(request: Request, call_next):
    path = request.scope.get("path", "")
    if path == "/auth" or path.startswith("/auth/"):
        request.scope["path"] = f"/api{path}"
    return await call_next(request)


@app.on_event("startup")
async def _startup() -> None:
    await init_redis()
    enforce_safe_db_role(engine)

    db = SessionLocal()
    try:
        ensure_seed_admin(db)
        ensure_seed_business_units(db)
        ensure_seed_crm_field_layout(db)
        ensure_seed_profiles(db)
        ensure_seed_plans(db)
    finally:
        db.close()


@app.on_event("shutdown")
async def _shutdown() -> None:
    await close_redis()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# IMPORTANT: frontend calls /api/health (via Vite proxy)
@app.get("/api/health")
def api_health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(csrf_router)
app.include_router(context_router)
app.include_router(users_router)
app.include_router(roles_router)
app.include_router(tenants_router)
app.include_router(tenants_legacy_router)
app.include_router(tenant_apps_router)
app.include_router(contracts_router)
app.include_router(limits_router)

app.include_router(comercial_router, prefix="/api")
app.include_router(academico_router, prefix="/api")
app.include_router(financeiro_router, prefix="/api")
app.include_router(crm_router)
