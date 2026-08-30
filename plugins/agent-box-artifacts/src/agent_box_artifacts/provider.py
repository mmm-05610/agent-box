from __future__ import annotations

import hashlib
from pathlib import Path
from urllib.parse import unquote, urlparse

from agent_box.resource_contracts import PromptFragmentV1
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor


def _sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _file_uri_path(uri: str | None) -> Path:
    if not uri:
        raise ValueError("file-backed Ref requires uri")
    parsed = urlparse(uri)
    if parsed.scheme != "file" or parsed.netloc not in {"", "localhost"}:
        raise ValueError(f"unsupported file Ref uri: {uri}")
    return Path(unquote(parsed.path)).resolve()


class ArtifactPromptResourceProvider:
    """Resolve immutable local text artifacts by SHA-256."""

    provider_id = "artifact-file"
    supported_contract_ids = frozenset({PromptFragmentV1.contract_id})

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Local immutable artifact", "1")

    def make_ref(self, path: Path, *, title: str) -> Ref:
        path = path.resolve()
        digest = _sha256(path.read_bytes())
        return Ref(RefType.ARTIFACT, self.provider_id, digest,
                   uri=path.as_uri(), metadata={"title": title})

    def resolve(self, contract_id: str, ref: Ref, *, context=None) -> PromptFragmentV1:
        del context
        if contract_id != PromptFragmentV1.contract_id:
            raise ValueError(f"unsupported contract: {contract_id}")
        if ref.type is not RefType.ARTIFACT:
            raise ValueError("prompt fragment contract requires ArtifactRef")
        path = _file_uri_path(ref.uri)
        content = path.read_text(encoding="utf-8")
        digest = _sha256(content.encode("utf-8"))
        if digest != ref.native_id:
            raise ValueError("artifact digest differs from frozen ArtifactRef")
        return PromptFragmentV1(ref.metadata.get("title") or path.name, content, digest)
