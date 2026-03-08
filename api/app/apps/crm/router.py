# crm/api/app/apps/crm/router.py

from app.tenants.app_access import require_app_enabled

import datetime as dt
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response, status
from sqlalchemy import Date, case, func, or_, select, text
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_csrf
from app.bu.deps import get_active_bu
from app.core.object_id import new_id18
from app.db.tenant import get_tenant_db
from app.limits.router import evaluate_limit
from app.models.account import Account
from app.models.activity import Activity
from app.models.activity_participant import ActivityParticipant
from app.models.business_unit import BusinessUnit
from app.models.contact import Contact
from app.models.contact_role import ContactRole
from app.models.custom_field_definition import CustomFieldDefinition
from app.models.custom_field_session import CustomFieldSession
from app.models.custom_field_value import CustomFieldValue
from app.models.custom_object_definition import CustomObjectDefinition
from app.models.dashboard_definition import DashboardDefinition
from app.models.lead import Lead
from app.models.order_form import OrderForm
from app.models.order_form_template import OrderFormTemplate
from app.models.opportunity import Opportunity
from app.models.opportunity_stage import OpportunityStage
from app.models.price_list import PriceList
from app.models.price_list_item import PriceListItem
from app.models.product import Product
from app.models.product_price_list import ProductPriceList
from app.models.quote import Quote
from app.models.quote_item import QuoteItem
from app.models.report_definition import ReportDefinition
from app.models.user import User

from .schemas import (
    AccountCreate,
    AccountOut,
    AccountPatch,
    ActivityComplete,
    ActivityCreate,
    ActivityOut,
    ActivityParticipantOut,
    ActivityPatch,
    ContactCreate,
    ContactOut,
    ContactPatch,
    ContactRoleCreate,
    ContactRoleOut,
    ContactRolePatch,
    CustomFieldCreate,
    CustomFieldDefinitionOut,
    CustomFieldPatch,
    CustomFieldReorder,
    CustomFieldMove,
    CustomFieldSessionCreate,
    CustomFieldSessionOut,
    CustomFieldSessionPatch,
    CustomFieldSessionReorder,
    CustomObjectCreate,
    CustomObjectDefinitionOut,
    CustomObjectPatch,
    EntityType,
    DashboardDefinitionCreate,
    DashboardDefinitionOut,
    DashboardDefinitionPatch,
    LeadCreate,
    LeadOut,
    LeadPatch,
    OrderFormCreate,
    OrderFormOut,
    OrderFormPatch,
    OrderFormTemplateOut,
    OrderFormTemplatePatch,
    OpportunityCreate,
    OpportunityOut,
    OpportunityStageCreate,
    OpportunityStageDelete,
    OpportunityStageOut,
    OpportunityStagePatch,
    OpportunityPatch,
    PriceListCreate,
    PriceListItemOut,
    PriceListItemUpsert,
    PriceListOut,
    PriceListPatch,
    ProductCreate,
    ProductOut,
    ProductPatch,
    ProductPriceListCreate,
    ProductPriceListOut,
    ProductPriceListPatch,
    QuoteCreate,
    QuoteItemCreate,
    QuoteItemOut,
    QuoteItemPatch,
    ReportDefinitionCreate,
    ReportDefinitionOut,
    ReportDefinitionPatch,
    ReportFieldOut,
    ReportPreviewIn,
    ReportRunOut,
    ReportSortIn,
    ReportTypeOut,
    QuoteOut,
    QuotePatch,
)

router = APIRouter(prefix="/api/crm", tags=["crm"], dependencies=[Depends(require_app_enabled("crm"))])

_ENTITY_MODELS: dict[str, Any] = {
    "account": Account,
    "lead": Lead,
    "contact": Contact,
    "opportunity": Opportunity,
}


def _new_contact_external_id(db: Session, bu_id: str) -> str:
    # Keep retries bounded; collisions are extremely unlikely with new_id18.
    for _ in range(8):
        candidate = new_id18("CEX")
        exists = db.execute(
            select(Contact.id).where(Contact.business_unit_id == bu_id, Contact.external_id == candidate).limit(1)
        ).scalar_one_or_none()
        if not exists:
            return candidate
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not generate contact external_id")


def _normalize_contact_role_value(value: str | None) -> str:
    return (value or "").strip()


def _resolve_contact_role_value(
    db: Session,
    bu_id: str,
    raw_value: str | None,
    *,
    allow_existing_value: str | None = None,
) -> str:
    value = _normalize_contact_role_value(raw_value)
    if not value:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="contact_role is required")

    existing_norm = _normalize_contact_role_value(allow_existing_value)
    if existing_norm and value.lower() == existing_norm.lower():
        return existing_norm

    row = (
        db.execute(
            select(ContactRole).where(
                ContactRole.business_unit_id == bu_id,
                ContactRole.is_active.is_(True),
                func.lower(ContactRole.value) == value.lower(),
            )
        )
        .scalars()
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Contact role inválido. Cadastre o valor em Contact Roles.",
        )
    return row.value


def _normalize_opportunity_stage_value(value: str | None) -> str:
    return (value or "").strip()


_FIXED_OPPORTUNITY_STAGES: tuple[tuple[str, str, int], ...] = (
    ("inicial", "Inicial", 0),
    ("fechado", "Fechado", 9000),
    ("perdido", "Perdido", 9010),
)
_FIXED_OPPORTUNITY_STAGE_KEYS = {k for k, _, _ in _FIXED_OPPORTUNITY_STAGES}
_FIXED_OPPORTUNITY_STAGE_LABEL = {k: label for k, label, _ in _FIXED_OPPORTUNITY_STAGES}
_FIXED_OPPORTUNITY_STAGE_SORT = {k: s for k, _, s in _FIXED_OPPORTUNITY_STAGES}
_CUSTOM_OPPORTUNITY_STAGE_STEP = 10
_OPPORTUNITY_STAGE_KEY_ALIASES = {
    "closed won": "fechado",
    "won": "fechado",
    "ganho": "fechado",
    "closed lost": "perdido",
    "lost": "perdido",
}


def _opportunity_stage_key(value: str | None) -> str:
    raw = _normalize_opportunity_stage_value(value).lower()
    return _OPPORTUNITY_STAGE_KEY_ALIASES.get(raw, raw)


def _is_fixed_opportunity_stage_value(value: str | None) -> bool:
    return _opportunity_stage_key(value) in _FIXED_OPPORTUNITY_STAGE_KEYS


def _ensure_fixed_opportunity_stages(db: Session, bu_id: str) -> bool:
    existing = db.execute(
        select(OpportunityStage)
        .where(OpportunityStage.business_unit_id == bu_id)
        .order_by(OpportunityStage.created_at.asc(), OpportunityStage.id.asc())
    ).scalars().all()
    grouped: dict[str, list[OpportunityStage]] = {}
    for row in existing:
        key = _opportunity_stage_key(row.value)
        if not key:
            continue
        grouped.setdefault(key, []).append(row)

    changed = False
    for key, label, sort_order in _FIXED_OPPORTUNITY_STAGES:
        candidates = grouped.get(key, [])
        primary: OpportunityStage | None = None
        if candidates:
            # Prefer canonical label, then active, then lower sort_order.
            primary = sorted(
                candidates,
                key=lambda r: (
                    0 if _normalize_opportunity_stage_value(r.value).lower() == key else 1,
                    0 if bool(r.is_active) else 1,
                    int(r.sort_order or 0),
                    str(r.id),
                ),
            )[0]

        row = primary
        if row is None:
            db.add(
                OpportunityStage(
                    business_unit_id=bu_id,
                    value=label,
                    sort_order=sort_order,
                    is_active=True,
                )
            )
            changed = True
            continue

        if row.value != label:
            row.value = label
            changed = True
        if int(row.sort_order or 0) != sort_order:
            row.sort_order = sort_order
            changed = True
        if not row.is_active:
            row.is_active = True
            changed = True
        db.add(row)

        # Deactivate secondary aliases/duplicates for the same fixed semantic.
        for duplicate in candidates:
            if duplicate.id == row.id:
                continue
            if duplicate.is_active:
                duplicate.is_active = False
                db.add(duplicate)
                changed = True

    if changed:
        db.flush()
    return changed


def _opportunity_stage_rank_expr():
    return case(
        (func.lower(OpportunityStage.value) == "inicial", 0),
        (func.lower(OpportunityStage.value).in_(("fechado", "closed won", "won", "ganho")), 2),
        (func.lower(OpportunityStage.value).in_(("perdido", "closed lost", "lost")), 3),
        else_=1,
    )


def _list_ordered_opportunity_stages(
    db: Session,
    bu_id: str,
    *,
    include_inactive: bool,
) -> list[OpportunityStage]:
    stmt = select(OpportunityStage).where(OpportunityStage.business_unit_id == bu_id)
    if not include_inactive:
        stmt = stmt.where(OpportunityStage.is_active.is_(True))

    return (
        db.execute(
            stmt.order_by(
                _opportunity_stage_rank_expr().asc(),
                OpportunityStage.sort_order.asc(),
                OpportunityStage.value.asc(),
            )
        )
        .scalars()
        .all()
    )


def _build_opportunity_stage_probability_map(rows: list[OpportunityStage]) -> dict[str, int]:
    custom_rows = [r for r in rows if _opportunity_stage_key(r.value) not in _FIXED_OPPORTUNITY_STAGE_KEYS]
    custom_count = len(custom_rows)
    custom_positions: dict[str, int] = {r.id: i for i, r in enumerate(custom_rows, start=1)}

    out: dict[str, int] = {}
    for row in rows:
        key = _opportunity_stage_key(row.value)
        if key == "inicial":
            out[row.id] = 0
            continue
        if key == "fechado":
            out[row.id] = 100
            continue
        if key == "perdido":
            out[row.id] = 0
            continue

        if custom_count <= 0:
            out[row.id] = 0
            continue

        position = custom_positions.get(row.id, 1)
        pct = round((position * 100) / (custom_count + 1))
        out[row.id] = max(1, min(99, int(pct)))

    return out


def _dedupe_fixed_opportunity_stage_rows(rows: list[OpportunityStage]) -> list[OpportunityStage]:
    fixed_rows: dict[str, list[OpportunityStage]] = {}
    for row in rows:
        key = _opportunity_stage_key(row.value)
        if key in _FIXED_OPPORTUNITY_STAGE_KEYS:
            fixed_rows.setdefault(key, []).append(row)

    keep_fixed_ids: set[str] = set()
    for key, grouped in fixed_rows.items():
        label = _FIXED_OPPORTUNITY_STAGE_LABEL.get(key, "")
        primary = sorted(
            grouped,
            key=lambda r: (
                0 if _normalize_opportunity_stage_value(r.value).lower() == key else 1,
                0 if _normalize_opportunity_stage_value(r.value) == label else 1,
                0 if bool(r.is_active) else 1,
                int(r.sort_order or 0),
                str(r.id),
            ),
        )[0]
        keep_fixed_ids.add(primary.id)

    out: list[OpportunityStage] = []
    for row in rows:
        key = _opportunity_stage_key(row.value)
        if key in _FIXED_OPPORTUNITY_STAGE_KEYS and row.id not in keep_fixed_ids:
            continue
        out.append(row)
    return out


def _validate_custom_opportunity_stage_sort_order(sort_order: int) -> int:
    initial = _FIXED_OPPORTUNITY_STAGE_SORT["inicial"]
    closed = _FIXED_OPPORTUNITY_STAGE_SORT["fechado"]
    normalized = int(sort_order)
    if normalized <= initial or normalized >= closed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"sort_order must be between {initial + 1} and {closed - 1} for custom stages",
        )
    return normalized


def _next_custom_opportunity_stage_sort_order(db: Session, bu_id: str) -> int:
    initial = _FIXED_OPPORTUNITY_STAGE_SORT["inicial"]
    closed = _FIXED_OPPORTUNITY_STAGE_SORT["fechado"]
    current_max = (
        db.execute(
            select(func.max(OpportunityStage.sort_order)).where(
                OpportunityStage.business_unit_id == bu_id,
                func.lower(OpportunityStage.value).notin_(list(_FIXED_OPPORTUNITY_STAGE_KEYS)),
                OpportunityStage.sort_order > initial,
                OpportunityStage.sort_order < closed,
            )
        ).scalar_one_or_none()
    )
    if current_max is None:
        return initial + _CUSTOM_OPPORTUNITY_STAGE_STEP

    candidate = int(current_max) + _CUSTOM_OPPORTUNITY_STAGE_STEP
    if candidate >= closed:
        return closed - 1
    if candidate <= initial:
        return initial + 1
    return candidate


def _resolve_opportunity_stage_value(
    db: Session,
    bu_id: str,
    raw_value: str | None,
    *,
    allow_existing_value: str | None = None,
) -> str:
    value = _normalize_opportunity_stage_value(raw_value) or "Inicial"
    existing_norm = _normalize_opportunity_stage_value(allow_existing_value)
    if existing_norm and value.lower() == existing_norm.lower():
        return existing_norm

    row = (
        db.execute(
            select(OpportunityStage).where(
                OpportunityStage.business_unit_id == bu_id,
                OpportunityStage.is_active.is_(True),
                func.lower(OpportunityStage.value) == value.lower(),
            )
        )
        .scalars()
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Stage inválido. Cadastre o valor em Stages da Oportunidade.",
        )
    return row.value


def _normalize_product_name(value: str | None) -> str:
    return (value or "").strip()


def _normalize_product_code(value: str | None) -> str:
    return (value or "").strip()


def _normalize_price_list_name(value: str | None) -> str:
    return (value or "").strip()


def _normalize_currency(value: str | None) -> str:
    return ((value or "BRL").strip() or "BRL").upper()


def _normalize_order_form_status(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return "Draft"

    mapping = {
        "draft": "Draft",
        "rascunho": "Draft",
        "sent": "Sent",
        "enviado": "Sent",
        "signed": "Signed",
        "assinado": "Signed",
        "cancelled": "Cancelled",
        "canceled": "Cancelled",
        "cancelado": "Cancelled",
    }
    if raw in mapping:
        return mapping[raw]
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="status must be one of: Draft, Sent, Signed, Cancelled",
    )


def _normalize_quote_status(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return "Draft"

    mapping = {
        "draft": "Draft",
        "rascunho": "Draft",
        "in_review": "In Review",
        "in review": "In Review",
        "em revisão": "In Review",
        "em revisao": "In Review",
        "approved": "Approved",
        "aprovada": "Approved",
        "sent": "Sent",
        "enviada": "Sent",
        "accepted": "Accepted",
        "aceita": "Accepted",
        "rejected": "Rejected",
        "recusada": "Rejected",
        "expired": "Expired",
        "expirada": "Expired",
    }
    if raw in mapping:
        return mapping[raw]
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="status must be one of: Draft, In Review, Approved, Sent, Accepted, Rejected, Expired",
    )


def _normalize_activity_type(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return "task"
    mapping = {
        "task": "task",
        "tarefa": "task",
        "event": "event",
        "evento": "event",
        "call": "call",
        "ligacao": "call",
        "ligação": "call",
        "email": "email",
        "e-mail": "email",
    }
    if raw in mapping:
        return mapping[raw]
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="type must be one of: task, event, call, email",
    )


def _normalize_activity_status(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return "Open"

    mapping = {
        "open": "Open",
        "aberta": "Open",
        "aberto": "Open",
        "pendente": "Open",
        "to do": "Open",
        "todo": "Open",
        "in progress": "In Progress",
        "in_progress": "In Progress",
        "em andamento": "In Progress",
        "andamento": "In Progress",
        "completed": "Completed",
        "done": "Completed",
        "concluida": "Completed",
        "concluída": "Completed",
        "cancelled": "Cancelled",
        "canceled": "Cancelled",
        "cancelada": "Cancelled",
        "cancelado": "Cancelled",
    }
    if raw in mapping:
        return mapping[raw]
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="status must be one of: Open, In Progress, Completed, Cancelled",
    )


def _normalize_activity_priority(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return "Normal"

    mapping = {
        "low": "Low",
        "baixa": "Low",
        "normal": "Normal",
        "medium": "Normal",
        "media": "Normal",
        "média": "Normal",
        "high": "High",
        "alta": "High",
    }
    if raw in mapping:
        return mapping[raw]
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="priority must be one of: Low, Normal, High",
    )


def _normalize_primary_color(value: str | None, *, default: str = "#166534") -> str:
    color = (value or "").strip()
    if not color:
        return default
    if not color.startswith("#") or len(color) != 7:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="primary_color must be a hex color in format #RRGGBB",
        )
    allowed = "0123456789abcdefABCDEF"
    if any(ch not in allowed for ch in color[1:]):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="primary_color must be a hex color in format #RRGGBB",
        )
    return color


def _entity_count(db: Session, bu_id: str, entity_type: str) -> int:
    model = _ENTITY_MODELS.get(entity_type)
    if model is None:
        return 0
    return int(db.scalar(select(func.count()).select_from(model).where(model.business_unit_id == bu_id)) or 0)


def _entity_ids(db: Session, bu_id: str, entity_type: str) -> list[str]:
    model = _ENTITY_MODELS.get(entity_type)
    if model is None:
        return []
    return list(db.scalars(select(model.id).where(model.business_unit_id == bu_id)).all())


def _iso(dt_or_date: Any) -> str:
    if isinstance(dt_or_date, (dt.datetime, dt.date)):
        return dt_or_date.isoformat()
    return str(dt_or_date)


def _parse_date(value: Any) -> dt.date:
    if isinstance(value, dt.date) and not isinstance(value, dt.datetime):
        return value
    if isinstance(value, str):
        return dt.date.fromisoformat(value)
    raise ValueError("invalid date")


def _parse_datetime(value: Any) -> dt.datetime:
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, str):
        v = value.replace("Z", "+00:00")
        return dt.datetime.fromisoformat(v)
    raise ValueError("invalid datetime")


def _value_columns_for_type(field_type: str) -> str:
    t = field_type
    if t in {"text", "textarea", "email", "phone", "url", "single_select"}:
        return "value_text"
    if t == "number":
        return "value_number"
    if t == "boolean":
        return "value_bool"
    if t == "date":
        return "value_date"
    if t == "datetime":
        return "value_ts"
    if t == "multi_select":
        return "value_json"
    return "value_text"


def _coerce_value(field_type: str, raw: Any) -> dict[str, Any]:
    col = _value_columns_for_type(field_type)
    if raw is None:
        return {col: None}

    if col == "value_text":
        return {col: str(raw)}
    if col == "value_number":
        try:
            return {col: float(raw)}
        except Exception as e:
            raise ValueError("invalid number") from e
    if col == "value_bool":
        if isinstance(raw, bool):
            return {col: raw}
        if isinstance(raw, str) and raw.lower() in {"true", "false"}:
            return {col: raw.lower() == "true"}
        raise ValueError("invalid boolean")
    if col == "value_date":
        return {col: _parse_date(raw)}
    if col == "value_ts":
        return {col: _parse_datetime(raw)}
    if col == "value_json":
        if isinstance(raw, list):
            return {col: raw}
        raise ValueError("invalid multi_select; expected list")
    return {"value_text": str(raw)}


