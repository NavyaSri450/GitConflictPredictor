"""Small request-body limit for this numeric prediction API."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from starlette.responses import JSONResponse


class RequestSizeLimitMiddleware:
    """Reject oversized write requests without buffering unbounded bodies."""

    def __init__(self, app: Any, max_body_bytes: int = 16 * 1024) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or scope.get("method") not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return

        content_length = next(
            (value.decode("latin-1") for key, value in scope.get("headers", []) if key.lower() == b"content-length"),
            None,
        )
        if content_length is not None:
            try:
                declared_length = int(content_length)
            except ValueError:
                await self._reject(scope, receive, send, 400, "INVALID_CONTENT_LENGTH", "Content-Length must be a valid non-negative integer.")
                return
            if declared_length < 0:
                await self._reject(scope, receive, send, 400, "INVALID_CONTENT_LENGTH", "Content-Length must be a valid non-negative integer.")
                return
            if declared_length > self.max_body_bytes:
                await self._reject(scope, receive, send, 413, "PAYLOAD_TOO_LARGE", "Request body exceeds the 16 KiB limit.")
                return

        # Enforce the same limit for chunked requests or requests without a
        # Content-Length header, retaining at most max_body_bytes in memory.
        buffered: list[dict[str, Any]] = []
        body_size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                buffered.append(message)
                break
            if message["type"] == "http.request":
                body_size += len(message.get("body", b""))
                if body_size > self.max_body_bytes:
                    await self._reject(scope, receive, send, 413, "PAYLOAD_TOO_LARGE", "Request body exceeds the 16 KiB limit.")
                    return
                buffered.append(message)
                if not message.get("more_body", False):
                    break
            else:
                buffered.append(message)

        async def replay_receive() -> dict[str, Any]:
            if buffered:
                return buffered.pop(0)
            return await receive()

        await self.app(scope, replay_receive, send)

    async def _reject(self, scope: dict[str, Any], receive: Any, send: Any, status: int, code: str, message: str) -> None:
        response = JSONResponse(
            status_code=status,
            content={
                "error": {"code": code, "message": message},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        await response(scope, receive, send)
