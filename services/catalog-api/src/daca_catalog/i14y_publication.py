from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, NoReturn, Protocol, runtime_checkable


@dataclass(frozen=True, slots=True)
class I14YPublicationPackage:
    """Internal hand-off package, independent of any undocumented remote write API."""

    resource_urn: str
    revision: int
    media_type: Literal["text/turtle", "application/ld+json"]
    document: str


class I14YPublicationDisabled(RuntimeError):
    """Raised while the future I14Y publication integration is deliberately unavailable."""


@runtime_checkable
class I14YPublicationPort(Protocol):
    """Future outbound boundary; it deliberately defines no HTTP endpoint or verb."""

    @property
    def enabled(self) -> bool: ...

    async def publish_dataset(self, package: I14YPublicationPackage) -> None: ...


class DisabledI14YPublicationAdapter(I14YPublicationPort):
    """Default adapter proving that this PoC performs no I14Y write traffic."""

    @property
    def enabled(self) -> Literal[False]:
        return False

    async def publish_dataset(self, package: I14YPublicationPackage) -> NoReturn:
        del package
        raise I14YPublicationDisabled("I14Y publication is disabled in this PoC")
