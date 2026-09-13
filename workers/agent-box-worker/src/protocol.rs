//! ABW1 bounded frames, extracted from the old Worker protocol.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const MAGIC: [u8; 4] = *b"ABW1";
pub const VERSION: u16 = 1;
pub const HEADER_LEN: usize = 60;
pub const MAX_PAYLOAD: usize = 64 * 1024;

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
    #[serde(default)]
    pub executables: Vec<ExecutableAuthorization>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutableAuthorization {
    pub path: String,
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
            executables: Vec::new(),
        };
        assert_eq!(
            decode_bootstrap(&encode_bootstrap(&value).unwrap()).unwrap(),
            value
        );
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }
}
