from __future__ import annotations


class ServerError(RuntimeError):
    def __init__(self, code: str, message: str, *, status: int, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable


def unavailable(code: str, message: str) -> ServerError:
    return ServerError(code, message, status=503, retryable=True)
