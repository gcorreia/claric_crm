from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_csrf
from app.auth.session_store import set_active_bu
from app.core.config import settings
from app.core.redis import init_redis
from app.db.session import get_db
from app.models.business_unit import BusinessUnit
from app.models.user import User
from app.bu.access import list_accessible_business_units, user_has_bu_access


class BusinessUnitOut(BaseModel):
    id: str
    name: str
    address: str


class SetBuRequest(BaseModel):
    bu_id: str = Field(..., min_length=15, max_length=18)


class BuContextResponse(BaseModel):
    business_units: list[BusinessUnitOut]
    active_bu: BusinessUnitOut


router = APIRouter(prefix="/api/context", tags=["context"])


@router.post("/bu", response_model=BuContextResponse, dependencies=[Depends(require_csrf)])
async def set_bu(
    payload: SetBuRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> BuContextResponse:
    bu = db.get(BusinessUnit, payload.bu_id)
    if not bu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BU not found")

    if not user_has_bu_access(db, _, bu.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    sid = request.cookies.get(settings.COOKIE_NAME)
    if not sid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    r = await init_redis()
    await set_active_bu(r, sid, bu.id)

    bus = list_accessible_business_units(db, _)
    return BuContextResponse(
        business_units=[BusinessUnitOut(id=b.id, name=b.name, address=b.address) for b in bus],
        active_bu=BusinessUnitOut(id=bu.id, name=bu.name, address=bu.address),
    )