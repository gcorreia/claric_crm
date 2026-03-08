# api/app/apps/crm/schemas.py

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

EntityType = Literal["account", "lead", "contact", "opportunity"]
ActivityWhoType = Literal["lead", "contact"]
ActivityType = Literal["task", "event", "call", "email"]


def _is_slug(s: str) -> bool:
    import re

    return bool(re.fullmatch(r"[a-z][a-z0-9_]{1,63}", s))


def _normalize_options(v: dict[str, Any] | list[Any] | None) -> dict[str, Any]:
    if v is None:
        return {}

    if isinstance(v, list):
        values = [str(x).strip() for x in v if str(x).strip()]
        return {"values": values}

    if isinstance(v, dict):
        if "values" in v and isinstance(v["values"], list):
            values = [str(x).strip() for x in v["values"] if str(x).strip()]
            return {"values": values}

        if "value" in v:
            value = v.get("value", None)
            if value is None:
                return {}
            return {"value": value}

        return v

    return {}


class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=60)

    # ✅ opcional (UI pode mandar, create_account pode ignorar e usar user.id)
    owner_id: str | None = None

    # ✅ usado em router.py (create_account)
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class AccountPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=60)
    owner_id: str | None = None
    custom_fields: dict[str, Any] | None = None


class AccountOut(BaseModel):
    id: str
    name: str

    owner_id: str | None = None
    owner_name: str | None = None

    created_at: str | None = None
    updated_at: str | None = None

    # ✅ defaults evitam ValidationError quando o router não inclui as chaves
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    notes: str | None = None

    custom_fields: dict[str, Any] = Field(default_factory=dict)


class LeadCreate(BaseModel):
    account_id: str = Field(..., min_length=1, max_length=18)
    name: str = Field(..., min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=60)
    status: str | None = Field(default=None, max_length=60)
    source: str | None = Field(default=None, max_length=60)
    score: int | None = None

    owner_id: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class LeadPatch(BaseModel):
    account_id: str | None = Field(default=None, min_length=1, max_length=18)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=60)
    status: str | None = Field(default=None, max_length=60)
    source: str | None = Field(default=None, max_length=60)
    score: int | None = None
    owner_id: str | None = None
    custom_fields: dict[str, Any] | None = None


class LeadOut(BaseModel):
    id: str
    account_id: str
    name: str
    email: str | None = None
    phone: str | None = None
    status: str | None = None
    source: str | None = None
    score: int | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class ContactCreate(BaseModel):
    account_id: str = Field(..., min_length=1, max_length=18)
    name: str = Field(..., min_length=1, max_length=200)
    contact_role: str = Field(..., min_length=1, max_length=60)
    owner_id: str | None = None

    custom_fields: dict[str, Any] = Field(default_factory=dict)


class ContactPatch(BaseModel):
    account_id: str | None = Field(default=None, min_length=1, max_length=18)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    external_id: str | None = Field(default=None, min_length=1, max_length=32)
    contact_role: str | None = Field(default=None, min_length=1, max_length=60)
    owner_id: str | None = None

    custom_fields: dict[str, Any] | None = None


class ContactOut(BaseModel):
    id: str
    account_id: str
    name: str
    external_id: str
    contact_role: str
    owner_id: str | None = None
    owner_name: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class ContactRoleCreate(BaseModel):
    value: str = Field(..., min_length=1, max_length=60)
    sort_order: int | None = Field(default=None, ge=0)


class ContactRolePatch(BaseModel):
    value: str | None = Field(default=None, min_length=1, max_length=60)
    sort_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ContactRoleOut(BaseModel):
    id: str
    value: str
    sort_order: int
    is_active: bool
    created_at: str | None = None
    updated_at: str | None = None


class OpportunityStageCreate(BaseModel):
    value: str = Field(..., min_length=1, max_length=60)
    sort_order: int | None = Field(default=None, ge=0)


class OpportunityStagePatch(BaseModel):
    value: str | None = Field(default=None, min_length=1, max_length=60)
    sort_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class OpportunityStageDelete(BaseModel):
    replacement_stage_id: str | None = Field(default=None, min_length=1, max_length=18)


class OpportunityStageOut(BaseModel):
    id: str
    value: str
    sort_order: int
    is_active: bool
    probability_percent: int | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    product_code: str | None = Field(default=None, max_length=60)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool = True


class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    product_code: str | None = Field(default=None, max_length=60)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None


class ProductOut(BaseModel):
    id: str
    name: str
    product_code: str | None = None
    description: str | None = None
    is_active: bool
    created_at: str | None = None
    updated_at: str | None = None


class PriceListCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    is_active: bool = True


class PriceListPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    is_active: bool | None = None


class PriceListOut(BaseModel):
    id: str
    name: str
    is_active: bool
    created_at: str | None = None
    updated_at: str | None = None


class PriceListItemUpsert(BaseModel):
    product_id: str = Field(..., min_length=1, max_length=18)
    unit_price: float | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)


class PriceListItemOut(BaseModel):
    id: str
    price_list_id: str
    product_id: str
    product_name: str | None = None
    unit_price: float
    currency: str
    created_at: str | None = None
    updated_at: str | None = None


class OrderFormTemplatePatch(BaseModel):
    template_name: str | None = Field(default=None, min_length=1, max_length=120)
    file_name_pattern: str | None = Field(default=None, min_length=1, max_length=200)
    locale: str | None = Field(default=None, min_length=2, max_length=16)
    paper_size: Literal["A4", "LETTER"] | None = None
    orientation: Literal["portrait", "landscape"] | None = None
    primary_color: str | None = Field(default=None, min_length=4, max_length=20)
    include_signature_block: bool | None = None
    header_text: str | None = Field(default=None, max_length=500)
    footer_text: str | None = Field(default=None, max_length=500)
    body_template: str | None = Field(default=None, max_length=30000)
    terms_template: str | None = Field(default=None, max_length=30000)


class OrderFormTemplateOut(BaseModel):
    id: str
    template_name: str
    file_name_pattern: str
    locale: str
    paper_size: str
    orientation: str
    primary_color: str
    include_signature_block: bool
    header_text: str
    footer_text: str
    body_template: str
    terms_template: str
    created_at: str | None = None
    updated_at: str | None = None


class ProductPriceListCreate(BaseModel):
    product_id: str = Field(..., min_length=1, max_length=18)
    name: str = Field(..., min_length=1, max_length=120)
    unit_price: float | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    is_active: bool = True


class ProductPriceListPatch(BaseModel):
    product_id: str | None = Field(default=None, min_length=1, max_length=18)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    unit_price: float | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    is_active: bool | None = None


class ProductPriceListOut(BaseModel):
    id: str
    product_id: str
    product_name: str | None = None
    name: str
    unit_price: float
    currency: str
    is_active: bool
    created_at: str | None = None
    updated_at: str | None = None


class OpportunityCreate(BaseModel):
    account_id: str | None = Field(default=None, min_length=1, max_length=18)
    name: str = Field(..., min_length=1, max_length=120)
    amount: float | None = None
    stage: str | None = Field(default=None, max_length=60)
    close_date: str | None = None
    owner_id: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class OpportunityPatch(BaseModel):
    account_id: str | None = Field(default=None, min_length=1, max_length=18)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    amount: float | None = None
    stage: str | None = Field(default=None, max_length=60)
    close_date: str | None = None
    owner_id: str | None = None
    custom_fields: dict[str, Any] | None = None


class OpportunityOut(BaseModel):
    id: str
    account_id: str | None = None
    name: str
    amount: float | None = None
    stage: str | None = None
    close_date: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class ActivityParticipantOut(BaseModel):
    contact_id: str
    contact_name: str | None = None


class ActivityCreate(BaseModel):
    type: ActivityType | None = "task"
    subject: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20000)
    status: str | None = Field(default=None, max_length=30)
    priority: str | None = Field(default=None, max_length=20)
    due_date: str | None = None
    start_at: str | None = None
    end_at: str | None = None
    completed_at: str | None = None
    what_type: EntityType | None = None
    what_id: str | None = Field(default=None, min_length=1, max_length=18)
    who_type: ActivityWhoType | None = None
    who_id: str | None = Field(default=None, min_length=1, max_length=18)
    owner_id: str | None = Field(default=None, min_length=1, max_length=18)
    participant_contact_ids: list[str] = Field(default_factory=list)


class ActivityPatch(BaseModel):
    type: ActivityType | None = None
    subject: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20000)
    status: str | None = Field(default=None, max_length=30)
    priority: str | None = Field(default=None, max_length=20)
    due_date: str | None = None
    start_at: str | None = None
    end_at: str | None = None
    completed_at: str | None = None
    what_type: EntityType | None = None
    what_id: str | None = Field(default=None, min_length=1, max_length=18)
    who_type: ActivityWhoType | None = None
    who_id: str | None = Field(default=None, min_length=1, max_length=18)
    owner_id: str | None = Field(default=None, min_length=1, max_length=18)
    participant_contact_ids: list[str] | None = None


class ActivityComplete(BaseModel):
    completed_at: str | None = None


