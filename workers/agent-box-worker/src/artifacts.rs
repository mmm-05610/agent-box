//! Immutable runtime artifact directory authorization.
//!
//! This is the Worker-side implementation of the identity defined by
//! `plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/artifacts.py`.
//! The two must agree byte for byte; `protocols/worker/golden/` holds the
//! fixtures both sides assert against.  Keep the two files in step — the
//! canonical encoding, its domain separator, the bounds, and the rejection
//! order are all part of the contract.
//!
//! The Worker is authoritative here: the Server never reads a tree, because a
//! runtime artifact source is a WSL path that only exists inside the
//! distribution this Worker runs in.

use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Read;
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};

pub const DOMAIN: &[u8] = b"agentbox-runtime-artifact-tree-v1\n";
/// Order-of-magnitude ceiling the work order allows for ordinary files.  The
/// same budget is charged for directories, so a directory bomb cannot grow the
/// entry count past it.
pub const MAX_ENTRIES: usize = 32_768;
/// Total file content bound (1 GiB), charged before a file is hashed.
pub const MAX_BYTES: u64 = 1024 * 1024 * 1024;
pub const MAX_PATH_BYTES: usize = 4096;
pub const TARGET_PREFIX: &str = "/runtime/artifacts/";
const HASH_CHUNK: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rejected {
    pub code: &'static str,
    pub message: String,
}

