from __future__ import annotations

"""SQLAlchemy mixin for string primary keys backed by object_id.new_id18()."""

from typing import Callable

from sqlalchemy import String
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.core.object_id import new_id18


def _id_default(prefix: str) -> Callable[[], str]:
    return lambda: new_id18(prefix)


class HashedIdMixin:
    """Adds an 18-character primary key `id` generated with a 3-char prefix.

    Each model must define:
        __id_prefix__ = "ABC"
    """

    __id_prefix__: str

    @declared_attr.directive
    def id(cls) -> Mapped[str]:  # noqa: N805
        prefix = getattr(cls, "__id_prefix__", None)
        if not isinstance(prefix, str) or len(prefix) != 3:
            raise RuntimeError(f"{cls.__name__} must define __id_prefix__ with 3 chars")
        return mapped_column(String(18), primary_key=True, default=_id_default(prefix))