class ActivityOut(BaseModel):
    id: str
    type: str
    subject: str
    description: str = ""
    status: str
    priority: str
    due_date: str | None = None
    start_at: str | None = None
    end_at: str | None = None
    completed_at: str | None = None
    what_type: EntityType | None = None
    what_id: str | None = None
    who_type: ActivityWhoType | None = None
    who_id: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    participants: list[ActivityParticipantOut] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


class OrderFormCreate(BaseModel):
    opportunity_id: str = Field(..., min_length=1, max_length=18)
    name: str = Field(..., min_length=1, max_length=200)
    status: str | None = Field(default=None, max_length=40)
    effective_start_date: str | None = None
    effective_end_date: str | None = None
    total_amount: float | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    signed_at: str | None = None
    contract_generated: bool | None = None
    owner_id: str | None = None
    notes: str | None = Field(default=None, max_length=20000)


class OrderFormPatch(BaseModel):
    opportunity_id: str | None = Field(default=None, min_length=1, max_length=18)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: str | None = Field(default=None, max_length=40)
    effective_start_date: str | None = None
    effective_end_date: str | None = None
    total_amount: float | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    signed_at: str | None = None
    contract_generated: bool | None = None
    owner_id: str | None = None
    notes: str | None = Field(default=None, max_length=20000)


class OrderFormOut(BaseModel):
    id: str
    opportunity_id: str
    account_id: str | None = None
    name: str
    status: str
    effective_start_date: str | None = None
    effective_end_date: str | None = None
    total_amount: float
    currency: str
    signed_at: str | None = None
    contract_generated: bool
    owner_id: str | None = None
    owner_name: str | None = None
    notes: str = ""
    created_at: str | None = None
    updated_at: str | None = None


class QuoteCreate(BaseModel):
    opportunity_id: str = Field(..., min_length=1, max_length=18)
    name: str = Field(..., min_length=1, max_length=200)
    status: str | None = Field(default=None, max_length=40)
    valid_until: str | None = None
    total_amount: float | None = None
    discount_amount: float | None = None
    final_amount: float | None = None
    owner_id: str | None = None


class QuotePatch(BaseModel):
    opportunity_id: str | None = Field(default=None, min_length=1, max_length=18)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: str | None = Field(default=None, max_length=40)
    valid_until: str | None = None
    total_amount: float | None = None
    discount_amount: float | None = None
    final_amount: float | None = None
    owner_id: str | None = None


class QuoteOut(BaseModel):
    id: str
    opportunity_id: str
    account_id: str | None = None
    name: str
    status: str
    valid_until: str | None = None
    total_amount: float
    discount_amount: float
    final_amount: float
    owner_id: str | None = None
    owner_name: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class QuoteItemCreate(BaseModel):
    product_id: str | None = Field(default=None, min_length=1, max_length=18)
    description: str | None = Field(default=None, max_length=20000)
    quantity: float | None = None
    unit_price: float | None = None
    discount_percent: float | None = None
    discount_amount: float | None = None
    sort_order: int | None = None


class QuoteItemPatch(BaseModel):
    product_id: str | None = Field(default=None, min_length=1, max_length=18)
    description: str | None = Field(default=None, max_length=20000)
    quantity: float | None = None
    unit_price: float | None = None
    discount_percent: float | None = None
    discount_amount: float | None = None
    sort_order: int | None = None


class QuoteItemOut(BaseModel):
    id: str
    quote_id: str
    product_id: str | None = None
    product_name: str | None = None
    description: str = ""
    quantity: float
    unit_price: float
    discount_percent: float
    discount_amount: float
    line_total: float
    sort_order: int
    created_at: str | None = None
    updated_at: str | None = None


class CustomObjectCreate(BaseModel):
    key: str = Field(min_length=2, max_length=64)
    label: str = Field(min_length=1, max_length=120)
    plural_label: str = Field(min_length=1, max_length=120)
    parent_entity_type: EntityType | None = None
    is_active: bool = True

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        if not _is_slug(v):
            raise ValueError("Invalid key. Use snake_case and start with a letter.")
        return v


class CustomObjectPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    plural_label: str | None = Field(default=None, min_length=1, max_length=120)
    parent_entity_type: EntityType | None = None
    is_active: bool | None = None


class CustomObjectDefinitionOut(BaseModel):
    id: str
    key: str
    label: str
    plural_label: str
    parent_entity_type: EntityType | None
    is_active: bool
    created_at: str
    updated_at: str


class CustomFieldSessionCreate(BaseModel):
    key: str = Field(min_length=2, max_length=64)
    label: str = Field(min_length=1, max_length=120)
    sort_order: int | None = None
    layout_columns: int = Field(default=2, ge=2, le=3)
    entity_type: EntityType | None = None
    custom_object_id: str | None = None

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        if not _is_slug(v):
            raise ValueError("Invalid key. Use snake_case and start with a letter.")
        return v


class CustomFieldSessionPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    sort_order: int | None = None
    layout_columns: int | None = Field(default=None, ge=2, le=3)
    expected_version: int | None = Field(default=None, ge=1)


class CustomFieldSessionOut(BaseModel):
    id: str
    entity_type: EntityType | None
    custom_object_id: str | None
    key: str
    label: str
    sort_order: int
    layout_columns: int
    fields_count: int = 0
    version: int = 1


class CustomFieldCreate(BaseModel):
    session_id: str
    key: str = Field(min_length=2, max_length=64)
    label: str = Field(min_length=1, max_length=120)
    sort_order: int | None = None
    type: str = Field(min_length=2, max_length=32)
    required: bool = False
    is_active: bool = True
    entity_type: EntityType | None = None
    custom_object_id: str | None = None
    options: dict[str, Any] | list[Any] | None = None
    validations: dict[str, Any] | None = None
    default_value: dict[str, Any] | None = None

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        if not _is_slug(v):
            raise ValueError("Invalid key. Use snake_case and start with a letter.")
        return v

    @field_validator("options")
    @classmethod
    def normalize_options(cls, v: dict[str, Any] | list[Any] | None) -> dict[str, Any] | None:
        if v is None:
            return None
        return _normalize_options(v)


class CustomFieldPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    sort_order: int | None = None
    required: bool | None = None
    is_active: bool | None = None
    session_id: str | None = None
    options: dict[str, Any] | list[Any] | None = None
    validations: dict[str, Any] | None = None
    default_value: dict[str, Any] | None = None
    expected_version: int | None = Field(default=None, ge=1)

    @field_validator("options")
    @classmethod
    def normalize_options(cls, v: dict[str, Any] | list[Any] | None) -> dict[str, Any] | None:
        if v is None:
            return None
        return _normalize_options(v)


class CustomFieldDefinitionOut(BaseModel):
    id: str
    session_id: str
    sort_order: int
    version: int = 1
    entity_type: EntityType | None
    custom_object_id: str | None
    key: str
    label: str
    type: str
    required: bool
    is_active: bool
    options: dict[str, Any] = Field(default_factory=dict)
    validations: dict[str, Any] = Field(default_factory=dict)
    default_value: dict[str, Any] = Field(default_factory=dict)


class CustomFieldSessionReorder(BaseModel):
    session_ids: list[str]
    expected_versions: dict[str, int] = Field(default_factory=dict)


class CustomFieldReorder(BaseModel):
    field_ids: list[str]
    expected_versions: dict[str, int] = Field(default_factory=dict)


class CustomFieldMove(BaseModel):
    target_session_id: str
    target_index: int = Field(default=0, ge=0)
    expected_field_version: int = Field(ge=1)
    expected_source_session_version: int = Field(ge=1)
    expected_target_session_version: int = Field(ge=1)


ReportTypeKey = Literal["account", "contact", "lead", "opportunity"]
ReportFolderKey = Literal["public", "private"]
DashboardFolderKey = Literal["public", "private"]
ReportFieldDataType = Literal["text", "number", "boolean", "date", "datetime", "json"]
ReportFilterOperator = Literal[
    "eq",
    "neq",
    "contains",
    "starts_with",
    "in",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "is_empty",
    "is_not_empty",
]
ReportSortDirection = Literal["asc", "desc"]
ReportAggregateFn = Literal["count", "sum", "avg", "min", "max"]


class ReportFieldOut(BaseModel):
    key: str
    label: str
    data_type: ReportFieldDataType
    source: Literal["core", "custom"] = "core"
    filterable: bool = True
    sortable: bool = True
    aggregatable: bool = False


class ReportTypeOut(BaseModel):
    key: ReportTypeKey
    label: str
    entity_type: EntityType
    fields: list[ReportFieldOut] = Field(default_factory=list)


class ReportFilterIn(BaseModel):
    field: str = Field(min_length=1, max_length=120)
    op: ReportFilterOperator
    value: Any | None = None
    value_to: Any | None = None


class ReportSortIn(BaseModel):
    field: str = Field(min_length=1, max_length=120)
    direction: ReportSortDirection = "asc"


class ReportAggregateIn(BaseModel):
    fn: ReportAggregateFn = "count"
    field: str | None = Field(default=None, max_length=120)
    alias: str | None = Field(default=None, max_length=120)