impl Rejected {
    fn new(code: &'static str, message: &str) -> Self {
        Self {
            code,
            message: message.to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeIdentity {
    pub digest: String,
    pub entries: usize,
    pub bytes: u64,
}

/// True for exactly `/runtime/artifacts/<stable-name>`.
pub fn valid_target(value: &str) -> bool {
    let Some(name) = value.strip_prefix(TARGET_PREFIX) else {
        return false;
    };
    if name.is_empty() || name.len() > 64 {
        return false;
    }
    let mut characters = name.chars();
    let first = characters.next().unwrap_or(' ');
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    name.chars()
        .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character))
}

/// True for a declaration the Server is allowed to have sent.
pub fn valid_declared_source(value: &str) -> bool {
    value.starts_with('/')
        && value.len() <= MAX_PATH_BYTES
        && !value.contains("//")
        && !value.ends_with('/')
        && !value.chars().any(|character| character.is_control())
        && value
            .split('/')
            .all(|component| !matches!(component, "." | ".."))
}

/// The canonical encoding of one tree, after every rejection rule has passed.
pub fn canonical_encoding(root: &Path) -> Result<Vec<u8>, Rejected> {
    canonical_encoding_bounded(root, MAX_ENTRIES, MAX_BYTES)
}

/// The same encoding under explicit bounds; production always uses the
/// module constants, tests use small ones to exercise the bounds cheaply.
pub fn canonical_encoding_bounded(
    root: &Path,
    max_entries: usize,
    max_bytes: u64,
) -> Result<Vec<u8>, Rejected> {
    let metadata = fs::symlink_metadata(root).map_err(|_| {
        Rejected::new(
            "RUNTIME_ARTIFACT_ROOT_INVALID",
            "runtime artifact root is unavailable",
        )
    })?;
    if metadata.file_type().is_symlink() {
        return Err(Rejected::new(
            "RUNTIME_ARTIFACT_ROOT_INVALID",
            "runtime artifact root must not be a symlink",
        ));
    }
    if !metadata.is_dir() {
        return Err(Rejected::new(
            "RUNTIME_ARTIFACT_ROOT_INVALID",
            "runtime artifact root must be a real directory",
        ));
    }
    let mut entries: Vec<(u8, Vec<u8>, u64, [u8; 32])> = Vec::new();
    let mut seen: HashSet<Vec<u8>> = HashSet::new();
    let mut total: u64 = 0;
    let mut pending: Vec<(PathBuf, Vec<u8>)> = vec![(root.to_path_buf(), Vec::new())];
    while let Some((directory, prefix)) = pending.pop() {
        for (name, location, shape, size) in children(&directory)? {
            let mut relative = prefix.clone();
            if !relative.is_empty() {
                relative.push(b'/');
            }
            relative.extend_from_slice(&name);
            validate_relative(&relative)?;
            let mut key = relative.clone();
            key.make_ascii_lowercase();
            if !seen.insert(key) {
                return Err(Rejected::new(
                    "RUNTIME_ARTIFACT_PATH_COLLISION",
                    "runtime artifact has a duplicate or case-colliding path",
                ));
            }
            if seen.len() > max_entries {
                return Err(Rejected::new(
                    "RUNTIME_ARTIFACT_OUTSIDE_BOUNDS",
                    "runtime artifact exceeds the entry bound",
                ));
            }
            match shape {
                Shape::Symlink => {
                    return Err(Rejected::new(
                        "RUNTIME_ARTIFACT_ENTRY_INVALID",
                        "runtime artifact contains a symlink",
                    ))
                }
                Shape::Directory => {
                    entries.push((b'd', relative.clone(), 0, [0u8; 32]));
                    pending.push((location, relative));
                }
                Shape::Special => {
                    return Err(Rejected::new(
                        "RUNTIME_ARTIFACT_ENTRY_INVALID",
                        "runtime artifact contains a special file",
                    ))
                }
                Shape::File => {
                    if total + size > max_bytes {
                        return Err(Rejected::new(
                            "RUNTIME_ARTIFACT_OUTSIDE_BOUNDS",
                            "runtime artifact exceeds the content bound",
                        ));
                    }
                    total += size;
                    let digest = file_digest(&location)?;
                    entries.push((b'f', relative, size, digest));
                }
            }
        }
    }
    entries.sort_by(|left, right| left.1.cmp(&right.1));
    let mut encoding = Vec::with_capacity(64 + entries.len() * 64);
    encoding.extend_from_slice(DOMAIN);
    encoding.extend_from_slice(&(entries.len() as u64).to_be_bytes());
    for (kind, relative, size, content) in &entries {
        encoding.push(*kind);
        encoding.extend_from_slice(&(relative.len() as u32).to_be_bytes());
        encoding.extend_from_slice(relative);
        if *kind == b'f' {
            encoding.extend_from_slice(&size.to_be_bytes());
            encoding.extend_from_slice(content);
        }
    }
    Ok(encoding)
}

/// The stable identity of one tree: digest, entry count and content bytes.
#[cfg_attr(not(test), allow(dead_code))]
pub fn tree_identity(root: &Path) -> Result<TreeIdentity, Rejected> {
    identify(canonical_encoding(root)?)
}

/// Verify one declared directory against its expected digest.
pub fn verify_declared(root: &Path, expected: &str) -> Result<TreeIdentity, Rejected> {
    let identity = identify(canonical_encoding(root)?)?;
    if identity.digest != expected {
        return Err(Rejected::new(
            "RUNTIME_ARTIFACT_DIGEST_MISMATCH",
            "runtime artifact tree digest did not match the declaration",
        ));
    }
    Ok(identity)
}

/// The stable digest of one tree.
#[cfg_attr(not(test), allow(dead_code))]
pub fn tree_digest(root: &Path) -> Result<String, Rejected> {
    Ok(identify(canonical_encoding(root)?)?.digest)
}

fn identify(encoding: Vec<u8>) -> Result<TreeIdentity, Rejected> {
    let invalid = || Rejected::new("RUNTIME_ARTIFACT_ROOT_INVALID", "encoding is invalid");
    let entries = u64::from_be_bytes(
        encoding
            .get(DOMAIN.len()..DOMAIN.len() + 8)
            .ok_or_else(invalid)?
            .try_into()
            .map_err(|_| invalid())?,
    ) as usize;
    let mut offset = DOMAIN.len() + 8;
    let mut bytes: u64 = 0;
    for _ in 0..entries {
        let kind = *encoding.get(offset).ok_or_else(invalid)?;
        let length = u32::from_be_bytes(
            encoding
                .get(offset + 1..offset + 5)
                .ok_or_else(invalid)?
                .try_into()
                .map_err(|_| invalid())?,
        ) as usize;
        offset += 5 + length;
        if kind == b'f' {
            bytes += u64::from_be_bytes(
                encoding
                    .get(offset..offset + 8)
                    .ok_or_else(invalid)?
                    .try_into()
                    .map_err(|_| invalid())?,
            );
            offset += 40;
        }
    }
    Ok(TreeIdentity {
        digest: "sha256:".to_string() + &hex(&Sha256::digest(&encoding)),
        entries,
        bytes,
    })
}

enum Shape {
    Directory,
    File,
    Symlink,
    Special,
}

fn children(directory: &Path) -> Result<Vec<(Vec<u8>, PathBuf, Shape, u64)>, Rejected> {
    let mut described = Vec::new();
    let scan = fs::read_dir(directory).map_err(|_| {
        Rejected::new(
            "RUNTIME_ARTIFACT_ENTRY_INVALID",
            "runtime artifact entry is unreadable",
        )
    })?;
    for item in scan {
        let entry = item.map_err(|_| {
            Rejected::new(
                "RUNTIME_ARTIFACT_ENTRY_INVALID",
                "runtime artifact entry is unreadable",
            )
        })?;
        let location = entry.path();
        let metadata = fs::symlink_metadata(&location).map_err(|_| {
            Rejected::new(
                "RUNTIME_ARTIFACT_ENTRY_INVALID",
                "runtime artifact entry is unreadable",
            )
        })?;
        let file_type = metadata.file_type();
        let shape = if file_type.is_symlink() {
            Shape::Symlink
        } else if file_type.is_dir() {
            Shape::Directory
        } else if file_type.is_file() {
            Shape::File
        } else {
            Shape::Special
        };
        described.push((
            entry.file_name().as_bytes().to_vec(),
            location,
            shape,
            metadata.len(),
        ));
    }
    described.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(described)
}

fn validate_relative(relative: &[u8]) -> Result<(), Rejected> {
    if relative.len() > MAX_PATH_BYTES {
        return Err(Rejected::new(
            "RUNTIME_ARTIFACT_PATH_INVALID",
            "runtime artifact path exceeds the bound",
        ));
    }
    if relative
        .iter()
        .any(|byte| !(0x21..=0x7e).contains(byte) && *byte != b'/')
    {
        return Err(Rejected::new(
            "RUNTIME_ARTIFACT_PATH_INVALID",
            "runtime artifact path must be printable ASCII without spaces",
        ));
    }
    if relative
        .split(|byte| *byte == b'/')
        .any(|component| component.is_empty() || component == b"." || component == b"..")
    {
        return Err(Rejected::new(
            "RUNTIME_ARTIFACT_PATH_INVALID",
            "runtime artifact path is not canonical",
        ));
    }
    Ok(())
}

fn file_digest(path: &Path) -> Result<[u8; 32], Rejected> {
    let mut file = File::open(path).map_err(|_| {
        Rejected::new(
            "RUNTIME_ARTIFACT_ENTRY_INVALID",
            "runtime artifact file is unreadable",
        )
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; HASH_CHUNK];
    loop {
        let count = file.read(&mut buffer).map_err(|_| {
            Rejected::new(
                "RUNTIME_ARTIFACT_ENTRY_INVALID",
                "runtime artifact file is unreadable",
            )
        })?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hasher.finalize().into())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::prelude::{Engine as _, BASE64_STANDARD as BASE64};

    fn repository_root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("protocols")
            .join("worker")
            .join("golden")
    }

    fn materialize(root: &Path, document: &serde_json::Value) {
        for entry in document["tree"].as_array().expect("tree entries").iter() {
            let path = root.join(entry["path"].as_str().expect("relative path"));
            if entry["kind"] == "dir" {
                fs::create_dir_all(&path).expect("directory");
                continue;
            }
            fs::create_dir_all(path.parent().expect("parent")).expect("parent");
            let content = BASE64
                .decode(entry["content_base64"].as_str().expect("content"))
                .expect("base64");
            fs::write(&path, content).expect("file");
        }
    }

    #[test]
    fn golden_fixtures_match_the_python_canonical_encoding() {
        for name in [
            "runtime-artifact-tree-v1.json",
            "runtime-artifact-tree-v1-single.json",
        ] {
            let document: serde_json::Value = serde_json::from_slice(
                &fs::read(repository_root().join(name)).expect("golden fixture"),
            )
            .expect("golden JSON");
            let temporary = tempfile::tempdir().expect("temp dir");
            let root = temporary.path().join("tree");
            fs::create_dir(&root).expect("tree root");
            materialize(&root, &document);
            let encoding = canonical_encoding(&root).expect("encoding");
            assert_eq!(
                hex(&encoding),
                document["canonical_encoding_hex"],
                "{name} encoding"
            );
            let identity = tree_identity(&root).expect("identity");
            assert_eq!(
                identity.entries,
                document["entries"].as_u64().expect("entries") as usize,
                "{name} entry count"
            );
            assert_eq!(
                identity.bytes,
                document["bytes"].as_u64().expect("bytes"),
                "{name} byte count"
            );
            assert_eq!(
                tree_digest(&root).expect("digest"),
                document["digest"].as_str().expect("digest"),
                "{name} digest"
            );
            assert!(verify_declared(&root, document["digest"].as_str().unwrap()).is_ok());
            assert_eq!(
                verify_declared(&root, &format!("sha256:{}", "0".repeat(64)))
                    .expect_err("drift must be refused")
                    .code,
                "RUNTIME_ARTIFACT_DIGEST_MISMATCH"
            );
        }
    }

    #[test]
    fn identity_is_order_independent_and_content_sensitive() {
        let temporary = tempfile::tempdir().expect("temp dir");
        let root = temporary.path().join("tree");
        fs::create_dir_all(root.join("b")).expect("dirs");
        fs::write(root.join("a.txt"), b"one").expect("file");
        fs::write(root.join("b").join("c.txt"), b"two").expect("file");
        let first = tree_identity(&root).expect("identity");
        assert_eq!(first.entries, 3);
        assert_eq!(first.bytes, 6);
        fs::write(root.join("b").join("c.txt"), b"TWO").expect("rewrite");
        assert_ne!(tree_digest(&root).expect("digest"), first.digest);
        fs::write(root.join("b").join("c.txt"), b"two").expect("restore");
        assert_eq!(tree_digest(&root).expect("digest"), first.digest);
    }

    #[test]
    fn rejects_symlink_root_inner_symlink_and_special_files() {
        let temporary = tempfile::tempdir().expect("temp dir");
        let real = temporary.path().join("real");
        fs::create_dir(&real).expect("dir");
        fs::write(real.join("a.txt"), b"one").expect("file");
        let link = temporary.path().join("link");
        std::os::unix::fs::symlink(&real, &link).expect("symlink root");
        assert_eq!(
            tree_digest(&link).expect_err("symlink root").code,
            "RUNTIME_ARTIFACT_ROOT_INVALID"
        );

        let inner = temporary.path().join("inner");
        fs::create_dir(&inner).expect("dir");
        std::os::unix::fs::symlink(real.join("a.txt"), inner.join("a.txt")).expect("symlink");
        assert_eq!(
            tree_digest(&inner).expect_err("inner symlink").code,
            "RUNTIME_ARTIFACT_ENTRY_INVALID"
        );

        let special = temporary.path().join("special");
        fs::create_dir(&special).expect("dir");
        let fifo = special.join("pipe");
        let encoded = std::ffi::CString::new(fifo.as_os_str().as_bytes()).expect("fifo path");
        assert_eq!(
            unsafe { libc::mkfifo(encoded.as_ptr(), 0o600) },
            0,
            "mkfifo"
        );
        assert_eq!(
            tree_digest(&special).expect_err("fifo").code,
            "RUNTIME_ARTIFACT_ENTRY_INVALID"
        );
    }

    #[test]
    fn rejects_case_collisions_non_ascii_paths_and_bounds() {
        let temporary = tempfile::tempdir().expect("temp dir");
        let colliding = temporary.path().join("colliding");
        fs::create_dir(&colliding).expect("dir");
        fs::write(colliding.join("A.txt"), b"one").expect("file");
        fs::write(colliding.join("a.txt"), b"two").expect("file");
        assert_eq!(
            tree_digest(&colliding).expect_err("case collision").code,
            "RUNTIME_ARTIFACT_PATH_COLLISION"
        );

        let unicode = temporary.path().join("unicode");
        fs::create_dir(&unicode).expect("dir");
        fs::write(unicode.join("café.txt"), b"one").expect("file");
        assert_eq!(
            tree_digest(&unicode).expect_err("non ascii").code,
            "RUNTIME_ARTIFACT_PATH_INVALID"
        );

        let bounded = temporary.path().join("bounded");
        fs::create_dir(&bounded).expect("dir");
        for name in ["a.txt", "b.txt", "c.txt"] {
            fs::write(bounded.join(name), b"one").expect("file");
        }
        assert_eq!(
            canonical_encoding_bounded(&bounded, 2, MAX_BYTES)
                .expect_err("entries")
                .code,
            "RUNTIME_ARTIFACT_OUTSIDE_BOUNDS"
        );
        assert_eq!(
            canonical_encoding_bounded(&bounded, MAX_ENTRIES, 2)
                .expect_err("bytes")
                .code,
            "RUNTIME_ARTIFACT_OUTSIDE_BOUNDS"
        );
        assert!(canonical_encoding_bounded(&bounded, 3, 9).is_ok());
        assert_eq!(MAX_ENTRIES, 32_768);
        assert_eq!(MAX_BYTES, 1024 * 1024 * 1024);
        assert!(valid_target("/runtime/artifacts/pi-node-modules"));
        for target in [
            "/runtime/artifacts/",
            "/runtime/artifacts/../escape",
            "/runtime/artifacts/a/b",
            "/runtime/artifacts/.hidden",
            "/tmp/artifacts/pi",
            "/runtime/view/pi",
        ] {
            assert!(!valid_target(target), "{target} must be refused");
        }
    }
}