def _clear_all_value_columns(row: CustomFieldValue) -> None:
    row.value_text = None
    row.value_number = None
    row.value_bool = None
    row.value_date = None
    row.value_ts = None
    row.value_json = None


def _cfval_to_python(defn: CustomFieldDefinition, val: CustomFieldValue) -> Any:
    col = _value_columns_for_type(defn.type)
    if col == "value_text":
        return val.value_text
    if col == "value_number":
        return None if val.value_number is None else float(val.value_number)
    if col == "value_bool":
        return val.value_bool
    if col == "value_date":
        return None if val.value_date is None else val.value_date.isoformat()
    if col == "value_ts":
        return None if val.value_ts is None else val.value_ts.isoformat()
    if col == "value_json":
        return val.value_json
    return val.value_text


def _is_empty_required(field_type: str, value: Any) -> bool:
    if value is None:
        return True
    if field_type == "boolean":
        return False
    if field_type == "multi_select":
        return not isinstance(value, list) or len(value) == 0
    if isinstance(value, str):
        return value.strip() == ""
    return False


def _default_raw_from_definition(defn: CustomFieldDefinition) -> Any:
    dv = defn.default_value or {}
    if defn.type == "multi_select":
        if isinstance(dv.get("values"), list):
            return dv.get("values")
        if isinstance(dv.get("value"), list):
            return dv.get("value")
        return None
    if "value" in dv:
        return dv.get("value")
    return None


def _read_custom_fields(db: Session, bu_id: str, entity_type: str, entity_id: str) -> dict[str, Any]:
    defs = (
        db.execute(
            select(CustomFieldDefinition).where(
                CustomFieldDefinition.business_unit_id == bu_id,
                CustomFieldDefinition.entity_type == entity_type,
                CustomFieldDefinition.custom_object_id.is_(None),
            )
        )
        .scalars()
        .all()
    )
    defs_by_id = {d.id: d for d in defs}

    vals = (
        db.execute(
            select(CustomFieldValue).where(
                CustomFieldValue.business_unit_id == bu_id,
                CustomFieldValue.entity_type == entity_type,
                CustomFieldValue.entity_id == entity_id,
            )
        )
        .scalars()
        .all()
    )

    out: dict[str, Any] = {}
    for v in vals:
        d = defs_by_id.get(v.field_id)
        if not d:
            continue
        out[d.key] = _cfval_to_python(d, v)
    return out


def _apply_defaults_and_validate_required(
    db: Session,
    bu_id: str,
    entity_type: str,
    custom_fields: dict[str, Any] | None,
    *,
    existing_entity_id: str | None = None,
) -> dict[str, Any]:
    values: dict[str, Any] = dict(custom_fields or {})

    if existing_entity_id is not None:
        existing = _read_custom_fields(db, bu_id, entity_type, existing_entity_id)
        for k, v in existing.items():
            values.setdefault(k, v)

    defs = (
        db.execute(
            select(CustomFieldDefinition).where(
                CustomFieldDefinition.business_unit_id == bu_id,
                CustomFieldDefinition.entity_type == entity_type,
                CustomFieldDefinition.custom_object_id.is_(None),
                CustomFieldDefinition.is_active.is_(True),
            )
        )
        .scalars()
        .all()
    )

    missing: list[str] = []
    for d in defs:
        if not d.required:
            continue

        cur = values.get(d.key)
        if _is_empty_required(d.type, cur):
            default_raw = _default_raw_from_definition(d)
            if default_raw is not None:
                values[d.key] = default_raw
            else:
                missing.append(d.label)

    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Missing required custom fields", "fields": missing},
        )

    return values


def _backfill_default_for_existing_entities(
    db: Session,
    bu_id: str,
    entity_type: str,
    field_def: CustomFieldDefinition,
    default_raw: Any,
) -> None:
    entity_ids = _entity_ids(db, bu_id, entity_type)
    if not entity_ids:
        return

    existing = set(
        db.execute(
            select(CustomFieldValue.entity_id).where(
                CustomFieldValue.business_unit_id == bu_id,
                CustomFieldValue.entity_type == entity_type,
                CustomFieldValue.field_id == field_def.id,
            )
        ).scalars().all()
    )

    to_insert: list[CustomFieldValue] = []
    for eid in entity_ids:
        if eid in existing:
            continue
        try:
            coerced = _coerce_value(field_def.type, default_raw)
        except Exception:
            continue

        row = CustomFieldValue(
            business_unit_id=bu_id,
            entity_type=entity_type,
            entity_id=eid,
            field_id=field_def.id,
        )
        _clear_all_value_columns(row)
        for k, v in coerced.items():
            setattr(row, k, v)
        to_insert.append(row)

    if to_insert:
        db.add_all(to_insert)


def _load_definitions_by_key(db: Session, bu_id: str, entity_type: str) -> dict[str, CustomFieldDefinition]:
    defs = (
        db.execute(
            select(CustomFieldDefinition).where(
                CustomFieldDefinition.business_unit_id == bu_id,
                CustomFieldDefinition.entity_type == entity_type,
                CustomFieldDefinition.custom_object_id.is_(None),
                CustomFieldDefinition.is_active.is_(True),
            )
        )
        .scalars()
        .all()
    )
    return {d.key: d for d in defs}


def _upsert_custom_fields(
    db: Session,
    bu_id: str,
    entity_type: str,
    entity_id: str,
    custom_fields: dict[str, Any],
) -> None:
    defs_by_key = _load_definitions_by_key(db, bu_id, entity_type)

    for key, raw in custom_fields.items():
        defn = defs_by_key.get(key)
        if not defn:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown custom field: {key}")

        try:
            coerced = _coerce_value(defn.type, raw)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid value for '{key}' ({defn.type}): {e}",
            ) from e

        existing = db.execute(
            select(CustomFieldValue).where(
                CustomFieldValue.business_unit_id == bu_id,
                CustomFieldValue.entity_type == entity_type,
                CustomFieldValue.entity_id == entity_id,
                CustomFieldValue.field_id == defn.id,
            )
        ).scalar_one_or_none()

        if existing is None:
            row = CustomFieldValue(
                business_unit_id=bu_id,
                entity_type=entity_type,
                entity_id=entity_id,
                field_id=defn.id,
            )
            _clear_all_value_columns(row)
            for k, v in coerced.items():
                setattr(row, k, v)
            db.add(row)
        else:
            _clear_all_value_columns(existing)
            for k, v in coerced.items():
                setattr(existing, k, v)


# -----------------------------
# Provisionamento: sessões de campos (Core + Custom Objects)
# -----------------------------


def _ordered_field_ids_in_session(db: Session, bu_id: str, session_id: str) -> list[str]:
    return (
        db.execute(
            select(CustomFieldDefinition.id).where(
                CustomFieldDefinition.business_unit_id == bu_id,
                CustomFieldDefinition.session_id == session_id,
            ).order_by(
                CustomFieldDefinition.sort_order.asc(),
                CustomFieldDefinition.created_at.asc(),
            )
        )
        .scalars()
        .all()
    )


def _renumber_fields_in_session(db: Session, bu_id: str, session_id: str, field_ids_in_order: list[str] | None = None) -> None:
    ids = field_ids_in_order if field_ids_in_order is not None else _ordered_field_ids_in_session(db, bu_id, session_id)
    for order, fid in enumerate(ids):
        db.execute(
            CustomFieldDefinition.__table__.update()
            .where(CustomFieldDefinition.id == fid, CustomFieldDefinition.business_unit_id == bu_id)
            .values(sort_order=order, version=CustomFieldDefinition.version + 1)
        )
    db.execute(
        CustomFieldSession.__table__.update()
        .where(CustomFieldSession.id == session_id, CustomFieldSession.business_unit_id == bu_id)
        .values(version=CustomFieldSession.version + 1)
    )


def _move_field_between_sessions(
    db: Session,
    bu_id: str,
    field_row: CustomFieldDefinition,
    target_session_id: str,
    target_index: int | None,
) -> None:
    source_session_id = field_row.session_id
    field_id = field_row.id

    if source_session_id == target_session_id:
        ids = _ordered_field_ids_in_session(db, bu_id, source_session_id)
        if field_id not in ids:
            ids.append(field_id)
        ids = [x for x in ids if x != field_id]
        if target_index is None or target_index >= len(ids):
            ids.append(field_id)
        else:
            ids.insert(target_index, field_id)
        _renumber_fields_in_session(db, bu_id, source_session_id, ids)
        return

    # source renumber (remove field)
    source_ids = [x for x in _ordered_field_ids_in_session(db, bu_id, source_session_id) if x != field_id]
    _renumber_fields_in_session(db, bu_id, source_session_id, source_ids)

    # target insert
    target_ids = _ordered_field_ids_in_session(db, bu_id, target_session_id)
    if target_index is None or target_index >= len(target_ids):
        target_ids.append(field_id)
    else:
        target_ids.insert(target_index, field_id)

    field_row.session_id = target_session_id
    db.flush()

    _renumber_fields_in_session(db, bu_id, target_session_id, target_ids)

@router.get("/provisioning/field-sessions", response_model=list[CustomFieldSessionOut])
@router.get("/provisioning/field-sessions", response_model=list[CustomFieldSessionOut])
async def list_field_sessions(
    entity_type: EntityType | None = Query(default=None),
    custom_object_id: str | None = Query(default=None),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[CustomFieldSessionOut]:
    if (entity_type is None and custom_object_id is None) or (entity_type is not None and custom_object_id is not None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Provide exactly one of: entity_type OR custom_object_id"},
        )

    q = select(CustomFieldSession).where(CustomFieldSession.business_unit_id == bu.id)
    if entity_type is not None:
        q = q.where(CustomFieldSession.entity_type == entity_type, CustomFieldSession.custom_object_id.is_(None))
    else:
        q = q.where(CustomFieldSession.custom_object_id == custom_object_id)

    session_rows = (
        db.execute(q.order_by(CustomFieldSession.sort_order.asc(), CustomFieldSession.created_at.asc()))
        .scalars()
        .all()
    )

    session_ids = [s.id for s in session_rows]
    counts: dict[str, int] = {}
    if session_ids:
        counts_rows = db.execute(
            select(CustomFieldDefinition.session_id, func.count(CustomFieldDefinition.id))
            .where(
                CustomFieldDefinition.business_unit_id == bu.id,
                CustomFieldDefinition.session_id.in_(session_ids),
            )
            .group_by(CustomFieldDefinition.session_id)
        ).all()
        counts = {sid: int(c) for sid, c in counts_rows}

    return [
        CustomFieldSessionOut(
            id=r.id,
            entity_type=r.entity_type,
            custom_object_id=r.custom_object_id,
            key=r.key,
            label=r.label,
            sort_order=r.sort_order,
            layout_columns=getattr(r, "layout_columns", 2),
            version=getattr(r, "version", 1),
            fields_count=counts.get(r.id, 0),
        )
        for r in session_rows
    ]
@router.post(
    "/provisioning/field-sessions",
    response_model=CustomFieldSessionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_field_session(
    payload: CustomFieldSessionCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> CustomFieldSessionOut:
    row = CustomFieldSession(
        business_unit_id=bu.id,
        entity_type=payload.entity_type,
        custom_object_id=payload.custom_object_id,
        key=payload.key,
        label=payload.label,
        sort_order=payload.sort_order,
        layout_columns=payload.layout_columns,
    )
    db.add(row)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session already exists") from e

    return CustomFieldSessionOut(
        id=row.id,
        entity_type=row.entity_type,
        custom_object_id=row.custom_object_id,
        key=row.key,
        label=row.label,
        sort_order=row.sort_order,
        layout_columns=getattr(row, "layout_columns", 2),
        version=getattr(row, "version", 1),
        fields_count=0,
    )
@router.patch(
    "/provisioning/field-sessions/{session_id}",
    response_model=CustomFieldSessionOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_field_session(
    session_id: str,
    payload: CustomFieldSessionPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> CustomFieldSessionOut:
    row = db.get(CustomFieldSession, session_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if payload.expected_version is not None and getattr(row, "version", 1) != payload.expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Session was modified by another user. Refresh and try again."},
        )

    if payload.label is not None:
        row.label = payload.label
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    if payload.layout_columns is not None:
        row.layout_columns = payload.layout_columns

    row.version = int(getattr(row, "version", 1)) + 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conflict updating session") from e

    fields_count = int(
        db.execute(
            select(func.count(CustomFieldDefinition.id)).where(
                CustomFieldDefinition.business_unit_id == bu.id,
                CustomFieldDefinition.session_id == row.id,
            )
        ).scalar_one()
    )

    return CustomFieldSessionOut(
        id=row.id,
        entity_type=row.entity_type,
        custom_object_id=row.custom_object_id,
        key=row.key,
        label=row.label,
        sort_order=row.sort_order,
        layout_columns=getattr(row, "layout_columns", 2),
        version=getattr(row, "version", 1),
        fields_count=fields_count,
    )
@router.patch(
    "/provisioning/field-sessions/order",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def reorder_field_sessions(
    payload: CustomFieldSessionReorder,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> None:
    session_ids = [sid.strip() for sid in payload.session_ids if sid and sid.strip()]
    if not session_ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "session_ids is required"})
    if len(session_ids) != len(set(session_ids)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "session_ids must be unique"})

    if not payload.expected_versions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "expected_versions is required for optimistic locking"},
        )
    missing_versions = [sid for sid in session_ids if str(sid) not in payload.expected_versions]
    if missing_versions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "expected_versions missing for some session_ids", "session_ids": missing_versions},
        )

    rows = (
        db.execute(
            select(CustomFieldSession).where(
                CustomFieldSession.business_unit_id == bu.id,
                CustomFieldSession.id.in_(session_ids),
            )
        )
        .scalars()
        .all()
    )
    by_id = {r.id: r for r in rows}
    missing = [sid for sid in session_ids if sid not in by_id]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Some sessions not found", "session_ids": missing},
        )

    first = by_id[session_ids[0]]
    scope_entity = first.entity_type
    scope_custom = first.custom_object_id
    for sid in session_ids[1:]:
        r = by_id[sid]
        if r.entity_type != scope_entity or r.custom_object_id != scope_custom:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "All sessions must belong to the same target (entity_type/custom_object_id)"},
            )

    for sid in session_ids:
        expected = int(payload.expected_versions[str(sid)])
        if int(getattr(by_id[sid], "version", 1)) != expected:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "Sessions were modified by another user. Refresh and try again."},
            )

    for order, sid in enumerate(session_ids):
        db.execute(
            CustomFieldSession.__table__.update()
            .where(CustomFieldSession.id == sid, CustomFieldSession.business_unit_id == bu.id)
            .values(sort_order=order, version=CustomFieldSession.version + 1)
        )

    db.commit()
    return None
# -----------------------------
# Provisionamento: campos (Core + Custom Objects)
# -----------------------------
@router.get("/provisioning/fields", response_model=list[CustomFieldDefinitionOut])
async def list_fields(
    entity_type: EntityType | None = Query(default=None),
    custom_object_id: str | None = Query(default=None),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[CustomFieldDefinitionOut]:
    if (entity_type is None and custom_object_id is None) or (entity_type is not None and custom_object_id is not None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Provide exactly one of: entity_type OR custom_object_id"},
        )

    q = select(CustomFieldDefinition).where(CustomFieldDefinition.business_unit_id == bu.id)

    if entity_type is not None:
        q = q.where(
            CustomFieldDefinition.entity_type == entity_type,
            CustomFieldDefinition.custom_object_id.is_(None),
        )
    else:
        q = q.where(CustomFieldDefinition.custom_object_id == custom_object_id)

    q = q.join(CustomFieldSession, CustomFieldSession.id == CustomFieldDefinition.session_id)

    rows = db.execute(
        q.order_by(
            CustomFieldSession.sort_order.asc(),
            CustomFieldDefinition.sort_order.asc(),
            CustomFieldDefinition.created_at.asc(),
        )
    ).scalars().all()

    return [
        CustomFieldDefinitionOut(
            id=r.id,
            session_id=r.session_id,
            sort_order=getattr(r, 'sort_order', 0),
            version=getattr(r, 'version', 1),
            entity_type=r.entity_type,
            custom_object_id=r.custom_object_id,
            key=r.key,
            label=r.label,
            type=r.type,
            required=r.required,
            is_active=r.is_active,
            options=r.options or {},
            validations=r.validations or {},
            default_value=r.default_value or {},
        )
        for r in rows
    ]


@router.post(
    "/provisioning/fields",
    response_model=CustomFieldDefinitionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_field(
    payload: CustomFieldCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> CustomFieldDefinitionOut:
    target_entity_type = payload.entity_type
    target_custom_object_id = payload.custom_object_id

    session_row = db.get(CustomFieldSession, payload.session_id)
    if not session_row or session_row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # session target must match field target
    if session_row.entity_type is not None:
        if target_entity_type is None or session_row.entity_type != target_entity_type or session_row.custom_object_id is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "Session target does not match field target"},
            )
    else:
        if target_custom_object_id is None or session_row.custom_object_id != target_custom_object_id or session_row.entity_type is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "Session target does not match field target"},
            )


    if payload.required and target_entity_type is not None:
        existing_cnt = _entity_count(db, bu.id, target_entity_type)
        if existing_cnt > 0 and not payload.default_value:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "default_value is required when creating a required field with existing records"},
            )

    row = CustomFieldDefinition(
        business_unit_id=bu.id,
        session_id=payload.session_id,
        entity_type=target_entity_type,
        custom_object_id=target_custom_object_id,
        key=payload.key,
        label=payload.label,
        type=payload.type,
        required=payload.required,
        is_active=True,
        options=payload.options,
        validations=payload.validations,
        default_value=payload.default_value,
    )
    db.add(row)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Field already exists") from e

    if row.required and (row.default_value or {}) and row.entity_type is not None:
        dv = row.default_value or {}
        default_raw = dv.get("value", None)
        if row.type == "multi_select":
            default_raw = dv.get("values", dv.get("value", None))

        if default_raw is not None:
            _backfill_default_for_existing_entities(db, bu.id, row.entity_type, row, default_raw)
            db.commit()

    return CustomFieldDefinitionOut(
        id=row.id,
        session_id=row.session_id,
        sort_order=getattr(row, 'sort_order', 0),
        version=getattr(row, "version", 1),
        entity_type=row.entity_type,
        custom_object_id=row.custom_object_id,
        key=row.key,
        label=row.label,
        type=row.type,
        required=row.required,
        is_active=row.is_active,
        options=row.options or {},
        validations=row.validations or {},
        default_value=row.default_value or {},
    )


