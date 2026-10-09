"""Model catalog: every known model, which ones the user enabled, and their last test."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from app.config.meta import PROVIDER_IDS, PROVIDER_META
from app.config.store import load_config, update_provider_config, known_provider
from app.services.bridge import BridgeError, bridge_call, bridge_models


def _configured(cfg_provider: dict[str, Any], provider_id: str) -> bool:
    if provider_id == "pi":
        return bool(cfg_provider.get("connected"))
    return bool(cfg_provider.get("api_key") or cfg_provider.get("base_url") or cfg_provider.get("connected"))


async def build_catalog() -> list[dict[str, Any]]:
    """One entry per provider: its models with name, image support, enabled flag and last test.

    Bridge models come first (the SDK knows how to run them). Models cached in
    config.json are added for providers the bridge does not run.
    """
    cfg = load_config()
    by_provider: dict[str, dict[str, dict[str, Any]]] = {}

    for m in await bridge_models():
        by_provider.setdefault(m["provider"], {})[m["id"]] = {
            "id": m["id"],
            "name": m.get("name") or m["id"],
            "supports_images": bool(m.get("supports_images")),
        }

    # The Claude subscription (pi) runs through the bridge's Anthropic models,
    # so it lists exactly the models the bridge can run.
    if _configured(cfg["providers"].get("pi", {}), "pi") and "anthropic" in by_provider:
        by_provider["pi"] = {mid: dict(m) for mid, m in by_provider["anthropic"].items()}

    for pid, p in cfg["providers"].items():
        if pid == "pi" or not _configured(p, pid):
            continue
        for raw in p.get("models") or []:
            mid = raw if isinstance(raw, str) else raw.get("id", "")
            if mid:
                by_provider.setdefault(pid, {}).setdefault(
                    mid, {"id": mid, "name": mid, "supports_images": False},
                )

    order = {pid: i for i, pid in enumerate(PROVIDER_IDS)}
    result = []
    for pid in sorted(by_provider, key=lambda p: (order.get(p, 99), p)):
        p = cfg["providers"].get(pid, {})
        enabled = set(p.get("enabled_models") or [])
        statuses = p.get("model_status") or {}
        models = [
            {**m, "enabled": m["id"] in enabled, "status": statuses.get(m["id"])}
            for m in by_provider[pid].values()
        ]
        result.append({
            "provider": pid,
            "label": p.get("name") or PROVIDER_META.get(pid, {}).get("label", pid),
            "models": models,
        })
    return result


async def enabled_models() -> list[dict[str, Any]]:
    """Enabled models only, flattened for the top-right picker."""
    out: list[dict[str, Any]] = []
    cfg = load_config()
    for group in await build_catalog():
        # A provider without its own key or login can't run its models, so none are offered
        if not _configured(cfg["providers"].get(group["provider"], {}), group["provider"]):
            continue
        for m in group["models"]:
            if m["enabled"]:
                out.append({
                    "id": m["id"],
                    "name": m["name"],
                    "provider": group["provider"],
                    "provider_label": group["label"],
                    "supports_tools": True,
                    "supports_images": m["supports_images"],
                    "status": m["status"],
                })
    return out


def save_enabled_models(provider: str, models: list[str]) -> list[str]:
    """Store the enabled model ids for one provider (duplicates removed, order kept)."""
    unique = list(dict.fromkeys(models))
    update_provider_config(provider, {"enabled_models": unique})
    return unique


# Errors that will keep happening until the user fixes the account or key.
# Timeouts, network drops and rate limits clear up on their own, so they don't count.
_LASTING_FAILURE = re.compile(
    r"out of extra usage|quota|usage limit|insufficient|balance|billing|credit"
    r"|not available|not supported|does not exist|model not found"
    r"|401|403|invalid.*key|unauthori[sz]ed|authentication|api key|permission",
    re.IGNORECASE,
)


def is_lasting_failure(message: str) -> bool:
    return bool(_LASTING_FAILURE.search(message))


def record_model_status(provider: str, model: str, ok: bool, error: str | None = None, ms: int | None = None) -> None:
    """Save the last result for one model; the picker's dot shows it."""
    if not known_provider(provider):
        return
    statuses = dict(load_config()["providers"].get(provider, {}).get("model_status") or {})
    statuses[model] = {
        "ok": ok,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "error": error,
        "ms": ms,
    }
    update_provider_config(provider, {"model_status": statuses})


async def run_model_test(body: dict[str, Any]) -> dict[str, Any]:
    """Send one short prompt through the bridge, then save the result on that model."""
    try:
        result = await bridge_call("POST", "/models/test", body, timeout=90.0)
    except BridgeError as e:
        result = {"ok": False, "error": f"pi-bridge unreachable: {e}"}

    provider = body.get("provider")
    model = body.get("model")
    if isinstance(provider, str) and isinstance(model, str):
        record_model_status(provider, model, bool(result.get("ok")), result.get("error"), result.get("ms"))
    return result
