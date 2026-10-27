"""Reset only the local AdA CSV-import journey through its authenticated HTTP API."""
from __future__ import annotations

import argparse
import sys
from urllib.parse import urlsplit

import httpx


def local_url(value: str) -> str:
    parsed = urlsplit(value)
    if (parsed.scheme not in {"http", "https"} or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
            or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment):
        raise argparse.ArgumentTypeError("Bitte eine lokale HTTP(S)-Basis-URL ohne Pfad oder Zugangsdaten angeben.")
    return value.rstrip("/")


def checked(response: httpx.Response):
    if response.is_error:
        body = response.json()
        message = body.get("detail") or body.get("message") or body.get("title") or "Anfrage fehlgeschlagen."
        raise RuntimeError(f"HTTP {response.status_code}: {message}")
    return response.json()


def reset_import(client: httpx.Client, *, user: str, department: str, organization: str, confirmed: bool) -> str:
    checked(client.post("/api/v1/session/login", json={"userId": user}))
    scope = {"departmentCode": department, "organizationId": organization}
    source = checked(client.get("/api/v1/import-journeys/ada", params=scope))["source"]
    if not confirmed:
        state = f'„{source["name"]}“ (Revision {source["revision"]})' if source else "kein importiertes AdA-Beispielinventar"
        return f"Vorschau: {department} / {organization}: {state}. Erst --yes setzt den Import zurück."
    headers = {"If-Match": f'"{source["revision"]}"'} if source else {}
    result = checked(client.post("/api/v1/import-journeys/ada/reset", json=scope, headers=headers))
    state = "war bereits zurückgesetzt" if result["alreadyReset"] else "wurde zurückgesetzt"
    return f"AdA-Import {state} ({department} / {organization}). CSV erneut importierbar; Auditprotokoll bleibt erhalten."


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", type=local_url, default="http://127.0.0.1:4217")
    parser.add_argument("--demo-user", required=True, help="Lokale Demo-Identität; Server muss Demo-Anmeldung erlauben")
    parser.add_argument("--department", default="VBS")
    parser.add_argument("--organization", default="vbs-verteidigung")
    parser.add_argument("--yes", action="store_true", help="Entfernung des AdA-Beispielinventars und seiner importierten Strukturen bestätigen")
    args = parser.parse_args()
    try:
        with httpx.Client(base_url=args.base_url, timeout=30, follow_redirects=False, trust_env=False) as client:
            print(reset_import(client, user=args.demo_user, department=args.department,
                               organization=args.organization, confirmed=args.yes))
    except (httpx.HTTPError, RuntimeError, ValueError) as error:
        raise SystemExit(str(error)) from None


if __name__ == "__main__":
    main()
