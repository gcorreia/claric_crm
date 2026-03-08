from __future__ import annotations

from typing import Any, TypedDict

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.business_unit import BusinessUnit
from app.models.custom_field_definition import CustomFieldDefinition
from app.models.custom_field_session import CustomFieldSession
from app.models.opportunity_stage import OpportunityStage


class FieldSeed(TypedDict, total=False):
    key: str
    label: str
    type: str
    sort_order: int
    required: bool
    options: dict[str, Any]
    validations: dict[str, Any]
    default_value: dict[str, Any]


class SessionSeed(TypedDict):
    key: str
    label: str
    sort_order: int
    layout_columns: int
    fields: list[FieldSeed]


_SEED_LAYOUTS: dict[str, list[SessionSeed]] = {
    "account": [
        {
            "key": "account_detalhe",
            "label": "Detalhe",
            "sort_order": 10,
            "layout_columns": 3,
            "fields": [
                {
                    "key": "account_segmento",
                    "label": "Segmento",
                    "type": "single_select",
                    "sort_order": 10,
                    "options": {"values": ["Enterprise", "Mid Market", "SMB", "Setor Publico"]},
                },
                {
                    "key": "account_numero_colaboradores",
                    "label": "Numero de colaboradores",
                    "type": "number",
                    "sort_order": 20,
                    "validations": {"min": 0},
                },
                {
                    "key": "account_data_renovacao",
                    "label": "Data de renovacao",
                    "type": "date",
                    "sort_order": 30,
                },
            ],
        },
        {
            "key": "account_operacao",
            "label": "Operacao",
            "sort_order": 20,
            "layout_columns": 2,
            "fields": [
                {
                    "key": "account_prazo_medio_pagamento",
                    "label": "Prazo medio de pagamento (dias)",
                    "type": "number",
                    "sort_order": 10,
                    "validations": {"min": 0},
                },
                {
                    "key": "account_possui_contrato_master",
                    "label": "Possui contrato master",
                    "type": "boolean",
                    "sort_order": 20,
                    "default_value": {"value": False},
                },
                {
                    "key": "account_observacoes",
                    "label": "Observacoes",
                    "type": "textarea",
                    "sort_order": 30,
                },
            ],
        },
    ],
    "contact": [
        {
            "key": "contact_perfil",
            "label": "Perfil",
            "sort_order": 10,
            "layout_columns": 3,
            "fields": [
                {
                    "key": "contact_departamento",
                    "label": "Departamento",
                    "type": "text",
                    "sort_order": 10,
                },
                {
                    "key": "contact_cargo",
                    "label": "Cargo",
                    "type": "text",
                    "sort_order": 20,
                },
                {
                    "key": "contact_whatsapp",
                    "label": "WhatsApp",
                    "type": "phone",
                    "sort_order": 30,
                },
            ],
        },
        {
            "key": "contact_relacionamento",
            "label": "Relacionamento",
            "sort_order": 20,
            "layout_columns": 2,
            "fields": [
                {
                    "key": "contact_nivel_influencia",
                    "label": "Nivel de influencia",
                    "type": "single_select",
                    "sort_order": 10,
                    "options": {"values": ["Alto", "Medio", "Baixo"]},
                },
                {
                    "key": "contact_preferencia_contato",
                    "label": "Preferencia de contato",
                    "type": "single_select",
                    "sort_order": 20,
                    "options": {"values": ["Email", "Telefone", "WhatsApp"]},
                },
                {
                    "key": "contact_linkedin",
                    "label": "LinkedIn",
                    "type": "url",
                    "sort_order": 30,
                },
            ],
        },
    ],
    "lead": [
        {
            "key": "lead_qualificacao",
            "label": "Qualificacao",
            "sort_order": 10,
            "layout_columns": 3,
            "fields": [
                {
                    "key": "lead_tamanho_empresa",
                    "label": "Tamanho da empresa",
                    "type": "number",
                    "sort_order": 10,
                    "validations": {"min": 0},
                },
                {
                    "key": "lead_budget_estimado",
                    "label": "Budget estimado",
                    "type": "number",
                    "sort_order": 20,
                    "validations": {"min": 0},
                },
                {
                    "key": "lead_tem_urgencia",
                    "label": "Tem urgencia",
                    "type": "boolean",
                    "sort_order": 30,
                    "default_value": {"value": False},
                },
            ],
        },
        {
            "key": "lead_marketing",
            "label": "Marketing",
            "sort_order": 20,
            "layout_columns": 2,
            "fields": [
                {
                    "key": "lead_origem_campanha",
                    "label": "Origem da campanha",
                    "type": "text",
                    "sort_order": 10,
                },
                {
                    "key": "lead_palavra_chave",
                    "label": "Palavra-chave",
                    "type": "text",
                    "sort_order": 20,
                },
                {
                    "key": "lead_score_fit",
                    "label": "Score de fit",
                    "type": "number",
                    "sort_order": 30,
                    "validations": {"min": 0, "max": 100},
                },
            ],
        },
    ],
    "opportunity": [
        {
            "key": "opportunity_negociacao",
            "label": "Negociacao",
            "sort_order": 10,
            "layout_columns": 3,
            "fields": [
                {
                    "key": "opportunity_probabilidade_fechamento",
                    "label": "Probabilidade de fechamento (%)",
                    "type": "number",
                    "sort_order": 10,
                    "validations": {"min": 0, "max": 100},
                },
                {
                    "key": "opportunity_tipo_contrato",
                    "label": "Tipo de contrato",
                    "type": "single_select",
                    "sort_order": 20,
                    "options": {"values": ["Mensal", "Anual", "Bienal"]},
                },
                {
                    "key": "opportunity_data_assinatura_prevista",
                    "label": "Data prevista de assinatura",
                    "type": "date",
                    "sort_order": 30,
                },
            ],
        },
        {
            "key": "opportunity_financeiro",
            "label": "Financeiro",
            "sort_order": 20,
            "layout_columns": 2,
            "fields": [
                {
                    "key": "opportunity_forma_pagamento",
                    "label": "Forma de pagamento",
                    "type": "single_select",
                    "sort_order": 10,
                    "options": {"values": ["Boleto", "Pix", "Cartao", "Transferencia"]},
                },
                {
                    "key": "opportunity_mrr_previsto",
                    "label": "MRR previsto",
                    "type": "number",
                    "sort_order": 20,
                    "validations": {"min": 0},
                },
                {
                    "key": "opportunity_parcela_implantacao",
                    "label": "Parcela de implantacao",
                    "type": "number",
                    "sort_order": 30,
                    "validations": {"min": 0},
                },
            ],
        },
    ],
}