@router.patch(
    "/provisioning/fields/{field_id}",
    response_model=CustomFieldDefinitionOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_field(
    field_id: str,
    payload: CustomFieldPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> CustomFieldDefinitionOut:
    row = db.get(CustomFieldDefinition, field_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    if payload.expected_version is not None and getattr(row, "version", 1) != payload.expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Field was modified by another user. Refresh and try again."},
        )

    becoming_required = (payload.required is True) and (row.required is False)

    if becoming_required and row.entity_type is not None:
        existing_cnt = _entity_count(db, bu.id, row.entity_type)
        default_candidate = payload.default_value if payload.default_value is not None else (row.default_value or {})
        if existing_cnt > 0 and not default_candidate:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "default_value is required when making a field required with existing records"},
            )

    if payload.label is not None:
        row.label = payload.label
    if payload.required is not None:
        row.required = payload.required
    if payload.is_active is not None:
        row.is_active = payload.is_active
    if payload.options is not None:
        row.options = payload.options
    if payload.validations is not None:
        row.validations = payload.validations
    if payload.default_value is not None:
        row.default_value = payload.default_value

    if payload.sort_order is not None and payload.session_id is None:
        # Treat sort_order as a drag-drop index within the current session
        _move_field_between_sessions(db, bu.id, row, row.session_id, payload.sort_order)

    if payload.session_id is not None and payload.session_id != row.session_id:
        session = db.get(CustomFieldSession, payload.session_id)
        if not session or session.business_unit_id != bu.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        # Enforce same target (core vs custom object)
        if row.entity_type is not None:
            if session.entity_type != row.entity_type or session.custom_object_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={"message": "session_id target mismatch for entity_type field"},
                )
        else:
            if session.custom_object_id != row.custom_object_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={"message": "session_id target mismatch for custom_object field"},
                )

        _move_field_between_sessions(db, bu.id, row, payload.session_id, None)

    row.version = int(getattr(row, "version", 1)) + 1
    db.add(row)
    db.commit()

    if becoming_required and row.entity_type is not None:
        dv = payload.default_value if payload.default_value is not None else (row.default_value or {})
        default_raw = dv.get("value", None)
        if row.type == "multi_select":
            default_raw = dv.get("values", dv.get("value", None))

        if default_raw is not None:
            _backfill_default_for_existing_entities(db, bu.id, row.entity_type, row, default_raw)
            db.commit()

    return CustomFieldDefinitionOut(
        id=row.id,
        session_id=row.session_id,
        sort_order=getattr(row, 'sort_order', 0),
        version=getattr(row, "version", 1),
        entity_type=row.entity_type,
        custom_object_id=row.custom_object_id,
        key=row.key,
        label=row.label,
        type=row.type,
        required=row.required,
        is_active=row.is_active,
        options=row.options or {},
        validations=row.validations or {},
        default_value=row.default_value or {},
    )





@router.patch(
    "/provisioning/fields/{field_id}/move",
    response_model=CustomFieldDefinitionOut,
    dependencies=[Depends(require_csrf)],
)
async def move_field(
    field_id: str,
    payload: CustomFieldMove,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> CustomFieldDefinitionOut:
    row = db.get(CustomFieldDefinition, field_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    source_session = db.get(CustomFieldSession, row.session_id)
    if not source_session or source_session.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    target_session = db.get(CustomFieldSession, payload.target_session_id)
    if not target_session or target_session.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if int(getattr(row, "version", 1)) != int(payload.expected_field_version):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Field was modified by another user. Refresh and try again."},
        )
    if int(getattr(source_session, "version", 1)) != int(payload.expected_source_session_version):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Source session was modified by another user. Refresh and try again."},
        )
    if int(getattr(target_session, "version", 1)) != int(payload.expected_target_session_version):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Target session was modified by another user. Refresh and try again."},
        )

    # Enforce same target (core vs custom object)
    if row.entity_type is not None:
        if target_session.entity_type != row.entity_type or target_session.custom_object_id is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "target_session_id mismatch for entity_type field"},
            )
    else:
        if target_session.custom_object_id != row.custom_object_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "target_session_id mismatch for custom_object field"},
            )

    _move_field_between_sessions(db, bu.id, row, payload.target_session_id, payload.target_index)
    db.add(row)
    db.commit()
    db.refresh(row)

    return CustomFieldDefinitionOut(
        id=row.id,
        session_id=row.session_id,
        sort_order=getattr(row, "sort_order", 0),
        version=getattr(row, "version", 1),
        entity_type=row.entity_type,
        custom_object_id=row.custom_object_id,
        key=row.key,
        label=row.label,
        type=row.type,
        required=row.required,
        is_active=row.is_active,
        options=row.options or {},
        validations=row.validations or {},
        default_value=row.default_value or {},
    )
@router.patch(
    "/provisioning/field-sessions/{session_id}/fields/order",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def reorder_fields_in_session(
    session_id: str,
    payload: CustomFieldReorder,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> None:
    session_row = db.get(CustomFieldSession, session_id)
    if not session_row or session_row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    field_ids = [fid.strip() for fid in payload.field_ids if fid and fid.strip()]
    if not field_ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "field_ids is required"})
    if len(field_ids) != len(set(field_ids)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "field_ids must be unique"})

    if not payload.expected_versions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "expected_versions is required for optimistic locking"},
        )
    missing_versions = [fid for fid in field_ids if str(fid) not in payload.expected_versions]
    if missing_versions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "expected_versions missing for some field_ids", "field_ids": missing_versions},
        )

    existing_ids = _ordered_field_ids_in_session(db, bu.id, session_id)
    if set(existing_ids) != set(field_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "field_ids must contain all fields in this session"},
        )

    rows = (
        db.execute(
            select(CustomFieldDefinition).where(
                CustomFieldDefinition.business_unit_id == bu.id,
                CustomFieldDefinition.session_id == session_id,
                CustomFieldDefinition.id.in_(field_ids),
            )
        )
        .scalars()
        .all()
    )
    by_id = {r.id: r for r in rows}
    for fid in field_ids:
        expected = int(payload.expected_versions[str(fid)])
        if int(getattr(by_id[fid], "version", 1)) != expected:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "Fields were modified by another user. Refresh and try again."},
            )

    _renumber_fields_in_session(db, bu.id, session_id, field_ids)
    db.commit()
    return None
