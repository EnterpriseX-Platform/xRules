"""Sync + async clients backed by httpx."""
from __future__ import annotations

import json
from typing import Any, Mapping, Optional, TypedDict, Union

import httpx


class ExecuteResult(TypedDict, total=False):
    id: str
    ruleId: str
    ruleVersion: int
    output: Any
    duration: float
    status: str


class XRulesError(Exception):
    """Raised when the XRules API returns a non-success response."""

    def __init__(self, message: str, status: Optional[int] = None, code: Optional[str] = None):
        super().__init__(message)
        self.status = status
        self.code = code


def _build_path(rule: str, version: Optional[int]) -> str:
    rule = rule.strip("/")
    if version is not None:
        return f"/api/v1/rules/{rule}/v/{int(version)}/execute"
    return f"/api/v1/rules/{rule}/execute"


def _build_headers(api_key: str, environment: Optional[str], context: Optional[Mapping[str, Any]]) -> dict:
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": api_key,
    }
    if environment:
        headers["X-Environment"] = environment
    if context:
        for k, v in context.items():
            headers[f"X-Context-{k}"] = v if isinstance(v, str) else json.dumps(v)
    return headers


def _unwrap(payload: Any) -> Any:
    if isinstance(payload, dict) and "success" in payload and "data" in payload:
        return payload["data"]
    return payload


def _raise_for_response(resp: httpx.Response) -> None:
    if resp.is_success:
        return
    try:
        body = resp.json()
    except json.JSONDecodeError:
        body = {}
    err = (body or {}).get("error", {}) or {}
    raise XRulesError(
        message=err.get("message") or resp.reason_phrase or "Request failed",
        status=resp.status_code,
        code=err.get("code"),
    )


class XRulesClient:
    """Synchronous client. Wraps httpx.Client."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 30.0,
        client: Optional[httpx.Client] = None,
    ):
        if not base_url:
            raise XRulesError("base_url is required")
        if not api_key:
            raise XRulesError("api_key is required")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._client = client or httpx.Client(timeout=timeout)
        self._owns_client = client is None

    def __enter__(self) -> "XRulesClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def execute(
        self,
        rule: str,
        input: Mapping[str, Any],
        *,
        version: Optional[int] = None,
        environment: Optional[str] = None,
        context: Optional[Mapping[str, Any]] = None,
    ) -> ExecuteResult:
        url = self.base_url + _build_path(rule, version)
        resp = self._client.post(
            url,
            content=json.dumps(input),
            headers=_build_headers(self.api_key, environment, context),
        )
        _raise_for_response(resp)
        return _unwrap(resp.json())

    def batch_execute(
        self,
        rule: str,
        inputs: list,
        *,
        environment: Optional[str] = None,
    ) -> list:
        url = f"{self.base_url}/api/v1/rules/{rule}/batch-execute"
        resp = self._client.post(
            url,
            content=json.dumps({"inputs": inputs}),
            headers=_build_headers(self.api_key, environment, None),
        )
        _raise_for_response(resp)
        return _unwrap(resp.json())

    def get_openapi(self, rule: str) -> dict:
        url = f"{self.base_url}/api/v1/rules/{rule}/openapi.json"
        resp = self._client.get(url, headers={"X-API-Key": self.api_key})
        _raise_for_response(resp)
        return _unwrap(resp.json())


class AsyncXRulesClient:
    """Asynchronous client. Wraps httpx.AsyncClient."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 30.0,
        client: Optional[httpx.AsyncClient] = None,
    ):
        if not base_url:
            raise XRulesError("base_url is required")
        if not api_key:
            raise XRulesError("api_key is required")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._client = client or httpx.AsyncClient(timeout=timeout)
        self._owns_client = client is None

    async def __aenter__(self) -> "AsyncXRulesClient":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def execute(
        self,
        rule: str,
        input: Mapping[str, Any],
        *,
        version: Optional[int] = None,
        environment: Optional[str] = None,
        context: Optional[Mapping[str, Any]] = None,
    ) -> ExecuteResult:
        url = self.base_url + _build_path(rule, version)
        resp = await self._client.post(
            url,
            content=json.dumps(input),
            headers=_build_headers(self.api_key, environment, context),
        )
        _raise_for_response(resp)
        return _unwrap(resp.json())

    async def batch_execute(
        self,
        rule: str,
        inputs: list,
        *,
        environment: Optional[str] = None,
    ) -> list:
        url = f"{self.base_url}/api/v1/rules/{rule}/batch-execute"
        resp = await self._client.post(
            url,
            content=json.dumps({"inputs": inputs}),
            headers=_build_headers(self.api_key, environment, None),
        )
        _raise_for_response(resp)
        return _unwrap(resp.json())

    async def get_openapi(self, rule: str) -> dict:
        url = f"{self.base_url}/api/v1/rules/{rule}/openapi.json"
        resp = await self._client.get(url, headers={"X-API-Key": self.api_key})
        _raise_for_response(resp)
        return _unwrap(resp.json())