class ReportConfigIn(BaseModel):
    columns: list[str] = Field(default_factory=list)
    filters: list[ReportFilterIn] = Field(default_factory=list)
    group_by: list[str] = Field(default_factory=list)
    sorts: list[ReportSortIn] = Field(default_factory=list)
    aggregate: ReportAggregateIn | None = None
    limit: int = Field(default=200, ge=1, le=5000)


class ReportDefinitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    report_type: ReportTypeKey
    folder: ReportFolderKey = "private"
    description: str | None = Field(default=None, max_length=2000)
    config: ReportConfigIn = Field(default_factory=ReportConfigIn)


class ReportDefinitionPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    report_type: ReportTypeKey | None = None
    folder: ReportFolderKey | None = None
    description: str | None = Field(default=None, max_length=2000)
    config: ReportConfigIn | None = None


class ReportDefinitionOut(BaseModel):
    id: str
    name: str
    report_type: ReportTypeKey
    folder: ReportFolderKey = "private"
    description: str = ""
    config: ReportConfigIn = Field(default_factory=ReportConfigIn)
    owner_id: str | None = None
    owner_name: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ReportPreviewIn(BaseModel):
    report_type: ReportTypeKey
    config: ReportConfigIn = Field(default_factory=ReportConfigIn)


class ReportRunOut(BaseModel):
    columns: list[str] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    total_rows: int = 0
    truncated: bool = False


DashboardWidgetType = Literal["kpi", "table", "bar", "line", "donut", "funnel", "gauge", "grouped_bar", "grouped_column", "grouped_donut", "grouped_funnel"]
DashboardGaugeMeasurementType = Literal["sum_values", "record_count"]


class DashboardKpiConfigIn(BaseModel):
    measurement: DashboardGaugeMeasurementType = "sum_values"


class DashboardGaugeConfigIn(BaseModel):
    min: float = 0
    max: float = Field(default=100, gt=0)
    yellow_from: float = 40
    green_from: float = 70
    measurement: DashboardGaugeMeasurementType = "sum_values"
    show_percentages: bool = False
    show_values: bool = True
    show_ranges: bool = True


class DashboardGroupedBarConfigIn(BaseModel):
    group_field_1: str = Field(default="", max_length=160)
    group_field_2: str = Field(default="", max_length=160)
    measurement: DashboardGaugeMeasurementType = "record_count"
    sum_field: str | None = Field(default=None, max_length=160)
    max_rows: int = Field(default=20, ge=3, le=200)


class DashboardGroupedColumnConfigIn(BaseModel):
    x_field: str = Field(default="", max_length=160)
    series_field: str | None = Field(default=None, max_length=160)
    measurement: DashboardGaugeMeasurementType = "record_count"
    sum_field: str | None = Field(default=None, max_length=160)
    max_items: int = Field(default=20, ge=3, le=200)


class DashboardGroupedDonutConfigIn(BaseModel):
    category_field: str = Field(default="", max_length=160)
    measurement: DashboardGaugeMeasurementType = "record_count"
    sum_field: str | None = Field(default=None, max_length=160)
    max_items: int = Field(default=8, ge=3, le=200)


class DashboardWidgetConfigIn(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=120)
    type: DashboardWidgetType = "table"
    report_id: str = Field(min_length=1, max_length=18)
    x: int = Field(default=24, ge=0, le=10000)
    y: int = Field(default=24, ge=0, le=10000)
    w: int = Field(default=360, ge=220, le=1400)
    h: int = Field(default=240, ge=160, le=1200)
    gauge: DashboardGaugeConfigIn | None = None
    kpi: DashboardKpiConfigIn | None = None
    grouped_bar: DashboardGroupedBarConfigIn | None = None
    grouped_column: DashboardGroupedColumnConfigIn | None = None
    grouped_donut: DashboardGroupedDonutConfigIn | None = None


class DashboardLayoutIn(BaseModel):
    columns: int = Field(default=2, ge=1, le=4)
    widgets: list[DashboardWidgetConfigIn] = Field(default_factory=list)


class DashboardDefinitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    folder: DashboardFolderKey = "private"
    description: str | None = Field(default=None, max_length=2000)
    layout: DashboardLayoutIn = Field(default_factory=DashboardLayoutIn)


class DashboardDefinitionPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    folder: DashboardFolderKey | None = None
    description: str | None = Field(default=None, max_length=2000)
    layout: DashboardLayoutIn | None = None


class DashboardDefinitionOut(BaseModel):
    id: str
    name: str
    folder: DashboardFolderKey = "private"
    description: str = ""
    layout: DashboardLayoutIn = Field(default_factory=DashboardLayoutIn)
    owner_id: str | None = None
    owner_name: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
