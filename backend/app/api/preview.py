"""
Execution preview endpoints.

The bridge pauses before the first write tool call and emits an
``execution_preview`` SSE event. These endpoints let the UI confirm or
cancel that preview. The bridge owns the pending-preview state, so both
calls are forwarded to it.

  POST /api/preview/{preview_id}/confirm
  POST /api/preview/{preview_id}/cancel
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException

BRIDGE_URL = os.getenv("PI_BRIDGE_URL", "http://localhost:3100")

router = APIRouter(prefix="/api")


async def _forward(preview_id: str, decision: str) -> dict[str, str]:
    url = f"{BRIDGE_URL}/preview/{preview_id}/{decision}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Bridge unreachable: {exc}") from exc

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Preview '{preview_id}' not found")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Bridge error: {resp.status_code}")
    return {"status": "ok"}


@router.post("/preview/{preview_id}/confirm")
async def confirm_preview(preview_id: str) -> dict[str, str]:
    return await _forward(preview_id, "confirm")


@router.post("/preview/{preview_id}/cancel")
async def cancel_preview(preview_id: str) -> dict[str, str]:
    return await _forward(preview_id, "cancel")
