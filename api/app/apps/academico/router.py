from fastapi import APIRouter, Depends

from app.tenants.app_access import require_app_enabled

router = APIRouter(
    prefix="/academico",
    tags=["academico"],
    dependencies=[Depends(require_app_enabled("academico"))],
)


@router.get("/ping")
def ping() -> dict:
    return {"app": "academico", "status": "ok"}