_FIXED_OPPORTUNITY_STAGES: tuple[tuple[str, int], ...] = (
    ("Inicial", 0),
    ("Fechado", 9000),
    ("Perdido", 9010),
)


def ensure_seed_crm_field_layout(db: Session) -> None:
    bu_ids = list(db.scalars(select(BusinessUnit.id)).all())
    if not bu_ids:
        return

    created_any = False
    for bu_id in bu_ids:
        db.execute(text("SELECT set_config('app.tenant_id', :tenant_id, false)"), {"tenant_id": bu_id})

        existing_sessions = {
            (row.entity_type or "", row.key): row
            for row in db.execute(
                select(CustomFieldSession).where(
                    CustomFieldSession.business_unit_id == bu_id,
                    CustomFieldSession.custom_object_id.is_(None),
                )
            )
            .scalars()
            .all()
            if row.entity_type
        }
        existing_fields = {
            (row.entity_type or "", row.key): row
            for row in db.execute(
                select(CustomFieldDefinition).where(
                    CustomFieldDefinition.business_unit_id == bu_id,
                    CustomFieldDefinition.custom_object_id.is_(None),
                )
            )
            .scalars()
            .all()
            if row.entity_type
        }

        for entity_type, session_seeds in _SEED_LAYOUTS.items():
            for session_seed in session_seeds:
                session_key = (entity_type, session_seed["key"])
                session_row = existing_sessions.get(session_key)
                if session_row is None:
                    session_row = CustomFieldSession(
                        business_unit_id=bu_id,
                        entity_type=entity_type,
                        custom_object_id=None,
                        key=session_seed["key"],
                        label=session_seed["label"],
                        sort_order=int(session_seed.get("sort_order", 0)),
                        layout_columns=int(session_seed.get("layout_columns", 2)),
                    )
                    db.add(session_row)
                    db.flush()
                    existing_sessions[session_key] = session_row
                    created_any = True

                for field_seed in session_seed["fields"]:
                    field_key = (entity_type, field_seed["key"])
                    if field_key in existing_fields:
                        continue

                    row = CustomFieldDefinition(
                        business_unit_id=bu_id,
                        entity_type=entity_type,
                        custom_object_id=None,
                        session_id=session_row.id,
                        key=field_seed["key"],
                        label=field_seed["label"],
                        sort_order=int(field_seed.get("sort_order", 0)),
                        version=1,
                        type=field_seed.get("type", "text"),
                        required=bool(field_seed.get("required", False)),
                        is_active=True,
                        options=dict(field_seed.get("options", {})),
                        validations=dict(field_seed.get("validations", {})),
                        default_value=dict(field_seed.get("default_value", {})),
                    )
                    db.add(row)
                    existing_fields[field_key] = row
                    created_any = True

        # Important for RLS: flush all rows for the current tenant before switching tenant_id.
        db.flush()

        existing_stages = {
            (row.value or "").strip().lower(): row
            for row in db.execute(
                select(OpportunityStage).where(OpportunityStage.business_unit_id == bu_id)
            )
            .scalars()
            .all()
        }
        for stage_label, stage_sort in _FIXED_OPPORTUNITY_STAGES:
            stage_key = stage_label.lower()
            row = existing_stages.get(stage_key)
            if row is None:
                db.add(
                    OpportunityStage(
                        business_unit_id=bu_id,
                        value=stage_label,
                        sort_order=stage_sort,
                        is_active=True,
                    )
                )
                created_any = True
                continue

            changed = False
            if row.value != stage_label:
                row.value = stage_label
                changed = True
            if int(row.sort_order or 0) != stage_sort:
                row.sort_order = stage_sort
                changed = True
            if not row.is_active:
                row.is_active = True
                changed = True
            if changed:
                db.add(row)
                created_any = True

        db.flush()

    db.execute(text("SELECT set_config('app.tenant_id', '', false)"))
    if created_any:
        db.commit()
