//! ABW1 bounded frames, extracted from the old Worker protocol.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const MAGIC: [u8; 4] = *b"ABW1";
pub const VERSION: u16 = 1;
pub const HEADER_LEN: usize = 60;
// Real homes produce large audit listings (the Worker still caps entries
// and bytes honestly); 1 MiB keeps one bounded listing inside one frame.
pub const MAX_PAYLOAD: usize = 1024 * 1024;
/// Control-protocol generation. Version 2 added bidirectional stdin writes and
/// pre-terminal stdout/stderr events for long-lived attempts. Version 3 adds
/// digest-pinned runtime artifact trees to the bootstrap, which the Worker
/// verifies before it will bind one read-only. Version 4 adds the persistent
/// home operation family (`home.prepare`, `home.list`, `home.get`): a
/// Profile's native state lives in a durable directory outside `--root`, and
/// only a Worker that can prepare and audit that directory may carry the
/// native-home model. The frame format itself is unchanged and every mismatch
/// is a loud handshake failure, in both directions: a v4 client never silently
/// accepts a v3 Worker and a v3 client is refused by a v4 Worker instead of
/// degrading to a model where state is unknowable.
///
/// The version still stays 3 while error codes are added below it. The codes
/// are part of the contract, and the set grows only additively: the frame
/// layout and the `{"ok":false,"error":{"code","message"}}` envelope are
/// unchanged, and no request or response ever gains a code-specific field. A
/// client must treat a code it does not know as a refusal and never retry it
/// (fail closed); the sidecar's retry list is exactly the codes it knows mean
/// "the bytes moved". Mixed generations therefore degrade to the stricter
/// behaviour in both directions - an old client refuses a new Worker's refined
/// codes outright, and a new client refuses an old Worker's shared `VIEW_INVALID`
/// refusals outright instead of retrying them - never to a silent pass.
/// Splitting the view refusals out of that one shared code (`VIEW_SPECIAL_FILE`,
/// `VIEW_TRAVERSAL_LIMIT`, `VIEW_FILE_LIMIT`, `VIEW_MISSING`, plus the retryable
/// `VIEW_CHANGED`) is additive in exactly that sense; `view_error_envelope_tests`
/// checks the envelope frame by frame, and the fail-closed rule is pinned by
/// `tests/server/test_state_capture_error_boundary.py`.
pub const PROTOCOL_VERSION: u32 = 5;
pub const MAX_RUNTIME_ARTIFACTS: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum FrameKind {
    Hello = 1,
    HelloAck = 2,
    Data = 5,
    Ack = 6,
    Exit = 7,
    WorkerError = 8,
}

