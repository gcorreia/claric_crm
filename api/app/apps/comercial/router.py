from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.apps.crm.router import (
    convert_quote_to_order_form as crm_convert_quote_to_order_form,
    create_quote_item as crm_create_quote_item,
    create_quote as crm_create_quote,
    create_order_form as crm_create_order_form,
    get_quote as crm_get_quote,
    get_order_form as crm_get_order_form,
    list_quote_items as crm_list_quote_items,
    list_quotes as crm_list_quotes,
    list_order_forms as crm_list_order_forms,
    patch_quote_item as crm_patch_quote_item,
    patch_quote as crm_patch_quote,
    patch_order_form as crm_patch_order_form,
    delete_quote_item as crm_delete_quote_item,
)
from app.apps.crm.schemas import (
    OrderFormCreate,
    OrderFormOut,
    OrderFormPatch,
    QuoteCreate,
    QuoteItemCreate,
    QuoteItemOut,
    QuoteItemPatch,
    QuoteOut,
    QuotePatch,
)
from app.auth.deps import get_current_user, require_csrf
from app.bu.deps import get_active_bu
from app.db.tenant import get_tenant_db
from app.models.business_unit import BusinessUnit
from app.models.user import User
from app.tenants.app_access import require_app_enabled

router = APIRouter(
    prefix="/comercial",
    tags=["comercial"],
    dependencies=[Depends(require_app_enabled("comercial"))],
)


@router.get("/ping")
def ping() -> dict:
    return {"app": "comercial", "status": "ok"}


@router.get("/order-forms", response_model=list[OrderFormOut])
async def list_order_forms_alias(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> list[OrderFormOut]:
    return await crm_list_order_forms(db=db, bu=bu, _=user)


@router.post(
    "/order-forms",
    response_model=OrderFormOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_order_form_alias(
    payload: OrderFormCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> OrderFormOut:
    return await crm_create_order_form(payload=payload, db=db, bu=bu, user=user)


@router.get("/order-forms/{order_form_id}", response_model=OrderFormOut)
async def get_order_form_alias(
    order_form_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> OrderFormOut:
    return await crm_get_order_form(order_form_id=order_form_id, db=db, bu=bu, _=user)


@router.patch(
    "/order-forms/{order_form_id}",
    response_model=OrderFormOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_order_form_alias(
    order_form_id: str,
    payload: OrderFormPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> OrderFormOut:
    return await crm_patch_order_form(order_form_id=order_form_id, payload=payload, db=db, bu=bu, user=user)


@router.get("/quotes", response_model=list[QuoteOut])
async def list_quotes_alias(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> list[QuoteOut]:
    return await crm_list_quotes(db=db, bu=bu, _=user)


@router.post(
    "/quotes",
    response_model=QuoteOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_quote_alias(
    payload: QuoteCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> QuoteOut:
    return await crm_create_quote(payload=payload, db=db, bu=bu, user=user)


@router.get("/quotes/{quote_id}", response_model=QuoteOut)
async def get_quote_alias(
    quote_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> QuoteOut:
    return await crm_get_quote(quote_id=quote_id, db=db, bu=bu, _=user)


@router.patch(
    "/quotes/{quote_id}",
    response_model=QuoteOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_quote_alias(
    quote_id: str,
    payload: QuotePatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> QuoteOut:
    return await crm_patch_quote(quote_id=quote_id, payload=payload, db=db, bu=bu, _=user)


@router.get("/quotes/{quote_id}/items", response_model=list[QuoteItemOut])
async def list_quote_items_alias(
    quote_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> list[QuoteItemOut]:
    return await crm_list_quote_items(quote_id=quote_id, db=db, bu=bu, _=user)


@router.post(
    "/quotes/{quote_id}/items",
    response_model=QuoteItemOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_quote_item_alias(
    quote_id: str,
    payload: QuoteItemCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> QuoteItemOut:
    return await crm_create_quote_item(quote_id=quote_id, payload=payload, db=db, bu=bu, _=user)


@router.patch(
    "/quotes/{quote_id}/items/{item_id}",
    response_model=QuoteItemOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_quote_item_alias(
    quote_id: str,
    item_id: str,
    payload: QuoteItemPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> QuoteItemOut:
    return await crm_patch_quote_item(quote_id=quote_id, item_id=item_id, payload=payload, db=db, bu=bu, _=user)


@router.delete(
    "/quotes/{quote_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_csrf)],
)
async def delete_quote_item_alias(
    quote_id: str,
    item_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> Response:
    return await crm_delete_quote_item(quote_id=quote_id, item_id=item_id, db=db, bu=bu, _=user)


@router.post(
    "/quotes/{quote_id}/convert-to-order-form",
    response_model=OrderFormOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def convert_quote_to_order_form_alias(
    quote_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> OrderFormOut:
    return await crm_convert_quote_to_order_form(quote_id=quote_id, db=db, bu=bu, user=user)
