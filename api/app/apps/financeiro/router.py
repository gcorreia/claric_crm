from fastapi import APIRouter, Depends

from app.tenants.app_access import require_app_enabled

router = APIRouter(
    prefix="/financeiro",
    tags=["financeiro"],
    dependencies=[Depends(require_app_enabled("financeiro"))],
)


@router.get("/ping")
def ping() -> dict:
    return {"app": "financeiro", "status": "ok"}