@router.get("/provisioning/custom-objects", response_model=list[CustomObjectDefinitionOut])
async def list_custom_objects(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[CustomObjectDefinitionOut]:
    rows = (
        db.execute(
            select(CustomObjectDefinition)
            .where(CustomObjectDefinition.business_unit_id == bu.id)
            .order_by(CustomObjectDefinition.created_at.asc())
        )
        .scalars()
        .all()
    )

    return [
        CustomObjectDefinitionOut(
            id=r.id,
            key=r.key,
            label=r.label,
            plural_label=r.plural_label or "",
            parent_entity_type=r.parent_entity_type,
            is_active=r.is_active,
            created_at=_iso(r.created_at),
            updated_at=_iso(r.updated_at),
        )
        for r in rows
    ]


@router.post(
    "/provisioning/custom-objects",
    response_model=CustomObjectDefinitionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_custom_object(
    payload: CustomObjectCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> CustomObjectDefinitionOut:
    row = CustomObjectDefinition(
        business_unit_id=bu.id,
        key=payload.key,
        label=payload.label,
        plural_label=payload.plural_label or "",
        parent_entity_type=payload.parent_entity_type,
        is_active=True,
    )
    db.add(row)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Custom object already exists") from e

    return CustomObjectDefinitionOut(
        id=row.id,
        key=row.key,
        label=row.label,
        plural_label=row.plural_label or "",
        parent_entity_type=row.parent_entity_type,
        is_active=row.is_active,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


@router.patch(
    "/provisioning/custom-objects/{object_id}",
    response_model=CustomObjectDefinitionOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_custom_object(
    object_id: str,
    payload: CustomObjectPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> CustomObjectDefinitionOut:
    row = db.get(CustomObjectDefinition, object_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom object not found")

    if payload.label is not None:
        row.label = payload.label
    if payload.plural_label is not None:
        row.plural_label = payload.plural_label
    if payload.is_active is not None:
        row.is_active = payload.is_active

    db.add(row)
    db.commit()

    return CustomObjectDefinitionOut(
        id=row.id,
        key=row.key,
        label=row.label,
        plural_label=row.plural_label or "",
        parent_entity_type=row.parent_entity_type,
        is_active=row.is_active,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


# -----------------------------
# CRM: Conta
# -----------------------------
@router.get("/accounts", response_model=list[AccountOut])
async def list_accounts(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[AccountOut]:
    rows = (
        db.execute(select(Account).where(Account.business_unit_id == bu.id).order_by(Account.created_at.desc()))
        .scalars()
        .all()
    )

    out: list[AccountOut] = []
    for r in rows:
        out.append(
            AccountOut(
                id=r.id,
                name=r.name,
                owner_id=r.owner_id,
                owner_name=r.owner_name,
                created_at=_iso(r.created_at),
                updated_at=_iso(r.updated_at),
                custom_fields=_read_custom_fields(db, bu.id, "account", r.id),
            )
        )
    return out


@router.post(
    "/accounts",
    response_model=AccountOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_account(
    payload: AccountCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> AccountOut:
    custom = _apply_defaults_and_validate_required(db, bu.id, "account", payload.custom_fields)

    row = Account(
        business_unit_id=bu.id,
        name=payload.name,
        owner_id=user.id,
        owner_name=(user.name or user.email or "").strip(),
    )
    db.add(row)
    db.flush()

    if custom:
        _upsert_custom_fields(db, bu.id, "account", row.id, custom)

    db.commit()
    return AccountOut(
        id=row.id,
        name=row.name,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "account", row.id),
    )


@router.get("/accounts/{account_id}", response_model=AccountOut)
async def get_account(
    account_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> AccountOut:
    row = db.get(Account, account_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    return AccountOut(
        id=row.id,
        name=row.name,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "account", row.id),
    )


@router.patch(
    "/accounts/{account_id}",
    response_model=AccountOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_account(
    account_id: str,
    payload: AccountPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> AccountOut:
    row = db.get(Account, account_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    if payload.name is not None:
        row.name = payload.name

    data = payload.model_dump(exclude_unset=True)

    if "owner_id" in data:
        next_owner_id = data["owner_id"]
        if next_owner_id:
            u = db.get(User, next_owner_id)
            if not u:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid owner_id")
            row.owner_id = u.id
            row.owner_name = ((u.name or u.email or "").strip()) if u else ""
        else:
            row.owner_id = None
            row.owner_name = ""

    if payload.custom_fields is not None:
        merged = _apply_defaults_and_validate_required(
            db,
            bu.id,
            "account",
            payload.custom_fields,
            existing_entity_id=row.id,
        )
        _upsert_custom_fields(db, bu.id, "account", row.id, merged)

    db.add(row)
    db.commit()

    return AccountOut(
        id=row.id,
        name=row.name,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "account", row.id),
    )


# -----------------------------
# CRM: Lead
# -----------------------------
@router.get("/leads", response_model=list[LeadOut])
async def list_leads(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[LeadOut]:
    rows = db.execute(select(Lead).where(Lead.business_unit_id == bu.id).order_by(Lead.created_at.desc())).scalars().all()

    out: list[LeadOut] = []
    for r in rows:
        out.append(
            LeadOut(
                id=r.id,
                account_id=r.account_id,
                name=r.name,
                email=r.email,
                phone=r.phone,
                status=r.status,
                source=r.source,
                score=r.score,
                owner_id=r.owner_id,
                owner_name=r.owner_name,
                created_at=_iso(r.created_at),
                updated_at=_iso(r.updated_at),
                custom_fields=_read_custom_fields(db, bu.id, "lead", r.id),
            )
        )
    return out


@router.post(
    "/leads",
    response_model=LeadOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_lead(
    payload: LeadCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> LeadOut:
    custom = _apply_defaults_and_validate_required(db, bu.id, "lead", payload.custom_fields)

    account = db.get(Account, payload.account_id)
    if not account or account.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Account not found")

    owner_id = (payload.owner_id or user.id).strip() if (payload.owner_id or user.id) else user.id
    owner_name = (user.name or user.email or "").strip() if owner_id == user.id else ""
    if owner_id != user.id:
        ou = db.execute(select(User).where(User.id == owner_id)).scalar_one_or_none()
        if not ou:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Owner not found")
        owner_name = (ou.name or ou.email or "").strip()

    row = Lead(
        business_unit_id=bu.id,
        account_id=payload.account_id,
        name=payload.name,
        email=(payload.email or "").strip(),
        phone=(payload.phone or "").strip(),
        status=((payload.status or "Novo").strip() or "Novo"),
        source=(payload.source or "").strip(),
        score=int(payload.score or 0),
        owner_id=owner_id,
        owner_name=owner_name,
    )
    db.add(row)
    db.flush()

    if custom:
        _upsert_custom_fields(db, bu.id, "lead", row.id, custom)

    db.commit()
    return LeadOut(
        id=row.id,
        account_id=row.account_id,
        name=row.name,
        email=row.email,
        phone=row.phone,
        status=row.status,
        source=row.source,
        score=row.score,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "lead", row.id),
    )


@router.get("/leads/{lead_id}", response_model=LeadOut)
async def get_lead(
    lead_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> LeadOut:
    row = db.get(Lead, lead_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    return LeadOut(
        id=row.id,
        account_id=row.account_id,
        name=row.name,
        email=row.email,
        phone=row.phone,
        status=row.status,
        source=row.source,
        score=row.score,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "lead", row.id),
    )


@router.patch(
    "/leads/{lead_id}",
    response_model=LeadOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_lead(
    lead_id: str,
    payload: LeadPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> LeadOut:
    row = db.get(Lead, lead_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    if payload.account_id is not None:
        account = db.get(Account, payload.account_id)
        if not account or account.business_unit_id != bu.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Account not found")
        row.account_id = payload.account_id
    if payload.name is not None:
        row.name = payload.name
    if payload.email is not None:
        row.email = (payload.email or "").strip()
    if payload.phone is not None:
        row.phone = (payload.phone or "").strip()
    if payload.status is not None:
        row.status = ((payload.status or "Novo").strip() or "Novo")
    if payload.source is not None:
        row.source = (payload.source or "").strip()
    if payload.score is not None:
        row.score = int(payload.score)

    data = payload.model_dump(exclude_unset=True)
    if "owner_id" in data:
        next_owner_id = data["owner_id"]
        if not next_owner_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="owner_id is required")
        u = db.get(User, next_owner_id)
        if not u:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid owner_id")
        row.owner_id = u.id
        row.owner_name = ((u.name or u.email or "").strip())

    if payload.custom_fields is not None:
        merged = _apply_defaults_and_validate_required(db, bu.id, "lead", payload.custom_fields, existing_entity_id=row.id)
        _upsert_custom_fields(db, bu.id, "lead", row.id, merged)

    db.add(row)
    db.commit()

    return LeadOut(
        id=row.id,
        account_id=row.account_id,
        name=row.name,
        email=row.email,
        phone=row.phone,
        status=row.status,
        source=row.source,
        score=row.score,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "lead", row.id),
    )


def _contact_role_out(row: ContactRole) -> ContactRoleOut:
    return ContactRoleOut(
        id=row.id,
        value=row.value,
        sort_order=int(row.sort_order or 0),
        is_active=bool(row.is_active),
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


# -----------------------------
# CRM: Contact Roles
# -----------------------------
@router.get("/contact-roles", response_model=list[ContactRoleOut])
async def list_contact_roles(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[ContactRoleOut]:
    stmt = select(ContactRole).where(ContactRole.business_unit_id == bu.id)
    if not include_inactive:
        stmt = stmt.where(ContactRole.is_active.is_(True))

    rows = db.execute(stmt.order_by(ContactRole.sort_order.asc(), ContactRole.value.asc())).scalars().all()
    return [_contact_role_out(r) for r in rows]


@router.post(
    "/contact-roles",
    response_model=ContactRoleOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_contact_role(
    payload: ContactRoleCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> ContactRoleOut:
    value = _normalize_contact_role_value(payload.value)
    if not value:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="value is required")

    existing = (
        db.execute(
            select(ContactRole).where(
                ContactRole.business_unit_id == bu.id,
                func.lower(ContactRole.value) == value.lower(),
            )
        )
        .scalars()
        .first()
    )
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Contact role already exists")
        existing.is_active = True
        existing.value = value
        if payload.sort_order is not None:
            existing.sort_order = payload.sort_order
        db.add(existing)
        db.commit()
        return _contact_role_out(existing)

    if payload.sort_order is None:
        current_max = db.execute(
            select(func.max(ContactRole.sort_order)).where(ContactRole.business_unit_id == bu.id)
        ).scalar_one_or_none()
        sort_order = int(current_max if current_max is not None else -1) + 1
    else:
        sort_order = int(payload.sort_order)

    row = ContactRole(
        business_unit_id=bu.id,
        value=value,
        sort_order=sort_order,
        is_active=True,
    )
    db.add(row)
    db.commit()
    return _contact_role_out(row)


@router.patch(
    "/contact-roles/{role_id}",
    response_model=ContactRoleOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_contact_role(
    role_id: str,
    payload: ContactRolePatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> ContactRoleOut:
    row = db.get(ContactRole, role_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact role not found")

    if payload.value is not None:
        next_value = _normalize_contact_role_value(payload.value)
        if not next_value:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="value is required")

        conflict = (
            db.execute(
                select(ContactRole).where(
                    ContactRole.business_unit_id == bu.id,
                    ContactRole.id != row.id,
                    func.lower(ContactRole.value) == next_value.lower(),
                )
            )
            .scalars()
            .first()
        )
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Contact role already exists")
        row.value = next_value

    if payload.sort_order is not None:
        row.sort_order = int(payload.sort_order)
    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)

    db.add(row)
    db.commit()
    return _contact_role_out(row)


# -----------------------------
# CRM: Contato
# -----------------------------
@router.get("/contacts", response_model=list[ContactOut])
async def list_contacts(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[ContactOut]:
    rows = (
        db.execute(select(Contact).where(Contact.business_unit_id == bu.id).order_by(Contact.created_at.desc()))
        .scalars()
        .all()
    )

    out: list[ContactOut] = []
    for r in rows:
        out.append(
            ContactOut(
                id=r.id,
                account_id=r.account_id,
                name=r.name,
                external_id=r.external_id,
                contact_role=r.contact_role,
                owner_id=r.owner_id,
                owner_name=r.owner_name,
                created_at=_iso(r.created_at),
                updated_at=_iso(r.updated_at),
                custom_fields=_read_custom_fields(db, bu.id, "contact", r.id),
            )
        )
    return out


@router.post(
    "/contacts",
    response_model=ContactOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_contact(
    payload: ContactCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> ContactOut:
    custom = _apply_defaults_and_validate_required(db, bu.id, "contact", payload.custom_fields)
    resolved_contact_role = _resolve_contact_role_value(db, bu.id, payload.contact_role)

    owner_id = (payload.owner_id or user.id).strip() if (payload.owner_id or user.id) else user.id
    owner_name = (user.name or user.email or "").strip() if owner_id == user.id else ""
    if owner_id != user.id:
        ou = db.execute(select(User).where(User.id == owner_id)).scalar_one_or_none()
        if not ou:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Owner not found")
        owner_name = (ou.name or ou.email or "").strip()

    row = Contact(
        business_unit_id=bu.id,
        account_id=payload.account_id,
        name=payload.name,
        external_id=_new_contact_external_id(db, bu.id),
        contact_role=resolved_contact_role,
        owner_id=owner_id,
        owner_name=owner_name,
    )
    db.add(row)
    db.flush()

    if custom:
        _upsert_custom_fields(db, bu.id, "contact", row.id, custom)

    db.commit()
    return ContactOut(
        id=row.id,
        account_id=row.account_id,
        name=row.name,
        external_id=row.external_id,
        contact_role=row.contact_role,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "contact", row.id),
    )


@router.get("/contacts/{contact_id}", response_model=ContactOut)
async def get_contact(
    contact_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> ContactOut:
    row = db.get(Contact, contact_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    return ContactOut(
        id=row.id,
        account_id=row.account_id,
        name=row.name,
        external_id=row.external_id,
        contact_role=row.contact_role,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "contact", row.id),
    )


@router.patch(
    "/contacts/{contact_id}",
    response_model=ContactOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_contact(
    contact_id: str,
    payload: ContactPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> ContactOut:
    row = db.get(Contact, contact_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    if payload.account_id is not None:
        row.account_id = payload.account_id
    if payload.name is not None:
        row.name = payload.name
    if payload.external_id is not None:
        row.external_id = payload.external_id
    if payload.contact_role is not None:
        row.contact_role = _resolve_contact_role_value(
            db,
            bu.id,
            payload.contact_role,
            allow_existing_value=row.contact_role,
        )

    data = payload.model_dump(exclude_unset=True)
    if "owner_id" in data:
        next_owner_id = data["owner_id"]
        if not next_owner_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="owner_id is required")
        u = db.get(User, next_owner_id)
        if not u:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid owner_id")
        row.owner_id = u.id
        row.owner_name = ((u.name or u.email or "").strip())

    if payload.custom_fields is not None:
        merged = _apply_defaults_and_validate_required(db, bu.id, "contact", payload.custom_fields, existing_entity_id=row.id)
        _upsert_custom_fields(db, bu.id, "contact", row.id, merged)

    db.add(row)
    db.commit()

    return ContactOut(
        id=row.id,
        account_id=row.account_id,
        name=row.name,
        external_id=row.external_id,
        contact_role=row.contact_role,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "contact", row.id),
    )


def _opportunity_stage_out(row: OpportunityStage, *, probability_percent: int | None = None) -> OpportunityStageOut:
    return OpportunityStageOut(
        id=row.id,
        value=row.value,
        sort_order=int(row.sort_order or 0),
        is_active=bool(row.is_active),
        probability_percent=probability_percent,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


# -----------------------------
# CRM: Opportunity Stages
# -----------------------------
@router.get("/opportunity-stages", response_model=list[OpportunityStageOut])
async def list_opportunity_stages(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[OpportunityStageOut]:
    if _ensure_fixed_opportunity_stages(db, bu.id):
        db.commit()

    rows = _list_ordered_opportunity_stages(db, bu.id, include_inactive=include_inactive)
    rows = _dedupe_fixed_opportunity_stage_rows(rows)
    probabilities = _build_opportunity_stage_probability_map(rows)
    return [_opportunity_stage_out(r, probability_percent=probabilities.get(r.id)) for r in rows]


@router.post(
    "/opportunity-stages",
    response_model=OpportunityStageOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_opportunity_stage(
    payload: OpportunityStageCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> OpportunityStageOut:
    if _ensure_fixed_opportunity_stages(db, bu.id):
        db.commit()

    value = _normalize_opportunity_stage_value(payload.value)
    if not value:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="value is required")
    if _is_fixed_opportunity_stage_value(value):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stage de sistema já existe e é fixo (Inicial, Fechado, Perdido).",
        )

    existing = (
        db.execute(
            select(OpportunityStage).where(
                OpportunityStage.business_unit_id == bu.id,
                func.lower(OpportunityStage.value) == value.lower(),
            )
        )
        .scalars()
        .first()
    )
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Opportunity stage already exists")
        existing.is_active = True
        existing.value = value
        if payload.sort_order is not None:
            existing.sort_order = _validate_custom_opportunity_stage_sort_order(payload.sort_order)
        else:
            existing.sort_order = _next_custom_opportunity_stage_sort_order(db, bu.id)
        db.add(existing)
        db.commit()
        rows = _list_ordered_opportunity_stages(db, bu.id, include_inactive=True)
        rows = _dedupe_fixed_opportunity_stage_rows(rows)
        probabilities = _build_opportunity_stage_probability_map(rows)
        return _opportunity_stage_out(existing, probability_percent=probabilities.get(existing.id))

    if payload.sort_order is None:
        sort_order = _next_custom_opportunity_stage_sort_order(db, bu.id)
    else:
        sort_order = _validate_custom_opportunity_stage_sort_order(payload.sort_order)

    row = OpportunityStage(
        business_unit_id=bu.id,
        value=value,
        sort_order=sort_order,
        is_active=True,
    )
    db.add(row)
    db.commit()
    rows = _list_ordered_opportunity_stages(db, bu.id, include_inactive=True)
    rows = _dedupe_fixed_opportunity_stage_rows(rows)
    probabilities = _build_opportunity_stage_probability_map(rows)
    return _opportunity_stage_out(row, probability_percent=probabilities.get(row.id))


@router.patch(
    "/opportunity-stages/{stage_id}",
    response_model=OpportunityStageOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_opportunity_stage(
    stage_id: str,
    payload: OpportunityStagePatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> OpportunityStageOut:
    if _ensure_fixed_opportunity_stages(db, bu.id):
        db.commit()

    row = db.get(OpportunityStage, stage_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity stage not found")

    row_is_fixed = _is_fixed_opportunity_stage_value(row.value)
    old_value = row.value

    if payload.value is not None:
        next_value = _normalize_opportunity_stage_value(payload.value)
        if not next_value:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="value is required")
        if row_is_fixed and _opportunity_stage_key(next_value) != _opportunity_stage_key(row.value):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Stages fixos (Inicial, Fechado, Perdido) não podem ser renomeados.",
            )
        if not row_is_fixed and _is_fixed_opportunity_stage_value(next_value):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Não é permitido renomear stage custom para nome de stage fixo.",
            )

        conflict = (
            db.execute(
                select(OpportunityStage).where(
                    OpportunityStage.business_unit_id == bu.id,
                    OpportunityStage.id != row.id,
                    func.lower(OpportunityStage.value) == next_value.lower(),
                )
            )
            .scalars()
            .first()
        )
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Opportunity stage already exists")
        row.value = next_value

    if payload.sort_order is not None:
        if row_is_fixed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Stages fixos (Inicial, Fechado, Perdido) não podem ter ordem alterada.",
            )
        row.sort_order = _validate_custom_opportunity_stage_sort_order(payload.sort_order)
    if payload.is_active is not None:
        if row_is_fixed and not bool(payload.is_active):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Stages fixos (Inicial, Fechado, Perdido) não podem ser inativados.",
            )
        row.is_active = bool(payload.is_active)

    if payload.value is not None and _normalize_opportunity_stage_value(old_value).lower() != _normalize_opportunity_stage_value(row.value).lower():
        db.execute(
            Opportunity.__table__.update()
            .where(
                Opportunity.business_unit_id == bu.id,
                func.lower(Opportunity.stage) == _normalize_opportunity_stage_value(old_value).lower(),
            )
            .values(stage=row.value)
        )

    db.add(row)
    db.commit()
    rows = _list_ordered_opportunity_stages(db, bu.id, include_inactive=True)
    rows = _dedupe_fixed_opportunity_stage_rows(rows)
    probabilities = _build_opportunity_stage_probability_map(rows)
    return _opportunity_stage_out(row, probability_percent=probabilities.get(row.id))


@router.delete(
    "/opportunity-stages/{stage_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_csrf)],
)
async def delete_opportunity_stage(
    stage_id: str,
    payload: OpportunityStageDelete | None = Body(default=None),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> Response:
    if _ensure_fixed_opportunity_stages(db, bu.id):
        db.commit()

    row = db.get(OpportunityStage, stage_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity stage not found")
    if _is_fixed_opportunity_stage_value(row.value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Stages fixos (Inicial, Fechado, Perdido) não podem ser deletados.",
        )

    replacement_stage_id = ""
    if payload and payload.replacement_stage_id is not None:
        replacement_stage_id = (payload.replacement_stage_id or "").strip()

    replacement_row: OpportunityStage | None = None
    if replacement_stage_id:
        replacement_row = db.get(OpportunityStage, replacement_stage_id)
        if not replacement_row or replacement_row.business_unit_id != bu.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Replacement stage not found")
        if replacement_row.id == row.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Replacement stage must be different from stage to delete")
        if not replacement_row.is_active:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Replacement stage must be active")

    in_use_count = int(
        db.execute(
            select(func.count(Opportunity.id)).where(
                Opportunity.business_unit_id == bu.id,
                func.lower(Opportunity.stage) == _normalize_opportunity_stage_value(row.value).lower(),
            )
        ).scalar_one_or_none()
        or 0
    )

    if in_use_count > 0:
        if not replacement_row:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Stage em uso por {in_use_count} oportunidade(s). Selecione um stage de destino para migração antes de deletar.",
            )
        db.execute(
            Opportunity.__table__.update()
            .where(
                Opportunity.business_unit_id == bu.id,
                func.lower(Opportunity.stage) == _normalize_opportunity_stage_value(row.value).lower(),
            )
            .values(stage=replacement_row.value)
        )

    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# CRM: Oportunidade
# -----------------------------
def _parse_date_iso(value: str | None) -> dt.date | None:
    if not value:
        return None
    return dt.date.fromisoformat(value)


def _parse_datetime_iso(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    return _parse_datetime(value)


def _order_form_out(row: OrderForm) -> OrderFormOut:
    return OrderFormOut(
        id=row.id,
        opportunity_id=row.opportunity_id,
        account_id=row.account_id,
        name=row.name,
        status=row.status,
        effective_start_date=row.effective_start_date.isoformat() if row.effective_start_date else None,
        effective_end_date=row.effective_end_date.isoformat() if row.effective_end_date else None,
        total_amount=float(row.total_amount or 0),
        currency=row.currency,
        signed_at=_iso(row.signed_at) if row.signed_at else None,
        contract_generated=bool(row.contract_generated),
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        notes=row.notes or "",
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


def _quote_out(row: Quote) -> QuoteOut:
    return QuoteOut(
        id=row.id,
        opportunity_id=row.opportunity_id,
        account_id=row.account_id,
        name=row.name,
        status=row.status,
        valid_until=row.valid_until.isoformat() if row.valid_until else None,
        total_amount=float(row.total_amount or 0),
        discount_amount=float(row.discount_amount or 0),
        final_amount=float(row.final_amount or 0),
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


def _quote_item_out(row: QuoteItem, *, product_name: str | None = None) -> QuoteItemOut:
    return QuoteItemOut(
        id=row.id,
        quote_id=row.quote_id,
        product_id=row.product_id,
        product_name=product_name,
        description=row.description or "",
        quantity=float(row.quantity or 0),
        unit_price=float(row.unit_price or 0),
        discount_percent=float(row.discount_percent or 0),
        discount_amount=float(row.discount_amount or 0),
        line_total=float(row.line_total or 0),
        sort_order=int(row.sort_order or 0),
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


def _activity_out(row: Activity, *, participants: list[ActivityParticipantOut] | None = None) -> ActivityOut:
    return ActivityOut(
        id=row.id,
        type=row.type,
        subject=row.subject,
        description=row.description or "",
        status=row.status,
        priority=row.priority,
        due_date=row.due_date.isoformat() if row.due_date else None,
        start_at=_iso(row.start_at) if row.start_at else None,
        end_at=_iso(row.end_at) if row.end_at else None,
        completed_at=_iso(row.completed_at) if row.completed_at else None,
        what_type=row.what_type,
        what_id=row.what_id,
        who_type=row.who_type,
        who_id=row.who_id,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        participants=participants or [],
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


def _load_activity_participants_map(
    db: Session,
    bu_id: str,
    activity_ids: list[str],
) -> dict[str, list[ActivityParticipantOut]]:
    if not activity_ids:
        return {}

    rows = db.execute(
        select(
            ActivityParticipant.activity_id,
            ActivityParticipant.contact_id,
            Contact.name,
        )
        .join(
            Contact,
            (Contact.id == ActivityParticipant.contact_id) & (Contact.business_unit_id == bu_id),
        )
        .where(
            ActivityParticipant.business_unit_id == bu_id,
            ActivityParticipant.activity_id.in_(activity_ids),
        )
        .order_by(ActivityParticipant.created_at.asc())
    ).all()

    out: dict[str, list[ActivityParticipantOut]] = {}
    for activity_id, contact_id, contact_name in rows:
        out.setdefault(activity_id, []).append(
            ActivityParticipantOut(
                contact_id=contact_id,
                contact_name=contact_name,
            )
        )
    return out


def _sync_activity_participants(
    db: Session,
    bu_id: str,
    activity_id: str,
    contact_ids_raw: list[str],
) -> None:
    normalized_ids: list[str] = []
    seen: set[str] = set()
    for item in contact_ids_raw:
        cid = (item or "").strip()
        if not cid or cid in seen:
            continue
        seen.add(cid)
        normalized_ids.append(cid)

    if normalized_ids:
        existing_contacts = set(
            db.execute(
                select(Contact.id).where(
                    Contact.business_unit_id == bu_id,
                    Contact.id.in_(normalized_ids),
                )
            ).scalars().all()
        )
        missing = [cid for cid in normalized_ids if cid not in existing_contacts]
        if missing:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="participant contact not found")

    current_rows = db.execute(
        select(ActivityParticipant).where(
            ActivityParticipant.business_unit_id == bu_id,
            ActivityParticipant.activity_id == activity_id,
        )
    ).scalars().all()
    current_ids = {r.contact_id for r in current_rows}
    desired_ids = set(normalized_ids)

    to_delete = [r for r in current_rows if r.contact_id not in desired_ids]
    for row in to_delete:
        db.delete(row)

    for contact_id in normalized_ids:
        if contact_id in current_ids:
            continue
        db.add(
            ActivityParticipant(
                business_unit_id=bu_id,
                activity_id=activity_id,
                contact_id=contact_id,
            )
        )


def _normalize_quote_item_values(
    quantity: float | None,
    unit_price: float | None,
    discount_percent: float | None,
    discount_amount: float | None,
) -> tuple[float, float, float, float, float, float]:
    quantity_value = float(1 if quantity is None else quantity)
    unit_price_value = float(0 if unit_price is None else unit_price)
    discount_percent_value = float(0 if discount_percent is None else discount_percent)
    discount_amount_value = float(0 if discount_amount is None else discount_amount)

    if quantity_value < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="quantity must be >= 0")
    if unit_price_value < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="unit_price must be >= 0")
    if discount_percent_value < 0 or discount_percent_value > 100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="discount_percent must be between 0 and 100")
    if discount_amount_value < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="discount_amount must be >= 0")

    gross = quantity_value * unit_price_value
    discount_total = (gross * (discount_percent_value / 100.0)) + discount_amount_value
    line_total = max(gross - discount_total, 0)
    return quantity_value, unit_price_value, discount_percent_value, discount_amount_value, discount_total, line_total


def _recalculate_quote_totals(db: Session, row: Quote) -> None:
    items = (
        db.execute(
            select(QuoteItem).where(
                QuoteItem.business_unit_id == row.business_unit_id,
                QuoteItem.quote_id == row.id,
            )
        )
        .scalars()
        .all()
    )
    total_amount = 0.0
    discount_amount = 0.0
    final_amount = 0.0

    for item in items:
        gross = float(item.quantity or 0) * float(item.unit_price or 0)
        discount_total = (gross * (float(item.discount_percent or 0) / 100.0)) + float(item.discount_amount or 0)
        total_amount += gross
        discount_amount += discount_total
        final_amount += float(item.line_total or 0)

    row.total_amount = total_amount
    row.discount_amount = discount_amount
    row.final_amount = max(final_amount, 0)
    db.add(row)


def _validate_activity_reference(
    db: Session,
    bu_id: str,
    *,
    what_type: str | None,
    what_id: str | None,
    who_type: str | None,
    who_id: str | None,
) -> tuple[str | None, str | None, str | None, str | None]:
    next_what_type = (what_type or "").strip().lower() or None
    next_what_id = (what_id or "").strip() or None
    next_who_type = (who_type or "").strip().lower() or None
    next_who_id = (who_id or "").strip() or None

    if bool(next_what_type) != bool(next_what_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="what_type and what_id must be provided together",
        )
    if bool(next_who_type) != bool(next_who_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="who_type and who_id must be provided together",
        )

    if next_what_type and next_what_id:
        model = _ENTITY_MODELS.get(next_what_type)
        if model is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid what_type")
        entity = db.get(model, next_what_id)
        if not entity or entity.business_unit_id != bu_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="what record not found")

    if next_who_type and next_who_id:
        who_model = {"lead": Lead, "contact": Contact}.get(next_who_type)
        if who_model is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid who_type")
        who_entity = db.get(who_model, next_who_id)
        if not who_entity or who_entity.business_unit_id != bu_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="who record not found")

    return next_what_type, next_what_id, next_who_type, next_who_id


def _resolve_activity_owner(
    db: Session,
    *,
    user: User,
    owner_id_raw: str | None,
) -> tuple[str, str]:
    owner_id = (owner_id_raw or user.id).strip() if (owner_id_raw or user.id) else user.id
    owner_name = (user.name or user.email or "").strip() if owner_id == user.id else ""
    if owner_id != user.id:
        ou = db.execute(select(User).where(User.id == owner_id)).scalar_one_or_none()
        if not ou:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Owner not found")
        owner_name = (ou.name or ou.email or "").strip()
    return owner_id, owner_name


@router.get("/opportunities", response_model=list[OpportunityOut])
async def list_opportunities(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[OpportunityOut]:
    rows = (
        db.execute(select(Opportunity).where(Opportunity.business_unit_id == bu.id).order_by(Opportunity.created_at.desc()))
        .scalars()
        .all()
    )

    out: list[OpportunityOut] = []
    for r in rows:
        out.append(
            OpportunityOut(
                id=r.id,
                account_id=r.account_id,
                name=r.name,
                stage=r.stage,
                amount=float(r.amount or 0),
                close_date=r.close_date.isoformat() if r.close_date else None,
                owner_id=r.owner_id,
                owner_name=r.owner_name,
                created_at=_iso(r.created_at),
                updated_at=_iso(r.updated_at),
                custom_fields=_read_custom_fields(db, bu.id, "opportunity", r.id),
            )
        )
    return out


@router.post(
    "/opportunities",
    response_model=OpportunityOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_opportunity(
    payload: OpportunityCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> OpportunityOut:
    if _ensure_fixed_opportunity_stages(db, bu.id):
        db.commit()

    custom = _apply_defaults_and_validate_required(db, bu.id, "opportunity", payload.custom_fields)
    resolved_stage = _resolve_opportunity_stage_value(db, bu.id, payload.stage)

    account_id = (payload.account_id or "").strip()
    if account_id:
        account = db.get(Account, account_id)
        if not account or account.business_unit_id != bu.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Account not found")
    else:
        account_id = None

    owner_id = (payload.owner_id or user.id).strip() if (payload.owner_id or user.id) else user.id
    owner_name = (user.name or user.email or "").strip() if owner_id == user.id else ""
    if owner_id != user.id:
        ou = db.execute(select(User).where(User.id == owner_id)).scalar_one_or_none()
        if not ou:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Owner not found")
        owner_name = (ou.name or ou.email or "").strip()

    row = Opportunity(
        business_unit_id=bu.id,
        account_id=account_id,
        name=payload.name,
        stage=resolved_stage,
        amount=float(payload.amount or 0),
        close_date=_parse_date_iso(payload.close_date),
        owner_id=owner_id,
        owner_name=owner_name,
    )
    db.add(row)
    db.flush()

    if custom:
        _upsert_custom_fields(db, bu.id, "opportunity", row.id, custom)

    db.commit()
    return OpportunityOut(
        id=row.id,
        account_id=row.account_id,
        name=row.name,
        stage=row.stage,
        amount=float(row.amount or 0),
        close_date=row.close_date.isoformat() if row.close_date else None,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "opportunity", row.id),
    )


# -----------------------------
# CRM: Atividades
# -----------------------------
@router.get("/activities", response_model=list[ActivityOut])
async def list_activities(
    view: Literal["open", "history", "all"] = Query(default="open"),
    what_type: Literal["account", "lead", "contact", "opportunity"] | None = Query(default=None),
    what_id: str | None = Query(default=None, min_length=1, max_length=18),
    who_type: Literal["lead", "contact"] | None = Query(default=None),
    who_id: str | None = Query(default=None, min_length=1, max_length=18),
    activity_type: Literal["task", "event", "call", "email"] | None = Query(default=None, alias="type"),
    status_filter: str | None = Query(default=None, alias="status"),
    owner_id: str | None = Query(default=None, min_length=1, max_length=18),
    participant_contact_id: str | None = Query(default=None, min_length=1, max_length=18),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[ActivityOut]:
    next_what_type, next_what_id, next_who_type, next_who_id = _validate_activity_reference(
        db,
        bu.id,
        what_type=what_type,
        what_id=what_id,
        who_type=who_type,
        who_id=who_id,
    )

    stmt = select(Activity).where(Activity.business_unit_id == bu.id)
    if next_what_type and next_what_id:
        stmt = stmt.where(
            Activity.what_type == next_what_type,
            Activity.what_id == next_what_id,
        )
    if next_who_type and next_who_id:
        stmt = stmt.where(
            Activity.who_type == next_who_type,
            Activity.who_id == next_who_id,
        )
    if activity_type:
        stmt = stmt.where(Activity.type == _normalize_activity_type(activity_type))
    if status_filter:
        stmt = stmt.where(Activity.status == _normalize_activity_status(status_filter))
    if owner_id:
        stmt = stmt.where(Activity.owner_id == owner_id)
    if participant_contact_id:
        stmt = stmt.where(
            Activity.id.in_(
                select(ActivityParticipant.activity_id).where(
                    ActivityParticipant.business_unit_id == bu.id,
                    ActivityParticipant.contact_id == participant_contact_id,
                )
            )
        )

    range_start = _parse_date_iso(date_from)
    range_end = _parse_date_iso(date_to)
    if range_start or range_end:
        reference_date = func.coalesce(
            Activity.due_date,
            func.cast(Activity.start_at, Date),
            func.cast(Activity.completed_at, Date),
            func.cast(Activity.created_at, Date),
        )
        if range_start:
            stmt = stmt.where(reference_date >= range_start)
        if range_end:
            stmt = stmt.where(reference_date <= range_end)

    terminal_status = ("Completed", "Cancelled")
    if view == "open":
        stmt = stmt.where(Activity.status.notin_(terminal_status))
        stmt = stmt.order_by(
            case((Activity.due_date.is_(None), 1), else_=0),
            Activity.due_date.asc(),
            Activity.created_at.desc(),
        )
    elif view == "history":
        stmt = stmt.where(Activity.status.in_(terminal_status))
        stmt = stmt.order_by(
            case((Activity.completed_at.is_(None), 1), else_=0),
            Activity.completed_at.desc(),
            Activity.updated_at.desc(),
        )
    else:
        stmt = stmt.order_by(Activity.created_at.desc())

    rows = db.execute(stmt.limit(limit)).scalars().all()
    participants_map = _load_activity_participants_map(db, bu.id, [r.id for r in rows])
    return [_activity_out(r, participants=participants_map.get(r.id, [])) for r in rows]


@router.post(
    "/activities",
    response_model=ActivityOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_activity(
    payload: ActivityCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> ActivityOut:
    activity_type = _normalize_activity_type(payload.type)
    status_value = _normalize_activity_status(payload.status)
    priority_value = _normalize_activity_priority(payload.priority)
    subject = (payload.subject or "").strip()
    if not subject:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="subject is required")

    if payload.start_at and payload.end_at:
        start_dt = _parse_datetime_iso(payload.start_at)
        end_dt = _parse_datetime_iso(payload.end_at)
        if start_dt and end_dt and end_dt < start_dt:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end_at must be >= start_at")

    next_what_type, next_what_id, next_who_type, next_who_id = _validate_activity_reference(
        db,
        bu.id,
        what_type=payload.what_type,
        what_id=payload.what_id,
        who_type=payload.who_type,
        who_id=payload.who_id,
    )
    owner_id, owner_name = _resolve_activity_owner(db, user=user, owner_id_raw=payload.owner_id)

    completed_at = _parse_datetime_iso(payload.completed_at) if payload.completed_at else None
    if status_value == "Completed" and completed_at is None:
        completed_at = dt.datetime.now(dt.timezone.utc)

    row = Activity(
        business_unit_id=bu.id,
        type=activity_type,
        subject=subject,
        description=(payload.description or "").strip(),
        status=status_value,
        priority=priority_value,
        due_date=_parse_date_iso(payload.due_date),
        start_at=_parse_datetime_iso(payload.start_at),
        end_at=_parse_datetime_iso(payload.end_at),
        completed_at=completed_at,
        what_type=next_what_type,
        what_id=next_what_id,
        who_type=next_who_type,
        who_id=next_who_id,
        owner_id=owner_id,
        owner_name=owner_name,
    )
    db.add(row)
    db.flush()
    _sync_activity_participants(db, bu.id, row.id, payload.participant_contact_ids or [])
    db.commit()
    participants_map = _load_activity_participants_map(db, bu.id, [row.id])
    return _activity_out(row, participants=participants_map.get(row.id, []))


@router.patch(
    "/activities/{activity_id}",
    response_model=ActivityOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_activity(
    activity_id: str,
    payload: ActivityPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> ActivityOut:
    row = db.get(Activity, activity_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    data = payload.model_dump(exclude_unset=True)

    if "type" in data:
        row.type = _normalize_activity_type(payload.type)
    if "subject" in data:
        next_subject = (payload.subject or "").strip()
        if not next_subject:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="subject is required")
        row.subject = next_subject
    if "description" in data:
        row.description = (payload.description or "").strip()
    if "priority" in data:
        row.priority = _normalize_activity_priority(payload.priority)
    if "due_date" in data:
        row.due_date = _parse_date_iso(payload.due_date)
    if "start_at" in data:
        row.start_at = _parse_datetime_iso(payload.start_at)
    if "end_at" in data:
        row.end_at = _parse_datetime_iso(payload.end_at)
    if row.start_at and row.end_at and row.end_at < row.start_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end_at must be >= start_at")

    next_what_type = row.what_type
    next_what_id = row.what_id
    next_who_type = row.who_type
    next_who_id = row.who_id
    if "what_type" in data:
        next_what_type = payload.what_type
    if "what_id" in data:
        next_what_id = payload.what_id
    if "who_type" in data:
        next_who_type = payload.who_type
    if "who_id" in data:
        next_who_id = payload.who_id

    ref_what_type, ref_what_id, ref_who_type, ref_who_id = _validate_activity_reference(
        db,
        bu.id,
        what_type=next_what_type,
        what_id=next_what_id,
        who_type=next_who_type,
        who_id=next_who_id,
    )
    row.what_type = ref_what_type
    row.what_id = ref_what_id
    row.who_type = ref_who_type
    row.who_id = ref_who_id

    if "owner_id" in data:
        owner_id, owner_name = _resolve_activity_owner(db, user=user, owner_id_raw=payload.owner_id)
        row.owner_id = owner_id
        row.owner_name = owner_name

    if "status" in data:
        row.status = _normalize_activity_status(payload.status)
        if row.status == "Completed" and row.completed_at is None:
            row.completed_at = dt.datetime.now(dt.timezone.utc)
        elif row.status != "Completed" and "completed_at" not in data:
            row.completed_at = None

    if "completed_at" in data:
        row.completed_at = _parse_datetime_iso(payload.completed_at)

    db.add(row)
    if "participant_contact_ids" in data:
        _sync_activity_participants(db, bu.id, row.id, payload.participant_contact_ids or [])
    db.commit()
    participants_map = _load_activity_participants_map(db, bu.id, [row.id])
    return _activity_out(row, participants=participants_map.get(row.id, []))


@router.post(
    "/activities/{activity_id}/complete",
    response_model=ActivityOut,
    dependencies=[Depends(require_csrf)],
)
async def complete_activity(
    activity_id: str,
    payload: ActivityComplete | None = Body(default=None),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> ActivityOut:
    row = db.get(Activity, activity_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    row.status = "Completed"
    if payload and payload.completed_at:
        row.completed_at = _parse_datetime_iso(payload.completed_at)
    if row.completed_at is None:
        row.completed_at = dt.datetime.now(dt.timezone.utc)

    db.add(row)
    db.commit()
    participants_map = _load_activity_participants_map(db, bu.id, [row.id])
    return _activity_out(row, participants=participants_map.get(row.id, []))


@router.delete(
    "/activities/{activity_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_csrf)],
)
async def delete_activity(
    activity_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> Response:
    row = db.get(Activity, activity_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -----------------------------
# CRM: Relatórios (Fase 1)
# -----------------------------
_REPORT_TYPE_LABELS: dict[str, str] = {
    "account": "Conta",
    "contact": "Contato",
    "lead": "Lead",
    "opportunity": "Oportunidade",
}

_REPORT_CORE_FIELDS: dict[str, dict[str, dict[str, Any]]] = {
    "account": {
        "id": {"label": "ID", "data_type": "text", "aggregatable": False},
        "name": {"label": "Nome", "data_type": "text", "aggregatable": False},
        "owner_name": {"label": "Owner", "data_type": "text", "aggregatable": False},
        "created_at": {"label": "Criado em", "data_type": "datetime", "aggregatable": False},
        "updated_at": {"label": "Atualizado em", "data_type": "datetime", "aggregatable": False},
    },
    "contact": {
        "id": {"label": "ID", "data_type": "text", "aggregatable": False},
        "account_id": {"label": "Conta (ID)", "data_type": "text", "aggregatable": False},
        "account_name": {"label": "Conta", "data_type": "text", "aggregatable": False},
        "name": {"label": "Nome", "data_type": "text", "aggregatable": False},
        "external_id": {"label": "External ID", "data_type": "text", "aggregatable": False},
        "contact_role": {"label": "Contact Role", "data_type": "text", "aggregatable": False},
        "owner_name": {"label": "Owner", "data_type": "text", "aggregatable": False},
        "created_at": {"label": "Criado em", "data_type": "datetime", "aggregatable": False},
        "updated_at": {"label": "Atualizado em", "data_type": "datetime", "aggregatable": False},
    },
    "lead": {
        "id": {"label": "ID", "data_type": "text", "aggregatable": False},
        "account_id": {"label": "Conta (ID)", "data_type": "text", "aggregatable": False},
        "account_name": {"label": "Conta", "data_type": "text", "aggregatable": False},
        "name": {"label": "Nome", "data_type": "text", "aggregatable": False},
        "email": {"label": "Email", "data_type": "text", "aggregatable": False},
        "phone": {"label": "Telefone", "data_type": "text", "aggregatable": False},
        "status": {"label": "Status", "data_type": "text", "aggregatable": False},
        "source": {"label": "Fonte", "data_type": "text", "aggregatable": False},
        "score": {"label": "Score", "data_type": "number", "aggregatable": True},
        "owner_name": {"label": "Owner", "data_type": "text", "aggregatable": False},
        "created_at": {"label": "Criado em", "data_type": "datetime", "aggregatable": False},
        "updated_at": {"label": "Atualizado em", "data_type": "datetime", "aggregatable": False},
    },
    "opportunity": {
        "id": {"label": "ID", "data_type": "text", "aggregatable": False},
        "account_id": {"label": "Conta (ID)", "data_type": "text", "aggregatable": False},
        "account_name": {"label": "Conta", "data_type": "text", "aggregatable": False},
        "name": {"label": "Nome", "data_type": "text", "aggregatable": False},
        "stage": {"label": "Stage", "data_type": "text", "aggregatable": False},
        "amount": {"label": "Valor", "data_type": "number", "aggregatable": True},
        "close_date": {"label": "Data de fechamento", "data_type": "date", "aggregatable": False},
        "owner_name": {"label": "Owner", "data_type": "text", "aggregatable": False},
        "created_at": {"label": "Criado em", "data_type": "datetime", "aggregatable": False},
        "updated_at": {"label": "Atualizado em", "data_type": "datetime", "aggregatable": False},
    },
}


def _report_entity_type(report_type: str) -> str:
    key = (report_type or "").strip().lower()
    if key not in _REPORT_TYPE_LABELS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid report_type")
    return key


def _report_folder_key(folder: str | None) -> str:
    key = (folder or "").strip().lower() or "private"
    if key not in {"public", "private"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid report folder")
    return key


def _can_view_report(row: ReportDefinition, user_id: str) -> bool:
    folder = _report_folder_key(row.folder)
    if folder == "public":
        return True
    return (row.owner_id or "").strip() == (user_id or "").strip()


def _can_manage_report(row: ReportDefinition, user_id: str) -> bool:
    return (row.owner_id or "").strip() == (user_id or "").strip()


def _report_field_data_type(field_type: str | None) -> str:
    t = (field_type or "").strip().lower()
    if t == "number":
        return "number"
    if t == "boolean":
        return "boolean"
    if t == "date":
        return "date"
    if t == "datetime":
        return "datetime"
    if t == "multi_select":
        return "json"
    return "text"


def _report_field_out(key: str, spec: dict[str, Any], *, source: str = "core") -> ReportFieldOut:
    return ReportFieldOut(
        key=key,
        label=str(spec.get("label") or key),
        data_type=str(spec.get("data_type") or "text"),
        source=source,  # type: ignore[arg-type]
        filterable=bool(spec.get("filterable", True)),
        sortable=bool(spec.get("sortable", True)),
        aggregatable=bool(spec.get("aggregatable", False)),
    )


def _report_fields_map(
    db: Session,
    bu_id: str,
    report_type: str,
) -> dict[str, ReportFieldOut]:
    entity_type = _report_entity_type(report_type)
    core_specs = _REPORT_CORE_FIELDS.get(entity_type, {})
    out: dict[str, ReportFieldOut] = {k: _report_field_out(k, spec, source="core") for k, spec in core_specs.items()}

    custom_rows = (
        db.execute(
            select(CustomFieldDefinition).where(
                CustomFieldDefinition.business_unit_id == bu_id,
                CustomFieldDefinition.entity_type == entity_type,
                CustomFieldDefinition.custom_object_id.is_(None),
                CustomFieldDefinition.is_active.is_(True),
            ).order_by(CustomFieldDefinition.sort_order.asc(), CustomFieldDefinition.created_at.asc())
        )
        .scalars()
        .all()
    )

    for row in custom_rows:
        key = f"custom.{row.key}"
        out[key] = ReportFieldOut(
            key=key,
            label=row.label,
            data_type=_report_field_data_type(row.type),  # type: ignore[arg-type]
            source="custom",
            filterable=True,
            sortable=True,
            aggregatable=_report_field_data_type(row.type) == "number",
        )

    return out


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except Exception:
        return None


def _report_value_out(value: Any) -> Any:
    if isinstance(value, dt.datetime):
        return value.isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _build_account_name_map(db: Session, bu_id: str) -> dict[str, str]:
    rows = db.execute(
        select(Account.id, Account.name).where(Account.business_unit_id == bu_id)
    ).all()
    return {rid: (rname or "") for rid, rname in rows}


def _fetch_report_core_rows(
    db: Session,
    bu_id: str,
    report_type: str,
) -> list[dict[str, Any]]:
    entity_type = _report_entity_type(report_type)
    account_name_map = _build_account_name_map(db, bu_id)
    rows_out: list[dict[str, Any]] = []

    if entity_type == "account":
        rows = (
            db.execute(select(Account).where(Account.business_unit_id == bu_id).order_by(Account.created_at.desc()))
            .scalars()
            .all()
        )
        for row in rows:
            rows_out.append(
                {
                    "id": row.id,
                    "name": row.name,
                    "owner_name": row.owner_name or "",
                    "created_at": row.created_at,
                    "updated_at": row.updated_at,
                }
            )
        return rows_out

    if entity_type == "contact":
        rows = (
            db.execute(select(Contact).where(Contact.business_unit_id == bu_id).order_by(Contact.created_at.desc()))
            .scalars()
            .all()
        )
        for row in rows:
            rows_out.append(
                {
                    "id": row.id,
                    "account_id": row.account_id,
                    "account_name": account_name_map.get(row.account_id, ""),
                    "name": row.name,
                    "external_id": row.external_id,
                    "contact_role": row.contact_role,
                    "owner_name": row.owner_name or "",
                    "created_at": row.created_at,
                    "updated_at": row.updated_at,
                }
            )
        return rows_out

    if entity_type == "lead":
        rows = (
            db.execute(select(Lead).where(Lead.business_unit_id == bu_id).order_by(Lead.created_at.desc()))
            .scalars()
            .all()
        )
        for row in rows:
            rows_out.append(
                {
                    "id": row.id,
                    "account_id": row.account_id,
                    "account_name": account_name_map.get(row.account_id, ""),
                    "name": row.name,
                    "email": row.email or "",
                    "phone": row.phone or "",
                    "status": row.status or "",
                    "source": row.source or "",
                    "score": row.score,
                    "owner_name": row.owner_name or "",
                    "created_at": row.created_at,
                    "updated_at": row.updated_at,
                }
            )
        return rows_out

    rows = (
        db.execute(select(Opportunity).where(Opportunity.business_unit_id == bu_id).order_by(Opportunity.created_at.desc()))
        .scalars()
        .all()
    )
    for row in rows:
        rows_out.append(
            {
                "id": row.id,
                "account_id": row.account_id or "",
                "account_name": account_name_map.get(row.account_id or "", ""),
                "name": row.name,
                "stage": row.stage,
                "amount": _as_float(row.amount) or 0.0,
                "close_date": row.close_date,
                "owner_name": row.owner_name or "",
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
        )
    return rows_out


def _custom_value_from_row(value_row: CustomFieldValue, field_type: str | None) -> Any:
    t = (field_type or "").strip().lower()
    if t == "number":
        return _as_float(value_row.value_number)
    if t == "boolean":
        return bool(value_row.value_bool) if value_row.value_bool is not None else None
    if t == "date":
        return value_row.value_date
    if t == "datetime":
        return value_row.value_ts
    if t == "multi_select":
        return value_row.value_json
    return value_row.value_text


def _hydrate_custom_fields(
    db: Session,
    bu_id: str,
    entity_type: str,
    rows: list[dict[str, Any]],
) -> None:
    row_ids = [str(r.get("id") or "").strip() for r in rows if str(r.get("id") or "").strip()]
    if not row_ids:
        return

    custom_defs = (
        db.execute(
            select(CustomFieldDefinition).where(
                CustomFieldDefinition.business_unit_id == bu_id,
                CustomFieldDefinition.entity_type == entity_type,
                CustomFieldDefinition.custom_object_id.is_(None),
                CustomFieldDefinition.is_active.is_(True),
            )
        )
        .scalars()
        .all()
    )
    if not custom_defs:
        return

    defs_by_id = {d.id: d for d in custom_defs}
    values = (
        db.execute(
            select(CustomFieldValue).where(
                CustomFieldValue.business_unit_id == bu_id,
                CustomFieldValue.entity_type == entity_type,
                CustomFieldValue.entity_id.in_(row_ids),
                CustomFieldValue.field_id.in_(list(defs_by_id.keys())),
            )
        )
        .scalars()
        .all()
    )

    row_by_id = {str(r.get("id")): r for r in rows}
    for value_row in values:
        report_row = row_by_id.get(value_row.entity_id)
        if report_row is None:
            continue
        d = defs_by_id.get(value_row.field_id)
        if d is None:
            continue
        report_row[f"custom.{d.key}"] = _custom_value_from_row(value_row, d.type)


def _value_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


def _coerce_rhs(lhs: Any, rhs: Any) -> Any:
    if rhs is None:
        return None
    if lhs is None:
        return rhs
    if isinstance(lhs, bool):
        if isinstance(rhs, bool):
            return rhs
        if isinstance(rhs, str):
            low = rhs.strip().lower()
            if low in {"true", "1", "yes", "sim"}:
                return True
            if low in {"false", "0", "no", "não", "nao"}:
                return False
        return bool(rhs)
    if isinstance(lhs, (int, float, Decimal)):
        return _as_float(rhs)
    if isinstance(lhs, dt.datetime):
        if isinstance(rhs, dt.datetime):
            return rhs
        if isinstance(rhs, str):
            return _parse_datetime_iso(rhs)
    if isinstance(lhs, dt.date):
        if isinstance(rhs, dt.date) and not isinstance(rhs, dt.datetime):
            return rhs
        if isinstance(rhs, str):
            return _parse_date_iso(rhs)
    return str(rhs)


def _match_filter(row_value: Any, op: str, value: Any, value_to: Any) -> bool:
    op_key = (op or "").strip().lower()

    if op_key == "is_empty":
        return _value_empty(row_value)
    if op_key == "is_not_empty":
        return not _value_empty(row_value)

    if op_key == "contains":
        return str(value or "").lower() in str(row_value or "").lower()
    if op_key == "starts_with":
        return str(row_value or "").lower().startswith(str(value or "").lower())
    if op_key == "in":
        raw = value
        if isinstance(raw, str):
            choices = [x.strip() for x in raw.split(",") if x.strip()]
        elif isinstance(raw, list):
            choices = raw
        else:
            choices = [raw]
        row_norm = str(row_value or "").lower()
        return any(row_norm == str(c or "").lower() for c in choices)

    rhs = _coerce_rhs(row_value, value)
    rhs_to = _coerce_rhs(row_value, value_to)
    lhs = row_value

    if op_key == "eq":
        return lhs == rhs
    if op_key == "neq":
        return lhs != rhs
    if op_key == "gt":
        return lhs is not None and rhs is not None and lhs > rhs
    if op_key == "gte":
        return lhs is not None and rhs is not None and lhs >= rhs
    if op_key == "lt":
        return lhs is not None and rhs is not None and lhs < rhs
    if op_key == "lte":
        return lhs is not None and rhs is not None and lhs <= rhs
    if op_key == "between":
        return lhs is not None and rhs is not None and rhs_to is not None and rhs <= lhs <= rhs_to

    return True


def _apply_report_filters(rows: list[dict[str, Any]], filters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = rows
    for f in filters:
        field = str(f.get("field") or "").strip()
        op = str(f.get("op") or "").strip()
        value = f.get("value")
        value_to = f.get("value_to")
        out = [r for r in out if _match_filter(r.get(field), op, value, value_to)]
    return out


def _sort_value(value: Any) -> tuple[int, Any]:
    if value is None:
        return (2, "")
    if isinstance(value, bool):
        return (0, int(value))
    if isinstance(value, (int, float, Decimal)):
        return (0, float(value))
    if isinstance(value, dt.datetime):
        return (0, value.timestamp())
    if isinstance(value, dt.date):
        return (0, value.toordinal())
    return (1, str(value).lower())


def _apply_report_sorts(rows: list[dict[str, Any]], sorts: list[ReportSortIn]) -> list[dict[str, Any]]:
    out = list(rows)
    for s in reversed(sorts):
        reverse = (s.direction or "asc") == "desc"
        out.sort(key=lambda r: _sort_value(r.get(s.field)), reverse=reverse)
    return out


def _validate_report_config_fields(config: dict[str, Any], fields_map: dict[str, ReportFieldOut]) -> None:
    allowed = set(fields_map.keys())

    for field in config.get("columns", []) or []:
        if field not in allowed:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown column field: {field}")
    for field in config.get("group_by", []) or []:
        if field not in allowed:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown group_by field: {field}")

    for item in config.get("filters", []) or []:
        field = str((item or {}).get("field") or "").strip()
        if field and field not in allowed:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown filter field: {field}")

    for item in config.get("sorts", []) or []:
        field = str((item or {}).get("field") or "").strip()
        if field and field not in allowed:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown sort field: {field}")

    aggregate = config.get("aggregate") or {}
    agg_field = str(aggregate.get("field") or "").strip()
    if agg_field and agg_field not in allowed:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown aggregate field: {agg_field}")


def _run_report(
    db: Session,
    bu_id: str,
    *,
    report_type: str,
    config: dict[str, Any],
) -> ReportRunOut:
    entity_type = _report_entity_type(report_type)
    fields_map = _report_fields_map(db, bu_id, entity_type)
    _validate_report_config_fields(config, fields_map)

    rows = _fetch_report_core_rows(db, bu_id, entity_type)
    _hydrate_custom_fields(db, bu_id, entity_type, rows)

    filters = config.get("filters", []) or []
    filtered = _apply_report_filters(rows, filters)
    total_rows = len(filtered)

    group_by: list[str] = list(config.get("group_by", []) or [])
    sorts_payload = config.get("sorts", []) or []
    sorts: list[ReportSortIn] = []
    for item in sorts_payload:
        try:
            sorts.append(ReportSortIn.model_validate(item))
        except Exception:
            continue

    limit = int(config.get("limit", 200) or 200)
    limit = max(1, min(limit, 5000))

    if group_by:
        aggregate_raw = config.get("aggregate") or {}
        fn = str(aggregate_raw.get("fn") or "count").lower()
        agg_field = str(aggregate_raw.get("field") or "").strip() or None
        alias = str(aggregate_raw.get("alias") or "").strip() or None
        metric_alias = alias or (f"{fn}_{agg_field}" if agg_field else fn)

        grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
        for row in filtered:
            key = tuple(row.get(g) for g in group_by)
            grouped.setdefault(key, []).append(row)

        grouped_rows: list[dict[str, Any]] = []
        for group_key, group_rows in grouped.items():
            out_row: dict[str, Any] = {}
            for idx, field in enumerate(group_by):
                out_row[field] = group_key[idx]

            metric: Any = len(group_rows)
            if fn in {"sum", "avg", "min", "max"} and agg_field:
                numeric_values: list[float] = []
                raw_values: list[Any] = []
                for gr in group_rows:
                    value = gr.get(agg_field)
                    if value is not None:
                        raw_values.append(value)
                    as_num = _as_float(value)
                    if as_num is not None:
                        numeric_values.append(as_num)

                if fn == "sum":
                    metric = float(sum(numeric_values)) if numeric_values else 0.0
                elif fn == "avg":
                    metric = (float(sum(numeric_values)) / len(numeric_values)) if numeric_values else None
                elif fn == "min":
                    metric = min(raw_values) if raw_values else None
                elif fn == "max":
                    metric = max(raw_values) if raw_values else None

            out_row[metric_alias] = metric
            out_row["row_count"] = len(group_rows)
            grouped_rows.append(out_row)

        sorted_grouped = _apply_report_sorts(grouped_rows, sorts) if sorts else grouped_rows
        truncated = len(sorted_grouped) > limit
        final_rows = sorted_grouped[:limit]
        columns = list(group_by)
        if metric_alias not in columns:
            columns.append(metric_alias)
        if "row_count" not in columns:
            columns.append("row_count")

        return ReportRunOut(
            columns=columns,
            rows=[{k: _report_value_out(v) for k, v in row.items()} for row in final_rows],
            total_rows=total_rows,
            truncated=truncated,
        )

    columns = list(config.get("columns", []) or [])
    if not columns:
        columns = list(_REPORT_CORE_FIELDS.get(entity_type, {}).keys())[:8]

    sorted_rows = _apply_report_sorts(filtered, sorts) if sorts else filtered
    truncated = len(sorted_rows) > limit
    final_rows = sorted_rows[:limit]
    projected = [{key: _report_value_out(row.get(key)) for key in columns} for row in final_rows]

    return ReportRunOut(
        columns=columns,
        rows=projected,
        total_rows=total_rows,
        truncated=truncated,
    )


def _report_definition_out(row: ReportDefinition) -> ReportDefinitionOut:
    return ReportDefinitionOut(
        id=row.id,
        name=row.name,
        report_type=row.report_type,  # type: ignore[arg-type]
        folder=_report_folder_key(row.folder),
        description=row.description or "",
        config=row.config or {},
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


@router.get("/report-types", response_model=list[ReportTypeOut])
async def list_report_types(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[ReportTypeOut]:
    out: list[ReportTypeOut] = []
    for key, label in _REPORT_TYPE_LABELS.items():
        fields_map = _report_fields_map(db, bu.id, key)
        fields = list(fields_map.values())
        out.append(ReportTypeOut(key=key, label=label, entity_type=key, fields=fields))  # type: ignore[arg-type]
    return out


@router.get("/reports", response_model=list[ReportDefinitionOut])
async def list_reports(
    report_type: str | None = Query(default=None),
    folder: str | None = Query(default=None),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> list[ReportDefinitionOut]:
    stmt = select(ReportDefinition).where(
        ReportDefinition.business_unit_id == bu.id,
        or_(
            ReportDefinition.folder == "public",
            ReportDefinition.owner_id == user.id,
        ),
    )
    if report_type:
        stmt = stmt.where(ReportDefinition.report_type == _report_entity_type(report_type))
    if folder:
        stmt = stmt.where(ReportDefinition.folder == _report_folder_key(folder))
    rows = db.execute(stmt.order_by(ReportDefinition.updated_at.desc(), ReportDefinition.created_at.desc())).scalars().all()
    return [_report_definition_out(r) for r in rows]


@router.post(
    "/reports",
    response_model=ReportDefinitionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_report(
    payload: ReportDefinitionCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> ReportDefinitionOut:
    report_type = _report_entity_type(payload.report_type)
    config_dict = payload.config.model_dump()
    _validate_report_config_fields(config_dict, _report_fields_map(db, bu.id, report_type))

    row = ReportDefinition(
        business_unit_id=bu.id,
        name=(payload.name or "").strip(),
        report_type=report_type,
        folder=_report_folder_key(payload.folder),
        description=(payload.description or "").strip(),
        config=config_dict,
        owner_id=user.id,
        owner_name=(user.name or user.email or "").strip(),
    )
    db.add(row)
    db.flush()
    out = _report_definition_out(row)
    db.commit()
    return out


@router.post("/reports/preview", response_model=ReportRunOut)
async def preview_report(
    payload: ReportPreviewIn,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> ReportRunOut:
    return _run_report(
        db,
        bu.id,
        report_type=payload.report_type,
        config=payload.config.model_dump(),
    )


@router.get("/reports/{report_id}", response_model=ReportDefinitionOut)
async def get_report(
    report_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> ReportDefinitionOut:
    row = db.get(ReportDefinition, report_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if not _can_view_report(row, user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return _report_definition_out(row)


@router.patch(
    "/reports/{report_id}",
    response_model=ReportDefinitionOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_report(
    report_id: str,
    payload: ReportDefinitionPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> ReportDefinitionOut:
    row = db.get(ReportDefinition, report_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if not _can_manage_report(row, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only report owner can edit this report")

    data = payload.model_dump(exclude_unset=True)
    next_type = row.report_type
    next_config = row.config or {}

    if "report_type" in data:
        next_type = _report_entity_type(payload.report_type)
    if "config" in data and payload.config is not None:
        next_config = payload.config.model_dump()
    _validate_report_config_fields(next_config, _report_fields_map(db, bu.id, next_type))

    if "name" in data:
        row.name = (payload.name or "").strip()
    if "report_type" in data:
        row.report_type = next_type
    if "description" in data:
        row.description = (payload.description or "").strip()
    if "folder" in data:
        row.folder = _report_folder_key(payload.folder)
    if "config" in data:
        row.config = next_config

    db.add(row)
    db.flush()
    out = _report_definition_out(row)
    db.commit()
    return out


@router.post("/reports/{report_id}/run", response_model=ReportRunOut)
async def run_report(
    report_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> ReportRunOut:
    row = db.get(ReportDefinition, report_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if not _can_view_report(row, user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return _run_report(db, bu.id, report_type=row.report_type, config=row.config or {})


@router.delete(
    "/reports/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_csrf)],
)
async def delete_report(
    report_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> Response:
    row = db.get(ReportDefinition, report_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if not _can_manage_report(row, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only report owner can delete this report")
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -----------------------------
# CRM: Dashboards (Fase 2)
# -----------------------------
def _dashboard_folder_key(folder: str | None) -> str:
    key = (folder or "").strip().lower() or "private"
    if key not in {"public", "private"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid dashboard folder")
    return key


def _can_view_dashboard(row: DashboardDefinition, user_id: str) -> bool:
    folder = _dashboard_folder_key(row.folder)
    if folder == "public":
        return True
    return (row.owner_id or "").strip() == (user_id or "").strip()


def _can_manage_dashboard(row: DashboardDefinition, user_id: str) -> bool:
    return (row.owner_id or "").strip() == (user_id or "").strip()


def _normalize_dashboard_layout(raw_layout: dict[str, Any] | None) -> dict[str, Any]:
    layout = raw_layout or {}
    columns_raw = layout.get("columns", 2)
    try:
        columns = int(columns_raw)
    except Exception:
        columns = 2
    columns = max(1, min(columns, 4))

    widgets_raw = layout.get("widgets", [])
    widgets: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    if isinstance(widgets_raw, list):
        for idx, item in enumerate(widgets_raw):
            if not isinstance(item, dict):
                continue
            wid = str(item.get("id") or "").strip()
            title = str(item.get("title") or "").strip()
            wtype = str(item.get("type") or "table").strip().lower()
            report_id = str(item.get("report_id") or "").strip()
            if not wid or not title or not report_id:
                continue
            if wtype not in {"kpi", "table", "bar", "line", "donut", "funnel", "gauge", "grouped_bar", "grouped_column", "grouped_donut", "grouped_funnel"}:
                wtype = "table"

            try:
                x = int(item.get("x", 24 + (idx % 3) * 380))
            except Exception:
                x = 24 + (idx % 3) * 380
            try:
                y = int(item.get("y", 24 + (idx // 3) * 260))
            except Exception:
                y = 24 + (idx // 3) * 260
            try:
                w = int(item.get("w", 360))
            except Exception:
                w = 360
            try:
                h = int(item.get("h", 240))
            except Exception:
                h = 240
            x = max(0, min(x, 10000))
            y = max(0, min(y, 10000))
            w = max(220, min(w, 1400))
            h = max(160, min(h, 1200))

            gauge_raw = item.get("gauge")
            gauge: dict[str, Any] | None = None
            if isinstance(gauge_raw, dict):
                try:
                    g_min = float(gauge_raw.get("min", 0))
                except Exception:
                    g_min = 0.0
                try:
                    g_max = float(gauge_raw.get("max", 100))
                except Exception:
                    g_max = 100.0
                try:
                    g_yellow = float(gauge_raw.get("yellow_from", 40))
                except Exception:
                    g_yellow = 40.0
                try:
                    g_green = float(gauge_raw.get("green_from", 70))
                except Exception:
                    g_green = 70.0
                g_measurement_raw = str(gauge_raw.get("measurement", "sum_values") or "sum_values").strip().lower()
                g_measurement = "record_count" if g_measurement_raw == "record_count" else "sum_values"
                g_show_percentages = bool(gauge_raw.get("show_percentages", False))
                g_show_values = bool(gauge_raw.get("show_values", True))
                g_show_ranges = bool(gauge_raw.get("show_ranges", True))

                if g_max <= g_min:
                    g_max = g_min + 1
                g_yellow = max(g_min, min(g_yellow, g_max))
                g_green = max(g_yellow, min(g_green, g_max))
                gauge = {
                    "min": g_min,
                    "max": g_max,
                    "yellow_from": g_yellow,
                    "green_from": g_green,
                    "measurement": g_measurement,
                    "show_percentages": g_show_percentages,
                    "show_values": g_show_values,
                    "show_ranges": g_show_ranges,
                }

            kpi_raw = item.get("kpi")
            kpi: dict[str, Any] | None = None
            if isinstance(kpi_raw, dict):
                k_measurement_raw = str(kpi_raw.get("measurement", "sum_values") or "sum_values").strip().lower()
                k_measurement = "record_count" if k_measurement_raw == "record_count" else "sum_values"
                kpi = {
                    "measurement": k_measurement,
                }

            grouped_bar_raw = item.get("grouped_bar")
            grouped_bar: dict[str, Any] | None = None
            if isinstance(grouped_bar_raw, dict):
                gb_group_1 = str(grouped_bar_raw.get("group_field_1") or "").strip()
                gb_group_2 = str(grouped_bar_raw.get("group_field_2") or "").strip()
                gb_measurement_raw = str(grouped_bar_raw.get("measurement", "record_count") or "record_count").strip().lower()
                gb_measurement = "sum_values" if gb_measurement_raw == "sum_values" else "record_count"
                gb_sum_field_raw = str(grouped_bar_raw.get("sum_field") or "").strip()
                gb_sum_field = gb_sum_field_raw or None
                try:
                    gb_max_rows = int(grouped_bar_raw.get("max_rows", 20))
                except Exception:
                    gb_max_rows = 20
                gb_max_rows = max(3, min(gb_max_rows, 200))
                grouped_bar = {
                    "group_field_1": gb_group_1,
                    "group_field_2": gb_group_2,
                    "measurement": gb_measurement,
                    "sum_field": gb_sum_field if gb_measurement == "sum_values" else None,
                    "max_rows": gb_max_rows,
                }

            grouped_column_raw = item.get("grouped_column")
            grouped_column: dict[str, Any] | None = None
            if isinstance(grouped_column_raw, dict):
                gc_x_field = str(grouped_column_raw.get("x_field") or "").strip()
                gc_series_field_raw = str(grouped_column_raw.get("series_field") or "").strip()
                gc_series_field = gc_series_field_raw or None
                gc_measurement_raw = str(grouped_column_raw.get("measurement", "record_count") or "record_count").strip().lower()
                gc_measurement = "sum_values" if gc_measurement_raw == "sum_values" else "record_count"
                gc_sum_field_raw = str(grouped_column_raw.get("sum_field") or "").strip()
                gc_sum_field = gc_sum_field_raw or None
                try:
                    gc_max_items = int(grouped_column_raw.get("max_items", 20))
                except Exception:
                    gc_max_items = 20
                gc_max_items = max(3, min(gc_max_items, 200))
                grouped_column = {
                    "x_field": gc_x_field,
                    "series_field": gc_series_field,
                    "measurement": gc_measurement,
                    "sum_field": gc_sum_field if gc_measurement == "sum_values" else None,
                    "max_items": gc_max_items,
                }

            grouped_donut_raw = item.get("grouped_donut")
            grouped_donut: dict[str, Any] | None = None
            if isinstance(grouped_donut_raw, dict):
                gd_category_field = str(grouped_donut_raw.get("category_field") or "").strip()
                gd_measurement_raw = str(grouped_donut_raw.get("measurement", "record_count") or "record_count").strip().lower()
                gd_measurement = "sum_values" if gd_measurement_raw == "sum_values" else "record_count"
                gd_sum_field_raw = str(grouped_donut_raw.get("sum_field") or "").strip()
                gd_sum_field = gd_sum_field_raw or None
                try:
                    gd_max_items = int(grouped_donut_raw.get("max_items", 8))
                except Exception:
                    gd_max_items = 8
                gd_max_items = max(3, min(gd_max_items, 200))
                grouped_donut = {
                    "category_field": gd_category_field,
                    "measurement": gd_measurement,
                    "sum_field": gd_sum_field if gd_measurement == "sum_values" else None,
                    "max_items": gd_max_items,
                }

            if wid in seen_ids:
                continue
            seen_ids.add(wid)
            widgets.append(
                {
                    "id": wid,
                    "title": title,
                    "type": wtype,
                    "report_id": report_id,
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h,
                    "gauge": gauge,
                    "kpi": kpi,
                    "grouped_bar": grouped_bar,
                    "grouped_column": grouped_column,
                    "grouped_donut": grouped_donut,
                }
            )

    return {"columns": columns, "widgets": widgets}


def _validate_dashboard_report_refs(db: Session, bu_id: str, layout: dict[str, Any]) -> None:
    widget_rows = list(layout.get("widgets", []) or [])
    report_ids = [str(item.get("report_id") or "").strip() for item in widget_rows]
    report_ids = [rid for rid in report_ids if rid]
    if not report_ids:
        return
    existing = set(
        db.execute(
            select(ReportDefinition.id).where(
                ReportDefinition.business_unit_id == bu_id,
                ReportDefinition.id.in_(report_ids),
            )
        ).scalars().all()
    )
    missing = [rid for rid in report_ids if rid not in existing]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="dashboard widget references unknown report_id",
        )


def _dashboard_definition_out(row: DashboardDefinition) -> DashboardDefinitionOut:
    return DashboardDefinitionOut(
        id=row.id,
        name=row.name,
        folder=_dashboard_folder_key(row.folder),
        description=row.description or "",
        layout=_normalize_dashboard_layout(row.layout or {}),
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


def _rebind_tenant_rls(db: Session, tenant_id: str) -> None:
    db.execute(text("SELECT set_config('app.tenant_id', :tenant_id, false)"), {"tenant_id": str(tenant_id)})


@router.get("/dashboards", response_model=list[DashboardDefinitionOut])
async def list_dashboards(
    folder: str | None = Query(default=None),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> list[DashboardDefinitionOut]:
    stmt = select(DashboardDefinition).where(
        DashboardDefinition.business_unit_id == bu.id,
        or_(
            DashboardDefinition.folder == "public",
            DashboardDefinition.owner_id == user.id,
        ),
    )
    if folder:
        stmt = stmt.where(DashboardDefinition.folder == _dashboard_folder_key(folder))
    rows = db.execute(stmt.order_by(DashboardDefinition.updated_at.desc(), DashboardDefinition.created_at.desc())).scalars().all()
    return [_dashboard_definition_out(r) for r in rows]


@router.post(
    "/dashboards",
    response_model=DashboardDefinitionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_dashboard(
    payload: DashboardDefinitionCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> DashboardDefinitionOut:
    layout = _normalize_dashboard_layout(payload.layout.model_dump())
    _validate_dashboard_report_refs(db, bu.id, layout)

    row = DashboardDefinition(
        business_unit_id=bu.id,
        name=(payload.name or "").strip(),
        folder=_dashboard_folder_key(payload.folder),
        description=(payload.description or "").strip(),
        layout=layout,
        owner_id=user.id,
        owner_name=(user.name or user.email or "").strip(),
    )
    db.add(row)
    db.commit()
    _rebind_tenant_rls(db, bu.id)
    db.refresh(row)
    return _dashboard_definition_out(row)


@router.get("/dashboards/{dashboard_id}", response_model=DashboardDefinitionOut)
async def get_dashboard(
    dashboard_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> DashboardDefinitionOut:
    row = db.get(DashboardDefinition, dashboard_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    if not _can_view_dashboard(row, user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    return _dashboard_definition_out(row)


@router.patch(
    "/dashboards/{dashboard_id}",
    response_model=DashboardDefinitionOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_dashboard(
    dashboard_id: str,
    payload: DashboardDefinitionPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> DashboardDefinitionOut:
    row = db.get(DashboardDefinition, dashboard_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    if not _can_manage_dashboard(row, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only dashboard owner can edit this dashboard")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        row.name = (payload.name or "").strip()
    if "folder" in data:
        row.folder = _dashboard_folder_key(payload.folder)
    if "description" in data:
        row.description = (payload.description or "").strip()
    if "layout" in data and payload.layout is not None:
        next_layout = _normalize_dashboard_layout(payload.layout.model_dump())
        _validate_dashboard_report_refs(db, bu.id, next_layout)
        row.layout = next_layout

    db.add(row)
    db.commit()
    _rebind_tenant_rls(db, bu.id)
    db.refresh(row)
    return _dashboard_definition_out(row)


@router.delete(
    "/dashboards/{dashboard_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_csrf)],
)
async def delete_dashboard(
    dashboard_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> Response:
    row = db.get(DashboardDefinition, dashboard_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    if not _can_manage_dashboard(row, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only dashboard owner can delete this dashboard")
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -----------------------------
# CRM: Order Form
# -----------------------------
@router.get("/order-forms", response_model=list[OrderFormOut])
async def list_order_forms(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[OrderFormOut]:
    rows = (
        db.execute(select(OrderForm).where(OrderForm.business_unit_id == bu.id).order_by(OrderForm.created_at.desc()))
        .scalars()
        .all()
    )
    return [_order_form_out(r) for r in rows]


@router.post(
    "/order-forms",
    response_model=OrderFormOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_order_form(
    payload: OrderFormCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> OrderFormOut:
    opportunity = db.get(Opportunity, payload.opportunity_id)
    if not opportunity or opportunity.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Opportunity not found")

    status_value = _normalize_order_form_status(payload.status)
    currency = _normalize_currency(payload.currency)
    if len(currency) != 3 or not currency.isalpha():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="currency must be a 3-letter code")

    owner_id = (payload.owner_id or user.id).strip() if (payload.owner_id or user.id) else user.id
    owner_name = (user.name or user.email or "").strip() if owner_id == user.id else ""
    if owner_id != user.id:
        ou = db.execute(select(User).where(User.id == owner_id)).scalar_one_or_none()
        if not ou:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Owner not found")
        owner_name = (ou.name or ou.email or "").strip()

    row = OrderForm(
        business_unit_id=bu.id,
        opportunity_id=opportunity.id,
        account_id=opportunity.account_id,
        name=(payload.name or "").strip(),
        status=status_value,
        effective_start_date=_parse_date_iso(payload.effective_start_date),
        effective_end_date=_parse_date_iso(payload.effective_end_date),
        total_amount=float(payload.total_amount or 0),
        currency=currency,
        signed_at=_parse_datetime_iso(payload.signed_at),
        contract_generated=bool(payload.contract_generated) if payload.contract_generated is not None else False,
        owner_id=owner_id,
        owner_name=owner_name,
        notes=(payload.notes or "").strip(),
    )

    if not row.name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")

    if row.effective_start_date and row.effective_end_date and row.effective_end_date < row.effective_start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="effective_end_date must be >= effective_start_date")

    if status_value == "Signed" and row.signed_at is None:
        row.signed_at = dt.datetime.now(dt.timezone.utc)

    db.add(row)
    db.flush()
    db.commit()
    return _order_form_out(row)


@router.get("/order-forms/{order_form_id}", response_model=OrderFormOut)
async def get_order_form(
    order_form_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> OrderFormOut:
    row = db.get(OrderForm, order_form_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order Form not found")
    return _order_form_out(row)


@router.patch(
    "/order-forms/{order_form_id}",
    response_model=OrderFormOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_order_form(
    order_form_id: str,
    payload: OrderFormPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> OrderFormOut:
    row = db.get(OrderForm, order_form_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order Form not found")

    data = payload.model_dump(exclude_unset=True)

    if "opportunity_id" in data:
        opportunity = db.get(Opportunity, payload.opportunity_id)
        if not opportunity or opportunity.business_unit_id != bu.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Opportunity not found")
        row.opportunity_id = opportunity.id
        row.account_id = opportunity.account_id

    if "name" in data:
        next_name = (payload.name or "").strip()
        if not next_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")
        row.name = next_name

    if "status" in data:
        row.status = _normalize_order_form_status(payload.status)

    if "effective_start_date" in data:
        row.effective_start_date = _parse_date_iso(payload.effective_start_date)
    if "effective_end_date" in data:
        row.effective_end_date = _parse_date_iso(payload.effective_end_date)
    if "total_amount" in data:
        row.total_amount = float(payload.total_amount or 0)
    if "currency" in data:
        currency = _normalize_currency(payload.currency)
        if len(currency) != 3 or not currency.isalpha():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="currency must be a 3-letter code")
        row.currency = currency
    if "signed_at" in data:
        row.signed_at = _parse_datetime_iso(payload.signed_at)
    if "contract_generated" in data:
        row.contract_generated = bool(payload.contract_generated)
    if "notes" in data:
        row.notes = (payload.notes or "").strip()

    if "owner_id" in data:
        next_owner_id = (data["owner_id"] or "").strip()
        if not next_owner_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="owner_id is required")
        u = db.get(User, next_owner_id)
        if not u:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid owner_id")
        row.owner_id = u.id
        row.owner_name = ((u.name or u.email or "").strip())

    if row.effective_start_date and row.effective_end_date and row.effective_end_date < row.effective_start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="effective_end_date must be >= effective_start_date")

    if row.status == "Signed" and row.signed_at is None:
        row.signed_at = dt.datetime.now(dt.timezone.utc)

    db.add(row)
    db.commit()
    db.refresh(row)
    return _order_form_out(row)


# -----------------------------
# CRM: Cotacao (CPQ)
# -----------------------------
@router.get("/quotes", response_model=list[QuoteOut])
async def list_quotes(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[QuoteOut]:
    rows = db.execute(select(Quote).where(Quote.business_unit_id == bu.id).order_by(Quote.created_at.desc())).scalars().all()
    return [_quote_out(r) for r in rows]


@router.post(
    "/quotes",
    response_model=QuoteOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_quote(
    payload: QuoteCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> QuoteOut:
    opportunity = db.get(Opportunity, payload.opportunity_id)
    if not opportunity or opportunity.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Opportunity not found")

    owner_id = (payload.owner_id or user.id).strip() if (payload.owner_id or user.id) else user.id
    owner_name = (user.name or user.email or "").strip() if owner_id == user.id else ""
    if owner_id != user.id:
        ou = db.execute(select(User).where(User.id == owner_id)).scalar_one_or_none()
        if not ou:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Owner not found")
        owner_name = (ou.name or ou.email or "").strip()

    total_amount = float(payload.total_amount or 0)
    discount_amount = float(payload.discount_amount or 0)
    final_amount = float(payload.final_amount) if payload.final_amount is not None else max(total_amount - discount_amount, 0)

    row = Quote(
        business_unit_id=bu.id,
        opportunity_id=opportunity.id,
        account_id=opportunity.account_id,
        name=(payload.name or "").strip(),
        status=_normalize_quote_status(payload.status),
        valid_until=_parse_date_iso(payload.valid_until),
        total_amount=total_amount,
        discount_amount=discount_amount,
        final_amount=final_amount,
        owner_id=owner_id,
        owner_name=owner_name,
    )

    if not row.name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")

    if row.final_amount < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="final_amount must be >= 0")

    db.add(row)
    db.flush()
    db.commit()
    return _quote_out(row)


@router.get("/quotes/{quote_id}", response_model=QuoteOut)
async def get_quote(
    quote_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> QuoteOut:
    row = db.get(Quote, quote_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return _quote_out(row)


@router.patch(
    "/quotes/{quote_id}",
    response_model=QuoteOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_quote(
    quote_id: str,
    payload: QuotePatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> QuoteOut:
    row = db.get(Quote, quote_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    data = payload.model_dump(exclude_unset=True)

    if "opportunity_id" in data:
        opportunity = db.get(Opportunity, payload.opportunity_id)
        if not opportunity or opportunity.business_unit_id != bu.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Opportunity not found")
        row.opportunity_id = opportunity.id
        row.account_id = opportunity.account_id

    if "name" in data:
        next_name = (payload.name or "").strip()
        if not next_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")
        row.name = next_name

    if "status" in data:
        row.status = _normalize_quote_status(payload.status)

    if "valid_until" in data:
        row.valid_until = _parse_date_iso(payload.valid_until)

    if "total_amount" in data:
        row.total_amount = float(payload.total_amount or 0)
    if "discount_amount" in data:
        row.discount_amount = float(payload.discount_amount or 0)
    if "final_amount" in data:
        row.final_amount = float(payload.final_amount or 0)
    elif "total_amount" in data or "discount_amount" in data:
        row.final_amount = max(float(row.total_amount or 0) - float(row.discount_amount or 0), 0)

    if "owner_id" in data:
        next_owner_id = (data["owner_id"] or "").strip()
        if not next_owner_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="owner_id is required")
        u = db.get(User, next_owner_id)
        if not u:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid owner_id")
        row.owner_id = u.id
        row.owner_name = ((u.name or u.email or "").strip())

    if row.final_amount < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="final_amount must be >= 0")

    has_items = (
        db.execute(
            select(QuoteItem.id)
            .where(
                QuoteItem.business_unit_id == bu.id,
                QuoteItem.quote_id == row.id,
            )
            .limit(1)
        ).scalar_one_or_none()
        is not None
    )
    if has_items:
        _recalculate_quote_totals(db, row)
    else:
        db.add(row)
    db.commit()
    db.refresh(row)
    return _quote_out(row)


@router.get("/quotes/{quote_id}/items", response_model=list[QuoteItemOut])
async def list_quote_items(
    quote_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[QuoteItemOut]:
    quote = db.get(Quote, quote_id)
    if not quote or quote.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    rows = (
        db.execute(
            select(QuoteItem)
            .where(
                QuoteItem.business_unit_id == bu.id,
                QuoteItem.quote_id == quote.id,
            )
            .order_by(QuoteItem.sort_order.asc(), QuoteItem.created_at.asc())
        )
        .scalars()
        .all()
    )

    product_ids = sorted({r.product_id for r in rows if r.product_id})
    product_names: dict[str, str] = {}
    if product_ids:
        p_rows = db.execute(
            select(Product.id, Product.name).where(
                Product.business_unit_id == bu.id,
                Product.id.in_(product_ids),
            )
        ).all()
        product_names = {pid: pname for pid, pname in p_rows}

    return [_quote_item_out(r, product_name=product_names.get(r.product_id or "")) for r in rows]


@router.post(
    "/quotes/{quote_id}/items",
    response_model=QuoteItemOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_quote_item(
    quote_id: str,
    payload: QuoteItemCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> QuoteItemOut:
    quote = db.get(Quote, quote_id)
    if not quote or quote.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    product: Product | None = None
    product_id = (payload.product_id or "").strip() or None
    if product_id:
        product = db.get(Product, product_id)
        if not product or product.business_unit_id != bu.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Product not found")

    quantity, unit_price, discount_percent, discount_amount, _, line_total = _normalize_quote_item_values(
        payload.quantity,
        payload.unit_price,
        payload.discount_percent,
        payload.discount_amount,
    )

    description = (payload.description or "").strip()
    if not description and product:
        description = product.name
    if not description:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="description is required")

    sort_order = payload.sort_order
    if sort_order is None:
        current_max_sort = (
            db.execute(
                select(func.max(QuoteItem.sort_order)).where(
                    QuoteItem.business_unit_id == bu.id,
                    QuoteItem.quote_id == quote.id,
                )
            ).scalar_one_or_none()
            or 0
        )
        sort_order = int(current_max_sort) + 1

    row = QuoteItem(
        business_unit_id=bu.id,
        quote_id=quote.id,
        product_id=product.id if product else None,
        description=description,
        quantity=quantity,
        unit_price=unit_price,
        discount_percent=discount_percent,
        discount_amount=discount_amount,
        line_total=line_total,
        sort_order=int(sort_order),
    )
    db.add(row)
    db.flush()
    _recalculate_quote_totals(db, quote)
    db.commit()
    return _quote_item_out(row, product_name=product.name if product else None)


@router.patch(
    "/quotes/{quote_id}/items/{item_id}",
    response_model=QuoteItemOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_quote_item(
    quote_id: str,
    item_id: str,
    payload: QuoteItemPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> QuoteItemOut:
    quote = db.get(Quote, quote_id)
    if not quote or quote.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    row = db.get(QuoteItem, item_id)
    if not row or row.business_unit_id != bu.id or row.quote_id != quote.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote item not found")

    data = payload.model_dump(exclude_unset=True)

    product_name: str | None = None
    if "product_id" in data:
        next_product_id = (data["product_id"] or "").strip()
        if next_product_id:
            product = db.get(Product, next_product_id)
            if not product or product.business_unit_id != bu.id:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Product not found")
            row.product_id = product.id
            product_name = product.name
        else:
            row.product_id = None

    if "description" in data:
        row.description = (payload.description or "").strip()
    if not row.description:
        if product_name:
            row.description = product_name
        elif row.product_id:
            p = db.get(Product, row.product_id)
            if p and p.business_unit_id == bu.id:
                row.description = p.name
                product_name = p.name
    if not row.description:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="description is required")

    quantity, unit_price, discount_percent, discount_amount, _, line_total = _normalize_quote_item_values(
        payload.quantity if "quantity" in data else float(row.quantity or 0),
        payload.unit_price if "unit_price" in data else float(row.unit_price or 0),
        payload.discount_percent if "discount_percent" in data else float(row.discount_percent or 0),
        payload.discount_amount if "discount_amount" in data else float(row.discount_amount or 0),
    )

    row.quantity = quantity
    row.unit_price = unit_price
    row.discount_percent = discount_percent
    row.discount_amount = discount_amount
    row.line_total = line_total

    if "sort_order" in data:
        row.sort_order = int(payload.sort_order or 0)

    db.add(row)
    _recalculate_quote_totals(db, quote)
    db.commit()

    if row.product_id and not product_name:
        p = db.get(Product, row.product_id)
        if p and p.business_unit_id == bu.id:
            product_name = p.name
    return _quote_item_out(row, product_name=product_name)


@router.delete(
    "/quotes/{quote_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_csrf)],
)
async def delete_quote_item(
    quote_id: str,
    item_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> Response:
    quote = db.get(Quote, quote_id)
    if not quote or quote.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    row = db.get(QuoteItem, item_id)
    if not row or row.business_unit_id != bu.id or row.quote_id != quote.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote item not found")

    db.delete(row)
    db.flush()
    _recalculate_quote_totals(db, quote)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/quotes/{quote_id}/convert-to-order-form",
    response_model=OrderFormOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def convert_quote_to_order_form(
    quote_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    user: User = Depends(get_current_user),
) -> OrderFormOut:
    quote = db.get(Quote, quote_id)
    if not quote or quote.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    opportunity = db.get(Opportunity, quote.opportunity_id)
    if not opportunity or opportunity.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Opportunity not found")

    owner_id = (quote.owner_id or user.id or "").strip() or user.id
    owner_name = (quote.owner_name or "").strip()
    if owner_id != user.id and not owner_name:
        ou = db.execute(select(User).where(User.id == owner_id)).scalar_one_or_none()
        owner_name = (ou.name or ou.email or "").strip() if ou else (user.name or user.email or "").strip()
    if owner_id == user.id and not owner_name:
        owner_name = (user.name or user.email or "").strip()

    notes = f"Gerado a partir da cotação {quote.id}."

    row = OrderForm(
        business_unit_id=bu.id,
        opportunity_id=opportunity.id,
        account_id=opportunity.account_id,
        name=(f"Order Form - {quote.name}".strip())[:200],
        status="Draft",
        effective_start_date=None,
        effective_end_date=quote.valid_until,
        total_amount=float(quote.final_amount or 0),
        currency="BRL",
        signed_at=None,
        contract_generated=False,
        owner_id=owner_id,
        owner_name=owner_name,
        notes=notes,
    )

    db.add(row)
    db.flush()
    db.commit()
    return _order_form_out(row)


def _product_out(row: Product) -> ProductOut:
    return ProductOut(
        id=row.id,
        name=row.name,
        product_code=row.product_code,
        description=row.description,
        is_active=bool(row.is_active),
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


def _price_list_out(row: PriceList) -> PriceListOut:
    return PriceListOut(
        id=row.id,
        name=row.name,
        is_active=bool(row.is_active),
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


def _price_list_item_out(row: PriceListItem, product_name: str | None = None) -> PriceListItemOut:
    return PriceListItemOut(
        id=row.id,
        price_list_id=row.price_list_id,
        product_id=row.product_id,
        product_name=product_name,
        unit_price=float(row.unit_price or 0),
        currency=row.currency,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


def _product_price_list_out(row: ProductPriceList, product_name: str | None = None) -> ProductPriceListOut:
    return ProductPriceListOut(
        id=row.id,
        product_id=row.product_id,
        product_name=product_name,
        name=row.name,
        unit_price=float(row.unit_price or 0),
        currency=row.currency,
        is_active=bool(row.is_active),
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


def _order_form_template_out(row: OrderFormTemplate) -> OrderFormTemplateOut:
    return OrderFormTemplateOut(
        id=row.id,
        template_name=row.template_name,
        file_name_pattern=row.file_name_pattern,
        locale=row.locale,
        paper_size=row.paper_size,
        orientation=row.orientation,
        primary_color=row.primary_color,
        include_signature_block=bool(row.include_signature_block),
        header_text=row.header_text or "",
        footer_text=row.footer_text or "",
        body_template=row.body_template or "",
        terms_template=row.terms_template or "",
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
    )


def _ensure_order_form_template(db: Session, bu_id: str) -> OrderFormTemplate:
    row = (
        db.execute(select(OrderFormTemplate).where(OrderFormTemplate.business_unit_id == bu_id))
        .scalars()
        .first()
    )
    if row:
        return row

    row = OrderFormTemplate(
        business_unit_id=bu_id,
        template_name="Template padrao",
        file_name_pattern="order-form-{opportunity_id}",
        locale="pt-BR",
        paper_size="A4",
        orientation="portrait",
        primary_color="#166534",
        include_signature_block=True,
        header_text="",
        footer_text="",
        body_template="",
        terms_template="",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# -----------------------------
# CRM: Produtos (Catálogo)
# -----------------------------
@router.get("/products", response_model=list[ProductOut])
async def list_products(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[ProductOut]:
    stmt = select(Product).where(Product.business_unit_id == bu.id)
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))

    rows = db.execute(stmt.order_by(Product.created_at.desc())).scalars().all()
    return [_product_out(r) for r in rows]


@router.post(
    "/products",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> ProductOut:
    name = _normalize_product_name(payload.name)
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")

    product_code = _normalize_product_code(payload.product_code)
    description = (payload.description or "").strip()

    existing = (
        db.execute(
            select(Product).where(
                Product.business_unit_id == bu.id,
                func.lower(Product.name) == name.lower(),
            )
        )
        .scalars()
        .first()
    )
    if existing:
        existing.name = name
        existing.product_code = product_code
        existing.description = description
        existing.is_active = bool(payload.is_active)
        db.add(existing)
        db.commit()
        return _product_out(existing)

    row = Product(
        business_unit_id=bu.id,
        name=name,
        product_code=product_code,
        description=description,
        is_active=bool(payload.is_active),
    )
    db.add(row)
    db.commit()
    return _product_out(row)


@router.patch(
    "/products/{product_id}",
    response_model=ProductOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_product(
    product_id: str,
    payload: ProductPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> ProductOut:
    row = db.get(Product, product_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    data = payload.model_dump(exclude_unset=True)

    if "name" in data:
        next_name = _normalize_product_name(payload.name)
        if not next_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")
        conflict = (
            db.execute(
                select(Product).where(
                    Product.business_unit_id == bu.id,
                    Product.id != row.id,
                    func.lower(Product.name) == next_name.lower(),
                )
            )
            .scalars()
            .first()
        )
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product already exists")
        row.name = next_name

    if "product_code" in data:
        row.product_code = _normalize_product_code(payload.product_code)
    if "description" in data:
        row.description = (payload.description or "").strip()
    if "is_active" in data:
        row.is_active = bool(data["is_active"])

    db.add(row)
    db.commit()
    return _product_out(row)


# -----------------------------
# CRM: Listas de Preços (pai)
# -----------------------------
@router.get("/price-lists", response_model=list[PriceListOut])
async def list_price_lists(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[PriceListOut]:
    stmt = select(PriceList).where(PriceList.business_unit_id == bu.id)
    if not include_inactive:
        stmt = stmt.where(PriceList.is_active.is_(True))

    rows = db.execute(stmt.order_by(PriceList.created_at.desc())).scalars().all()
    return [_price_list_out(r) for r in rows]


@router.post(
    "/price-lists",
    response_model=PriceListOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_price_list(
    payload: PriceListCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> PriceListOut:
    name = _normalize_price_list_name(payload.name)
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")

    existing = (
        db.execute(
            select(PriceList).where(
                PriceList.business_unit_id == bu.id,
                func.lower(PriceList.name) == name.lower(),
            )
        )
        .scalars()
        .first()
    )
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Price list already exists")
        existing.name = name
        existing.is_active = bool(payload.is_active)
        db.add(existing)
        db.commit()
        return _price_list_out(existing)

    row = PriceList(
        business_unit_id=bu.id,
        name=name,
        is_active=bool(payload.is_active),
    )
    db.add(row)
    db.commit()
    return _price_list_out(row)


@router.patch(
    "/price-lists/{price_list_id}",
    response_model=PriceListOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_price_list(
    price_list_id: str,
    payload: PriceListPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> PriceListOut:
    row = db.get(PriceList, price_list_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price list not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        next_name = _normalize_price_list_name(payload.name)
        if not next_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")
        conflict = (
            db.execute(
                select(PriceList).where(
                    PriceList.business_unit_id == bu.id,
                    PriceList.id != row.id,
                    func.lower(PriceList.name) == next_name.lower(),
                )
            )
            .scalars()
            .first()
        )
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Price list already exists")
        row.name = next_name

    if "is_active" in data:
        row.is_active = bool(data["is_active"])

    db.add(row)
    db.commit()
    return _price_list_out(row)


# -----------------------------
# CRM: Listas de Preços > Produtos (filho)
# -----------------------------
@router.get("/price-lists/{price_list_id}/items", response_model=list[PriceListItemOut])
async def list_price_list_items(
    price_list_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[PriceListItemOut]:
    price_list = db.get(PriceList, price_list_id)
    if not price_list or price_list.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price list not found")

    rows = (
        db.execute(
            select(PriceListItem)
            .where(
                PriceListItem.business_unit_id == bu.id,
                PriceListItem.price_list_id == price_list.id,
            )
            .order_by(PriceListItem.created_at.asc())
        )
        .scalars()
        .all()
    )

    product_names: dict[str, str] = {}
    product_ids = sorted({r.product_id for r in rows})
    if product_ids:
        p_rows = db.execute(
            select(Product.id, Product.name).where(
                Product.business_unit_id == bu.id,
                Product.id.in_(product_ids),
            )
        ).all()
        product_names = {pid: pname for pid, pname in p_rows}

    return [_price_list_item_out(r, product_name=product_names.get(r.product_id)) for r in rows]


@router.post(
    "/price-lists/{price_list_id}/items",
    response_model=PriceListItemOut,
    dependencies=[Depends(require_csrf)],
)
async def upsert_price_list_item(
    price_list_id: str,
    payload: PriceListItemUpsert,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> PriceListItemOut:
    price_list = db.get(PriceList, price_list_id)
    if not price_list or price_list.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price list not found")

    product = db.get(Product, payload.product_id)
    if not product or product.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Product not found")

    currency = _normalize_currency(payload.currency)
    if len(currency) != 3 or not currency.isalpha():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="currency must be a 3-letter code")

    row = (
        db.execute(
            select(PriceListItem).where(
                PriceListItem.business_unit_id == bu.id,
                PriceListItem.price_list_id == price_list.id,
                PriceListItem.product_id == product.id,
            )
        )
        .scalars()
        .first()
    )

    if row is None:
        row = PriceListItem(
            business_unit_id=bu.id,
            price_list_id=price_list.id,
            product_id=product.id,
            unit_price=float(payload.unit_price or 0),
            currency=currency,
        )
    else:
        row.unit_price = float(payload.unit_price or 0)
        row.currency = currency

    db.add(row)
    db.commit()
    return _price_list_item_out(row, product_name=product.name)


# -----------------------------
# CRM: Produto > Listas de Preços (filho 1:N)
# -----------------------------
@router.get("/product-price-lists", response_model=list[ProductPriceListOut])
async def list_product_price_lists(
    product_id: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> list[ProductPriceListOut]:
    selected_product_id = (product_id or "").strip() or None
    if selected_product_id:
        product = db.get(Product, selected_product_id)
        if not product or product.business_unit_id != bu.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    stmt = select(ProductPriceList).where(ProductPriceList.business_unit_id == bu.id)
    if selected_product_id:
        stmt = stmt.where(ProductPriceList.product_id == selected_product_id)
    if not include_inactive:
        stmt = stmt.where(ProductPriceList.is_active.is_(True))

    rows = db.execute(
        stmt.order_by(
            ProductPriceList.product_id.asc(),
            ProductPriceList.created_at.desc(),
        )
    ).scalars().all()

    product_names: dict[str, str] = {}
    product_ids = sorted({r.product_id for r in rows})
    if product_ids:
        p_rows = db.execute(
            select(Product.id, Product.name).where(
                Product.business_unit_id == bu.id,
                Product.id.in_(product_ids),
            )
        ).all()
        product_names = {pid: pname for pid, pname in p_rows}

    return [_product_price_list_out(r, product_name=product_names.get(r.product_id)) for r in rows]


@router.post(
    "/product-price-lists",
    response_model=ProductPriceListOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_product_price_list(
    payload: ProductPriceListCreate,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> ProductPriceListOut:
    product = db.get(Product, payload.product_id)
    if not product or product.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Product not found")

    name = _normalize_price_list_name(payload.name)
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")

    currency = _normalize_currency(payload.currency)
    if len(currency) != 3 or not currency.isalpha():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="currency must be a 3-letter code")

    existing = (
        db.execute(
            select(ProductPriceList).where(
                ProductPriceList.business_unit_id == bu.id,
                ProductPriceList.product_id == product.id,
                func.lower(ProductPriceList.name) == name.lower(),
            )
        )
        .scalars()
        .first()
    )
    if existing:
        existing.name = name
        existing.unit_price = float(payload.unit_price or 0)
        existing.currency = currency
        existing.is_active = bool(payload.is_active)
        db.add(existing)
        db.commit()
        return _product_price_list_out(existing, product_name=product.name)

    row = ProductPriceList(
        business_unit_id=bu.id,
        product_id=product.id,
        name=name,
        unit_price=float(payload.unit_price or 0),
        currency=currency,
        is_active=bool(payload.is_active),
    )
    db.add(row)
    db.commit()
    return _product_price_list_out(row, product_name=product.name)


@router.patch(
    "/product-price-lists/{price_list_id}",
    response_model=ProductPriceListOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_product_price_list(
    price_list_id: str,
    payload: ProductPriceListPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> ProductPriceListOut:
    row = db.get(ProductPriceList, price_list_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price list not found")

    data = payload.model_dump(exclude_unset=True)

    next_product_id = row.product_id
    if "product_id" in data:
        next_product = db.get(Product, payload.product_id)
        if not next_product or next_product.business_unit_id != bu.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Product not found")
        next_product_id = next_product.id

    next_name = row.name
    if "name" in data:
        next_name = _normalize_price_list_name(payload.name)
        if not next_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")

    if "product_id" in data or "name" in data:
        conflict = (
            db.execute(
                select(ProductPriceList).where(
                    ProductPriceList.business_unit_id == bu.id,
                    ProductPriceList.id != row.id,
                    ProductPriceList.product_id == next_product_id,
                    func.lower(ProductPriceList.name) == next_name.lower(),
                )
            )
            .scalars()
            .first()
        )
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Price list already exists for this product")

    if "product_id" in data:
        row.product_id = next_product_id
    if "name" in data:
        row.name = next_name
    if "unit_price" in data:
        row.unit_price = float(payload.unit_price or 0)
    if "currency" in data:
        currency = _normalize_currency(payload.currency)
        if len(currency) != 3 or not currency.isalpha():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="currency must be a 3-letter code")
        row.currency = currency
    if "is_active" in data:
        row.is_active = bool(data["is_active"])

    db.add(row)
    db.commit()

    product_name = db.execute(
        select(Product.name).where(
            Product.business_unit_id == bu.id,
            Product.id == row.product_id,
        )
    ).scalar_one_or_none()
    return _product_price_list_out(row, product_name=product_name)


@router.get("/order-form-template", response_model=OrderFormTemplateOut)
async def get_order_form_template(
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> OrderFormTemplateOut:
    row = _ensure_order_form_template(db, bu.id)
    return _order_form_template_out(row)


@router.patch(
    "/order-form-template",
    response_model=OrderFormTemplateOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_order_form_template(
    payload: OrderFormTemplatePatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> OrderFormTemplateOut:
    row = _ensure_order_form_template(db, bu.id)
    data = payload.model_dump(exclude_unset=True)

    if "template_name" in data:
        next_name = (payload.template_name or "").strip()
        if not next_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="template_name is required")
        row.template_name = next_name

    if "file_name_pattern" in data:
        next_pattern = (payload.file_name_pattern or "").strip()
        if not next_pattern:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="file_name_pattern is required")
        row.file_name_pattern = next_pattern

    if "locale" in data:
        next_locale = (payload.locale or "").strip()
        if not next_locale:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="locale is required")
        row.locale = next_locale

    if "paper_size" in data:
        row.paper_size = str(payload.paper_size or "A4")
    if "orientation" in data:
        row.orientation = str(payload.orientation or "portrait")
    if "primary_color" in data:
        row.primary_color = _normalize_primary_color(payload.primary_color)
    if "include_signature_block" in data:
        row.include_signature_block = bool(payload.include_signature_block)
    if "header_text" in data:
        row.header_text = (payload.header_text or "").strip()
    if "footer_text" in data:
        row.footer_text = (payload.footer_text or "").strip()
    if "body_template" in data:
        row.body_template = payload.body_template or ""
    if "terms_template" in data:
        row.terms_template = payload.terms_template or ""

    db.add(row)
    db.commit()
    db.refresh(row)
    return _order_form_template_out(row)


@router.get("/opportunities/{opportunity_id}", response_model=OpportunityOut)
async def get_opportunity(
    opportunity_id: str,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> OpportunityOut:
    row = db.get(Opportunity, opportunity_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found")

    return OpportunityOut(
        id=row.id,
        account_id=row.account_id,
        name=row.name,
        stage=row.stage,
        amount=float(row.amount or 0),
        close_date=row.close_date.isoformat() if row.close_date else None,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "opportunity", row.id),
    )


@router.patch(
    "/opportunities/{opportunity_id}",
    response_model=OpportunityOut,
    dependencies=[Depends(require_csrf)],
)
async def patch_opportunity(
    opportunity_id: str,
    payload: OpportunityPatch,
    db: Session = Depends(get_tenant_db),
    bu: BusinessUnit = Depends(get_active_bu),
    _: User = Depends(get_current_user),
) -> OpportunityOut:
    if _ensure_fixed_opportunity_stages(db, bu.id):
        db.commit()

    row = db.get(Opportunity, opportunity_id)
    if not row or row.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found")

    if payload.account_id is not None:
        next_account_id = (payload.account_id or "").strip()
        if next_account_id:
            account = db.get(Account, next_account_id)
            if not account or account.business_unit_id != bu.id:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Account not found")
            row.account_id = next_account_id
        else:
            row.account_id = None
    if payload.name is not None:
        row.name = payload.name
    if payload.stage is not None:
        row.stage = _resolve_opportunity_stage_value(
            db,
            bu.id,
            payload.stage,
            allow_existing_value=row.stage,
        )
    if payload.amount is not None:
        row.amount = float(payload.amount)
    if payload.close_date is not None:
        row.close_date = _parse_date_iso(payload.close_date)

    data = payload.model_dump(exclude_unset=True)
    if "owner_id" in data:
        next_owner_id = (data["owner_id"] or "").strip()
        if not next_owner_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="owner_id is required")
        u = db.get(User, next_owner_id)
        if not u:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid owner_id")
        row.owner_id = u.id
        row.owner_name = ((u.name or u.email or "").strip())

    if payload.custom_fields is not None:
        merged = _apply_defaults_and_validate_required(db, bu.id, "opportunity", payload.custom_fields, existing_entity_id=row.id)
        _upsert_custom_fields(db, bu.id, "opportunity", row.id, merged)

    db.add(row)
    db.commit()

    return OpportunityOut(
        id=row.id,
        account_id=row.account_id,
        name=row.name,
        stage=row.stage,
        amount=float(row.amount or 0),
        close_date=row.close_date.isoformat() if row.close_date else None,
        owner_id=row.owner_id,
        owner_name=row.owner_name,
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        custom_fields=_read_custom_fields(db, bu.id, "opportunity", row.id),
    )