impl TryFrom<u8> for FrameKind {
    type Error = FrameError;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::Hello),
            2 => Ok(Self::HelloAck),
            5 => Ok(Self::Data),
            6 => Ok(Self::Ack),
            7 => Ok(Self::Exit),
            8 => Ok(Self::WorkerError),
            value => Err(FrameError::UnknownKind(value)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frame {
    pub kind: FrameKind,
    pub stream_id: u64,
    pub sequence: u64,
    pub payload: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bootstrap {
    pub worker_version: String,
    pub worker_digest: String,
    pub connection_id: String,
    pub project_id: String,
    pub effective_user: String,
    pub instance_nonce: String,
    pub server_instance_id: String,
    pub lease_ms: u64,
    /// Control-protocol generation carried since the interactive-channel
    /// upgrade. Bootstrap 0 is rejected so a legacy client fails loudly
    /// instead of silently degrading to one-shot semantics.
    #[serde(default)]
    pub protocol_version: u32,
    #[serde(default)]
    pub executables: Vec<ExecutableAuthorization>,
    /// Digest-pinned runtime artifact directories the Server declared. The
    /// Worker re-derives each digest inside WSL and refuses the whole
    /// handshake on any mismatch, so a directory is only ever bind-mounted
    /// read-only after it was verified here.
    #[serde(default)]
    pub runtime_artifacts: Vec<RuntimeArtifactAuthorization>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutableAuthorization {
    pub path: String,
    pub digest: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeArtifactAuthorization {
    pub path: String,
    pub target: String,
    pub digest: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum FrameError {
    #[error("bad magic")]
    BadMagic,
    #[error("unsupported version {0}")]
    UnsupportedVersion(u16),
    #[error("unknown frame kind {0}")]
    UnknownKind(u8),
    #[error("truncated frame")]
    Truncated,
    #[error("payload too large")]
    PayloadTooLarge,
    #[error("length mismatch")]
    LengthMismatch,
    #[error("digest mismatch")]
    DigestMismatch,
    #[error("invalid bootstrap")]
    InvalidBootstrap,
}

impl Frame {
    pub fn new(kind: FrameKind, stream_id: u64, sequence: u64, payload: Vec<u8>) -> Self {
        Self {
            kind,
            stream_id,
            sequence,
            payload,
        }
    }
}

pub fn encode_frame(frame: &Frame) -> Result<Vec<u8>, FrameError> {
    if frame.payload.len() > MAX_PAYLOAD {
        return Err(FrameError::PayloadTooLarge);
    }
    let mut encoded = Vec::with_capacity(HEADER_LEN + frame.payload.len());
    encoded.extend_from_slice(&MAGIC);
    encoded.extend_from_slice(&VERSION.to_be_bytes());
    encoded.push(frame.kind as u8);
    encoded.push(0);
    encoded.extend_from_slice(&frame.stream_id.to_be_bytes());
    encoded.extend_from_slice(&frame.sequence.to_be_bytes());
    encoded.extend_from_slice(&(frame.payload.len() as u32).to_be_bytes());
    encoded.extend_from_slice(&Sha256::digest(&frame.payload));
    encoded.extend_from_slice(&frame.payload);
    Ok(encoded)
}

pub fn decode_frame(encoded: &[u8]) -> Result<Frame, FrameError> {
    if encoded.len() < HEADER_LEN {
        return Err(FrameError::Truncated);
    }
    if encoded[..4] != MAGIC {
        return Err(FrameError::BadMagic);
    }
    let version = u16::from_be_bytes([encoded[4], encoded[5]]);
    if version != VERSION {
        return Err(FrameError::UnsupportedVersion(version));
    }
    let kind = FrameKind::try_from(encoded[6])?;
    let stream_id = u64::from_be_bytes(encoded[8..16].try_into().unwrap());
    let sequence = u64::from_be_bytes(encoded[16..24].try_into().unwrap());
    let length = u32::from_be_bytes(encoded[24..28].try_into().unwrap()) as usize;
    if length > MAX_PAYLOAD {
        return Err(FrameError::PayloadTooLarge);
    }
    let expected = HEADER_LEN
        .checked_add(length)
        .ok_or(FrameError::LengthMismatch)?;
    if encoded.len() < expected {
        return Err(FrameError::Truncated);
    }
    if encoded.len() != expected {
        return Err(FrameError::LengthMismatch);
    }
    let payload = encoded[HEADER_LEN..].to_vec();
    if encoded[28..60] != Sha256::digest(&payload)[..] {
        return Err(FrameError::DigestMismatch);
    }
    Ok(Frame {
        kind,
        stream_id,
        sequence,
        payload,
    })
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn encode_bootstrap(value: &Bootstrap) -> Result<Vec<u8>, FrameError> {
    validate_bootstrap(value)?;
    let payload = serde_json::to_vec(value).map_err(|_| FrameError::InvalidBootstrap)?;
    encode_frame(&Frame::new(FrameKind::Hello, 0, 1, payload))
}

pub fn decode_bootstrap(encoded: &[u8]) -> Result<Bootstrap, FrameError> {
    let frame = decode_frame(encoded)?;
    if frame.kind != FrameKind::Hello || frame.stream_id != 0 || frame.sequence != 1 {
        return Err(FrameError::InvalidBootstrap);
    }
    let value: Bootstrap =
        serde_json::from_slice(&frame.payload).map_err(|_| FrameError::InvalidBootstrap)?;
    validate_bootstrap(&value)?;
    Ok(value)
}

fn validate_bootstrap(value: &Bootstrap) -> Result<(), FrameError> {
    for text in [
        &value.worker_version,
        &value.worker_digest,
        &value.connection_id,
        &value.project_id,
        &value.effective_user,
        &value.instance_nonce,
        &value.server_instance_id,
    ] {
        if text.is_empty() || text.len() > 1024 || text.chars().any(char::is_control) {
            return Err(FrameError::InvalidBootstrap);
        }
    }
    if !(1_000..=120_000).contains(&value.lease_ms) {
        return Err(FrameError::InvalidBootstrap);
    }
    if value.executables.len() > 16
        || value.executables.iter().any(|item| {
            item.path.is_empty()
                || item.path.len() > 4096
                || item.path.chars().any(char::is_control)
                || !item.digest.starts_with("sha256:")
                || item.digest.len() != 71
                || !item.digest[7..]
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit())
        })
    {
        return Err(FrameError::InvalidBootstrap);
    }
    if value.runtime_artifacts.len() > MAX_RUNTIME_ARTIFACTS
        || value.runtime_artifacts.iter().any(|item| {
            !crate::artifacts::valid_declared_source(&item.path)
                || !crate::artifacts::valid_target(&item.target)
                || !item.digest.starts_with("sha256:")
                || item.digest.len() != 71
                || !item.digest[7..]
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit())
        })
    {
        return Err(FrameError::InvalidBootstrap);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn golden_empty_data_frame() {
        let encoded = encode_frame(&Frame::new(FrameKind::Data, 7, 9, Vec::new())).unwrap();
        assert_eq!(hex(&encoded), "41425731000105000000000000000007000000000000000900000000e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(decode_frame(&encoded).unwrap().stream_id, 7);
    }

    #[test]
    fn rejects_oversized_length_before_allocating_payload() {
        let mut bytes = vec![0u8; HEADER_LEN];
        bytes[..4].copy_from_slice(&MAGIC);
        bytes[4..6].copy_from_slice(&VERSION.to_be_bytes());
        bytes[6] = FrameKind::Data as u8;
        bytes[24..28].copy_from_slice(&u32::MAX.to_be_bytes());
        assert_eq!(decode_frame(&bytes), Err(FrameError::PayloadTooLarge));
    }

    #[test]
    fn bootstrap_round_trip_preserves_bound_identity() {
        let value = Bootstrap {
            worker_version: "0.1.0".into(),
            worker_digest: format!("sha256:{}", "a".repeat(64)),
            connection_id: "connection-test".into(),
            project_id: "project-test".into(),
            effective_user: "tester".into(),
            instance_nonce: "nonce-test".into(),
            server_instance_id: "server-test".into(),
            lease_ms: 5_000,
            protocol_version: PROTOCOL_VERSION,
            executables: Vec::new(),
            runtime_artifacts: vec![RuntimeArtifactAuthorization {
                path: "/opt/agentbox/artifacts/pi-node-modules".into(),
                target: "/runtime/artifacts/pi-node-modules".into(),
                digest: format!("sha256:{}", "b".repeat(64)),
            }],
        };
        assert_eq!(
            decode_bootstrap(&encode_bootstrap(&value).unwrap()).unwrap(),
            value
        );
    }

    #[test]
    fn bootstrap_refuses_malformed_runtime_artifacts() {
        let base = |path: &str, target: &str, digest: String| Bootstrap {
            worker_version: "0.1.0".into(),
            worker_digest: format!("sha256:{}", "a".repeat(64)),
            connection_id: "connection-test".into(),
            project_id: "project-test".into(),
            effective_user: "tester".into(),
            instance_nonce: "nonce-test".into(),
            server_instance_id: "server-test".into(),
            lease_ms: 5_000,
            protocol_version: PROTOCOL_VERSION,
            executables: Vec::new(),
            runtime_artifacts: vec![RuntimeArtifactAuthorization {
                path: path.into(),
                target: target.into(),
                digest,
            }],
        };
        let good = format!("sha256:{}", "c".repeat(64));
        assert!(encode_bootstrap(&base(
            "/opt/agentbox/artifacts/pi",
            "/runtime/artifacts/pi",
            good.clone()
        ))
        .is_ok());
        for value in [
            base("relative/pi", "/runtime/artifacts/pi", good.clone()),
            base("/opt/agentbox/../pi", "/runtime/artifacts/pi", good.clone()),
            base("/opt/agentbox//pi", "/runtime/artifacts/pi", good.clone()),
            base(
                "/opt/agentbox/artifacts/pi/",
                "/runtime/artifacts/pi",
                good.clone(),
            ),
            base(
                "/opt/agentbox/artifacts/pi",
                "/runtime/bin/pi",
                good.clone(),
            ),
            base(
                "/opt/agentbox/artifacts/pi",
                "/runtime/artifacts/../pi",
                good.clone(),
            ),
            base(
                "/opt/agentbox/artifacts/pi",
                "/runtime/artifacts/.hidden",
                good.clone(),
            ),
            base(
                "/opt/agentbox/artifacts/pi",
                "/runtime/artifacts/pi",
                "sha256:short".into(),
            ),
            base(
                "/opt/agentbox/artifacts/pi",
                "/runtime/artifacts/pi",
                format!("sha256:{}", "z".repeat(64)),
            ),
        ] {
            assert_eq!(encode_bootstrap(&value), Err(FrameError::InvalidBootstrap));
        }
        let mut too_many = base("/opt/agentbox/artifacts/pi", "/runtime/artifacts/pi", good);
        too_many.runtime_artifacts = (0..MAX_RUNTIME_ARTIFACTS + 1)
            .map(|index| RuntimeArtifactAuthorization {
                path: format!("/opt/agentbox/artifacts/pi{index}"),
                target: format!("/runtime/artifacts/pi{index}"),
                digest: format!("sha256:{}", "d".repeat(64)),
            })
            .collect();
        assert_eq!(
            encode_bootstrap(&too_many),
            Err(FrameError::InvalidBootstrap)
        );
    }

    #[test]
    fn a_previous_generation_client_is_not_accepted_as_current() {
        // Work Order 40-B/41 clients sent protocolVersion 2. The bootstrap still
        // decodes — the handshake must be able to answer — but it is not the
        // current generation, so the Worker refuses instead of accepting a
        // bootstrap whose runtime artifact trees it would never verify.
        let previous = serde_json::json!({
            "workerVersion": "0.1.0",
            "workerDigest": format!("sha256:{}", "a".repeat(64)),
            "connectionId": "connection-test",
            "projectId": "project-test",
            "effectiveUser": "tester",
            "instanceNonce": "nonce-test",
            "serverInstanceId": "server-test",
            "leaseMs": 5_000,
            "protocolVersion": 2,
            "executables": [],
        });
        let payload = serde_json::to_vec(&previous).expect("previous bootstrap encodes");
        let encoded = encode_frame(&Frame::new(FrameKind::Hello, 0, 1, payload))
            .expect("previous bootstrap frame encodes");
        let decoded = decode_bootstrap(&encoded).expect("previous bootstrap decodes");
        assert_eq!(decoded.protocol_version, 2);
        assert_ne!(decoded.protocol_version, PROTOCOL_VERSION);
        assert!(decoded.runtime_artifacts.is_empty());
    }

    #[test]
    fn legacy_bootstrap_without_protocol_version_decodes_as_zero() {
        // A 40-B-era client sent no `protocolVersion`. It must decode (so the
        // handshake can answer) but carry 0, which the worker rejects loudly
        // instead of running with one-shot semantics.
        let legacy = serde_json::json!({
            "workerVersion": "0.1.0",
            "workerDigest": format!("sha256:{}", "a".repeat(64)),
            "connectionId": "connection-test",
            "projectId": "project-test",
            "effectiveUser": "tester",
            "instanceNonce": "nonce-test",
            "serverInstanceId": "server-test",
            "leaseMs": 5_000,
        });
        let payload = serde_json::to_vec(&legacy).expect("legacy bootstrap encodes");
        let encoded = encode_frame(&Frame::new(FrameKind::Hello, 0, 1, payload))
            .expect("legacy bootstrap frame encodes");
        let decoded = decode_bootstrap(&encoded).expect("legacy bootstrap decodes");
        assert_eq!(decoded.protocol_version, 0);
        assert_ne!(decoded.protocol_version, PROTOCOL_VERSION);
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }
}
