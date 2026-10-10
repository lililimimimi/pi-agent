"""Response models shared by several API routes."""

from __future__ import annotations

from pydantic import BaseModel


class StatusResponse(BaseModel):
    status: str


class OkResponse(BaseModel):
    ok: bool


class RevealResponse(BaseModel):
    status: str
    path: str


class CustomProviderAdded(BaseModel):
    id: str
    models: list[str]
    error: str | None = None


class EnabledModelsResponse(BaseModel):
    ok: bool
    enabled: list[str]


class DefaultModelResponse(BaseModel):
    provider: str
    model: str


class ModelTestResponse(BaseModel):
    ok: bool
    error: str | None = None
    ms: int | None = None
