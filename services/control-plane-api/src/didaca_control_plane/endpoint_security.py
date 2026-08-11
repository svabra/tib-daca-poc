from __future__ import annotations

import ipaddress
import socket
from urllib.parse import SplitResult, urlsplit


class EndpointSecurityError(ValueError):
    def __init__(self, detail: str, *, intentionally_unprobed: bool = False) -> None:
        super().__init__(detail)
        self.detail = detail
        self.intentionally_unprobed = intentionally_unprobed


def validate_catalog_endpoint(
    endpoint: str,
    allowed_hosts: tuple[str, ...],
) -> SplitResult:
    """Validate a catalog endpoint before storage or every outbound health probe."""
    try:
        parsed = urlsplit(endpoint)
        port = parsed.port
    except ValueError as exc:
        raise EndpointSecurityError("The endpoint URL contains an invalid host or port.") from exc

    if parsed.scheme.lower() not in {"http", "https"}:
        raise EndpointSecurityError("Only HTTP and HTTPS catalog endpoints are allowed.")
    if not parsed.hostname:
        raise EndpointSecurityError("The endpoint must contain a hostname.")
    if parsed.username is not None or parsed.password is not None:
        raise EndpointSecurityError("Catalog endpoint URLs must not contain credentials.")
    if parsed.fragment:
        raise EndpointSecurityError("Catalog endpoint URLs must not contain fragments.")

    hostname = parsed.hostname.lower().rstrip(".")
    if not hostname:
        raise EndpointSecurityError("The endpoint must contain a valid hostname.")
    if _host_is_allowlisted(hostname, allowed_hosts):
        return parsed
    if hostname == "invalid" or hostname.endswith(".invalid"):
        raise EndpointSecurityError(
            "The reserved .invalid endpoint is intentionally not probed.",
            intentionally_unprobed=True,
        )

    addresses = _resolve_addresses(hostname, port or _default_port(parsed.scheme))
    blocked = sorted(str(address) for address in addresses if not _address_is_public(address))
    if blocked:
        raise EndpointSecurityError(
            "The endpoint resolves to a loopback, link-local, private, reserved, "
            f"or otherwise non-public address: {', '.join(blocked)}."
        )
    return parsed


def _resolve_addresses(
    hostname: str, port: int
) -> set[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        literal = ipaddress.ip_address(hostname)
    except ValueError:
        try:
            records = socket.getaddrinfo(
                hostname,
                port,
                family=socket.AF_UNSPEC,
                type=socket.SOCK_STREAM,
            )
        except (OSError, UnicodeError) as exc:
            raise EndpointSecurityError(
                "The endpoint hostname cannot be resolved and is not allowlisted."
            ) from exc
        addresses = {ipaddress.ip_address(record[4][0].split("%", 1)[0]) for record in records}
        if not addresses:
            raise EndpointSecurityError(
                "The endpoint hostname returned no addresses and is not allowlisted."
            )
        return addresses
    return {literal}


def _host_is_allowlisted(hostname: str, patterns: tuple[str, ...]) -> bool:
    for pattern in patterns:
        normalized = pattern.lower().rstrip(".")
        if normalized.startswith("*."):
            suffix = normalized[1:]
            if hostname.endswith(suffix) and hostname != suffix[1:]:
                return True
        elif hostname == normalized:
            return True
    return False


def _address_is_public(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return address.is_global and not any(
        (
            address.is_loopback,
            address.is_link_local,
            address.is_private,
            address.is_reserved,
            address.is_multicast,
            address.is_unspecified,
        )
    )


def _default_port(scheme: str) -> int:
    return 443 if scheme.lower() == "https" else 80
