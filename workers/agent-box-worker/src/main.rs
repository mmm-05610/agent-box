mod artifacts;
mod protocol;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use protocol::{
    decode_bootstrap, decode_frame, encode_frame, Frame, FrameKind, HEADER_LEN, MAX_PAYLOAD,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::os::unix::io::{AsRawFd, FromRawFd, RawFd};
use std::os::unix::process::CommandExt;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::{mpsc, watch};
use tokio::task::JoinSet;

const WORKER_VERSION: &str = "0.1.0";
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const MAX_ARTIFACT_BYTES: usize = 64 * 1024 * 1024;
/// Every entry a view listing visits - directory, file, skipped symlink or
/// special file - counts against this bound, so a tree of empty directories or
/// dangling links cannot be walked without limit.
const MAX_VIEW_TRAVERSAL_ENTRIES: usize = 4096;
const MAX_FETCH_BYTES: usize = 32 * 1024;
const MAX_SECRET_BYTES: usize = 1024 * 1024;
const MAX_WORKSPACE_FILE_BYTES: usize = 8 * 1024 * 1024;
const MAX_STDIN_BYTES: usize = 4 * 1024;
const MAX_INTERACTIVE_WRITE_BYTES: usize = 64 * 1024;
/// Pre-terminal forwarding budget per interactive attempt. Once exceeded, the
/// worker emits one truncated marker and stops forwarding; the bounded final
/// buffers still record complete digests.
const MAX_INTERACTIVE_EVENT_BYTES: usize = 1024 * 1024;
const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_TIMEOUT_MS: u64 = 120_000;
const RESULT_TTL_SECS: u64 = 300;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    request_id: String,
    connection_id: String,
    server_instance_id: String,
    op: String,
    #[serde(default)]
    attempt_id: Option<String>,
    #[serde(default)]
    generation: Option<u64>,
    #[serde(default)]
    arguments: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProcessRecord {
    attempt_id: String,
    generation: u64,
    exit_code: Option<i32>,
    timed_out: bool,
    cancelled: bool,
    output_exceeded: bool,
    stdout_bytes: usize,
    stderr_bytes: usize,
    stdout_digest: String,
    stderr_digest: String,
}

struct Running {
    generation: u64,
    cancel: watch::Sender<bool>,
    /// Interactive attempts receive their child stdin through this slot once
    /// the child has spawned. `stdin.close` takes the handle out and drops it:
    /// tokio pipes have no half-close, so EOF is delivered by closing the fd.
    interactive_stdin: Option<
        Arc<tokio::sync::OnceCell<Arc<tokio::sync::Mutex<Option<tokio::process::ChildStdin>>>>>,
    >,
}

struct Finished {
    generation: u64,
    finished_at: Instant,
}

struct ProcessOutcome {
    record: ProcessRecord,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

#[tokio::main]
async fn main() -> io::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() == 2 && args[1] == "--version-json" {
        println!(
            "{}",
            json!({"workerVersion": WORKER_VERSION, "wireVersion": 1})
        );
        return Ok(());
    }
    if args.get(1).map(String::as_str) == Some("--cleanup-manifest") {
        return cleanup_from_manifest(&args);
    }
    let (root, workspace, home_root, result_ttl_secs) = arguments(&args)?;
    let root = root.ok_or_else(|| io::Error::other("--root is required"))?;
    let root = prepare_root(Path::new(&root))?;
    let workspace = match workspace {
        Some(path) => Some(canonical_directory(Path::new(&path))?),
        None => None,
    };
    // The persistent home lives for years while the ephemeral root is deleted
    // on exit; the two must never be nested, or one lifetime would destroy the
    // other's facts.
    let home_root = match home_root {
        Some(path) => Path::new(&path).to_path_buf(),
        None => default_home_root()?,
    };
    fs::create_dir_all(&home_root)?;
    let home_root = canonical_directory(&home_root)?;
    ensure_home_outside_root(&home_root, &root)?;
    let ephemeral = workspace.is_none();
    let outcome = serve(root.clone(), workspace, home_root, result_ttl_secs).await;
    if ephemeral
        && fs::read_to_string(root.join(".agentbox-worker-root"))
            .ok()
            .as_deref()
            == Some("agentbox-worker-r1\n")
    {
        let _ = fs::remove_dir_all(&root);
    }
    outcome
}

fn arguments(args: &[String]) -> io::Result<(Option<String>, Option<String>, Option<String>, u64)> {
    let mut root = None;
    let mut workspace = None;
    let mut home_root = None;
    let mut result_ttl_secs = RESULT_TTL_SECS;
    let mut index = 1;
    while index < args.len() {
        if index + 1 >= args.len() {
            return Err(io::Error::other("malformed arguments"));
        }
        match args[index].as_str() {
            "--root" | "--workspace" | "--home-root" => {
                let target = match args[index].as_str() {
                    "--root" => &mut root,
                    "--workspace" => &mut workspace,
                    _ => &mut home_root,
                };
                if target.is_some() {
                    return Err(io::Error::other("malformed arguments"));
                }
                *target = Some(args[index + 1].clone());
            }
            "--result-ttl-seconds" => {
                result_ttl_secs = args[index + 1]
                    .parse()
                    .map_err(|_| io::Error::other("invalid result TTL"))?;
                if !(1..=3600).contains(&result_ttl_secs) {
                    return Err(io::Error::other("invalid result TTL"));
                }
            }
            _ => return Err(io::Error::other("unknown argument")),
        }
        index += 2;
    }
    Ok((root, workspace, home_root, result_ttl_secs))
}

async fn serve(
    root: PathBuf,
    workspace: Option<PathBuf>,
    home_root: PathBuf,
    result_ttl_secs: u64,
) -> io::Result<()> {
    let mut input = tokio::io::stdin();
    let mut output = tokio::io::stdout();
    let bootstrap = decode_bootstrap(&read_encoded(&mut input).await?)
        .map_err(|error| io::Error::other(error.to_string()))?;
    let executable = std::env::current_exe()?;
    let executable_digest = digest(&fs::read(executable)?);
    if executable_digest != bootstrap.worker_digest {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "worker digest mismatch",
        ));
    }
    let effective = std::env::var("USER").unwrap_or_default();
    if effective != bootstrap.effective_user {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "effective user mismatch",
        ));
    }
    if bootstrap.protocol_version != protocol::PROTOCOL_VERSION {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!(
                "PROTOCOL_VERSION_UNSUPPORTED: client bootstrap {} != worker {}",
                bootstrap.protocol_version,
                protocol::PROTOCOL_VERSION
            ),
        ));
    }
    let authorized_executables = authorize_executables(&bootstrap.executables)?;
    let authorized_artifacts = match authorize_runtime_artifacts(
        &bootstrap.runtime_artifacts,
        workspace.as_deref(),
        &root,
    ) {
        Ok(value) => value,
        Err(rejection) => {
            // Refuse with a typed frame before exiting: a digest that does not
            // match the declaration must be classifiable by the caller, not
            // flattened into a generic disconnect.
            write_error(&mut output, 1, rejection.code, &rejection.message).await?;
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                format!("{}: {}", rejection.code, rejection.message),
            ));
        }
    };
    write_json(
        &mut output,
        FrameKind::HelloAck,
        0,
        1,
        &json!({
            "workerVersion": WORKER_VERSION, "wireVersion": 1,
            "protocolVersion": protocol::PROTOCOL_VERSION,
            "workerDigest": executable_digest,
            "connectionId": bootstrap.connection_id,
            "serverInstanceId": bootstrap.server_instance_id,
            "capabilities": capabilities(), "limits": limits(result_ttl_secs),
        }),
    )
    .await?;

    // AsyncReadExt::read_exact is not cancellation-safe. Keep control input in
    // one task so select branches cannot consume and discard a partial frame.
    let (input_tx, mut input_rx) = mpsc::channel(8);
    tokio::spawn(async move {
        loop {
            let frame = read_encoded(&mut input).await;
            let done = frame.is_err();
            if input_tx.send(frame).await.is_err() || done {
                break;
            }
        }
    });

    let lease = Duration::from_millis(bootstrap.lease_ms);
    let mut lease_deadline = Instant::now() + lease;
    let mut sequence = 2u64;
    let mut running: HashMap<String, Running> = HashMap::new();
    let mut finished: HashMap<String, Finished> = HashMap::new();
    let mut tasks: JoinSet<(String, io::Result<ProcessOutcome>)> = JoinSet::new();
    let mut tick = tokio::time::interval(Duration::from_millis(100));
    let (event_tx, mut event_rx) = mpsc::channel::<Value>(256);

    loop {
        tokio::select! {
            // event_tx lives for the whole loop, so recv() stays pending
            // (never None) whenever no interactive output is queued.
            event = event_rx.recv() => {
                if let Some(event) = event {
                    write_json(&mut output, FrameKind::Data, 0, sequence, &event).await?;
                    sequence += 1;
                }
            }
            frame = input_rx.recv() => {
                let encoded = match frame.unwrap_or_else(|| Err(io::Error::new(io::ErrorKind::UnexpectedEof, "control reader stopped"))) {
                    Ok(value) => value,
                    Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => {
                        for item in running.values() { let _ = item.cancel.send(true); }
                        while let Some(_) = tasks.join_next().await {}
                        let _ = fs::remove_dir_all(root.join("secrets"));
                        let _ = fs::remove_dir_all(root.join("views"));
                        schedule_result_cleanup(&root, result_ttl_secs)?;
                        return Ok(());
                    }
                    Err(error) => return Err(error),
                };
                let frame = match decode_frame(&encoded) {
                    Ok(value) if value.kind == FrameKind::Data => value,
                    Ok(_) => { write_error(&mut output, sequence, "FRAME_KIND_INVALID", "expected data request").await?; sequence += 1; continue; }
                    Err(error) => { write_error(&mut output, sequence, "FRAME_INVALID", &error.to_string()).await?; sequence += 1; continue; }
                };
                let request: Request = match serde_json::from_slice(&frame.payload) {
                    Ok(value) => value,
                    Err(_) => { write_error(&mut output, sequence, "REQUEST_INVALID", "request JSON is invalid").await?; sequence += 1; continue; }
                };
                if !valid_id(&request.request_id) || request.connection_id != bootstrap.connection_id || request.server_instance_id != bootstrap.server_instance_id {
                    write_error(&mut output, sequence, "IDENTITY_MISMATCH", "request identity does not match bootstrap").await?;
                    sequence += 1; continue;
                }
                lease_deadline = Instant::now() + lease;
                match request.op.as_str() {
                    "handshake" | "heartbeat" => {
                        write_response(&mut output, sequence, &request.request_id, json!({"status":"ok","capabilities":capabilities(),"limits":limits(result_ttl_secs)})).await?;
                    }
                    "browse" => match browse(&request.arguments) {
                        Ok(value) => write_response(&mut output, sequence, &request.request_id, value).await?,
                        Err((code, message)) => write_error_for(&mut output, sequence, &request.request_id, code, message).await?,
                    },
                    "canonicalize" => match canonicalize(&request.arguments) {
                        Ok(value) => write_response(&mut output, sequence, &request.request_id, value).await?,
                        Err((code, message)) => write_error_for(&mut output, sequence, &request.request_id, code, message).await?,
                    },
                    "workspace.get" => {
                        let result = workspace.as_ref()
                            .ok_or(("WORKSPACE_UNAUTHORIZED", "worker has no authorized workspace"))
                            .and_then(|workspace| workspace_get(workspace, &request.arguments));
                        match result {
                            Ok(value) => write_response(&mut output, sequence, &request.request_id, value).await?,
                            Err((code, message)) => write_error_for(&mut output, sequence, &request.request_id, code, message).await?,
                        }
                    }
                    "view.prepare" | "view.put" | "view.commit" | "view.list" | "view.get" | "view.cleanup" => {
                        match handle_view(&root, &request.op, &request.arguments) {
                            Ok(value) => write_response(&mut output, sequence, &request.request_id, value).await?,
                            Err((code, message)) => write_error_for(&mut output, sequence, &request.request_id, code, message).await?,
                        }
                    }
                    "home.prepare" | "home.list" | "home.get" | "home.delete" => {
                        match handle_home(&home_root, &request.op, &request.arguments) {
                            Ok(value) => write_response(&mut output, sequence, &request.request_id, value).await?,
                            Err((code, message)) => write_error_for(&mut output, sequence, &request.request_id, code, message).await?,
                        }
                    }
                    "secret.put" | "secret.cleanup" => {
                        match handle_secret(&root, &request.op, &request.arguments) {
                            Ok(value) => write_response(&mut output, sequence, &request.request_id, value).await?,
                            Err((code, message)) => write_error_for(&mut output, sequence, &request.request_id, code, message).await?,
                        }
                    }
                    "spawn" => {
                        let Some(attempt_id) = request.attempt_id.filter(|value| valid_id(value)) else {
                            write_error_for(&mut output, sequence, &request.request_id, "ATTEMPT_INVALID", "attempt identity is required").await?; sequence += 1; continue;
                        };
                        let Some(generation) = request.generation.filter(|value| *value > 0) else {
                            write_error_for(&mut output, sequence, &request.request_id, "ATTEMPT_INVALID", "generation is required").await?; sequence += 1; continue;
                        };
                        if running.contains_key(&attempt_id) || result_dir(&root, &attempt_id, generation).exists() {
                            write_error_for(&mut output, sequence, &request.request_id, "ATTEMPT_EXISTS", "attempt identity already exists").await?; sequence += 1; continue;
                        }
                        let Some(workspace) = workspace.clone() else {
                            write_error_for(&mut output, sequence, &request.request_id, "WORKSPACE_UNAUTHORIZED", "worker has no authorized workspace").await?; sequence += 1; continue;
                        };
                        let spec = match parse_spawn(
                            &request.arguments, &workspace, &root, &home_root,
                            &authorized_executables, &authorized_artifacts,
                        ) {
                            Ok(value) => value,
                            Err((code, message)) => { write_error_for(&mut output, sequence, &request.request_id, code, message).await?; sequence += 1; continue; }
                        };
                        let (cancel_tx, cancel_rx) = watch::channel(false);
                        // Interactive attempts receive their child stdin handle
                        // through this slot once run_process has spawned.
                        let stdin_slot = Arc::new(tokio::sync::OnceCell::new());
                        running.insert(
                            attempt_id.clone(),
                            Running {
                                generation,
                                cancel: cancel_tx,
                                interactive_stdin: if spec.interactive { Some(stdin_slot.clone()) } else { None },
                            },
                        );
                        let task_root = root.clone();
                        let task_id = attempt_id.clone();
                        let task_events = event_tx.clone();
                        tasks.spawn(async move {
                            let mut outcome = run_process(
                                spec, cancel_rx, task_events,
                                (task_id.clone(), generation),
                                Some(stdin_slot),
                            )
                            .await;
                            if let Ok(value) = &mut outcome {
                                value.record.attempt_id = task_id.clone();
                                value.record.generation = generation;
                            }
                            if let Ok(value) = &outcome { let _ = persist_result(&task_root, value); }
                            (task_id, outcome)
                        });
                        write_response(&mut output, sequence, &request.request_id, json!({"status":"accepted","attemptId":attempt_id,"generation":generation})).await?;
                    }
                    "observe" => {
                        match exact_attempt(&request) {
                            Ok((attempt_id, generation)) if running.get(attempt_id).is_some_and(|item| item.generation == generation) =>
                                write_response(&mut output, sequence, &request.request_id, json!({"status":"running","attemptId":attempt_id,"generation":generation})).await?,
                            Ok((attempt_id, generation)) => match load_record(&root, attempt_id, generation) {
                                Ok(record) => write_response(&mut output, sequence, &request.request_id, json!({"status":"terminal","result":record})).await?,
                                Err(_) => write_error_for(&mut output, sequence, &request.request_id, "ATTEMPT_UNKNOWN", "attempt is unknown").await?,
                            },
                            Err((code,message)) => write_error_for(&mut output, sequence, &request.request_id, code, message).await?,
                        }
                    }
                    "cancel" => match exact_attempt(&request) {
                        Ok((attempt_id, generation)) => {
                            let accepted = running.get(attempt_id).filter(|item| item.generation == generation).map(|item| item.cancel.send(true).is_ok()).unwrap_or(false);
                            write_response(&mut output, sequence, &request.request_id, json!({"status":"cancelRequested","accepted":accepted})).await?;
                        }
                        Err((code,message)) => write_error_for(&mut output, sequence, &request.request_id, code, message).await?,
                    },
                    "attempt.write" | "stdin.close" => match exact_attempt(&request) {
                        Ok((attempt_id, generation)) => {
                            let running_entry = running.get(attempt_id).filter(|item| item.generation == generation);
                            let slot = running_entry.and_then(|item| item.interactive_stdin.clone());
                            let Some(slot) = slot else {
                                write_error_for(&mut output, sequence, &request.request_id, "ATTEMPT_NOT_INTERACTIVE", "attempt does not accept stdin writes").await?;
                                sequence += 1; continue;
                            };
                            let handle = slot.get().cloned();
                            let Some(handle) = handle else {
                                write_error_for(&mut output, sequence, &request.request_id, "ATTEMPT_NOT_READY", "interactive child has not spawned").await?;
                                sequence += 1; continue;
                            };
                            if request.op == "stdin.close" {
                                // tokio pipes have no half-close, so EOF is
                                // delivered by dropping the handle (fd close).
                                let mut stdin = handle.lock().await;
                                let taken = stdin.take();
                                drop(stdin);
                                match taken {
                                    Some(mut child_stdin) => {
                                        let _ = child_stdin.shutdown().await;
                                        drop(child_stdin);
                                        write_response(&mut output, sequence, &request.request_id, json!({"closed": true})).await?
                                    }
                                    None => write_error_for(&mut output, sequence, &request.request_id, "ATTEMPT_STDIN_CLOSED", "child stdin is no longer open").await?,
                                }
                                sequence += 1; continue;
                            }
                            let payload = request.arguments.get("data").and_then(|value| value.as_str()).and_then(|value| BASE64.decode(value).ok());
                            let Some(bytes) = payload else {
                                write_error_for(&mut output, sequence, &request.request_id, "STDIN_INVALID", "stdin chunk payload is invalid").await?;
                                sequence += 1; continue;
                            };
                            if bytes.len() > MAX_INTERACTIVE_WRITE_BYTES {
                                write_error_for(&mut output, sequence, &request.request_id, "STDIN_INVALID", "stdin chunk exceeds bound").await?;
                                sequence += 1; continue;
                            }
                            let mut stdin = handle.lock().await;
                            let write = match stdin.as_mut() {
                                Some(child_stdin) => child_stdin.write_all(&bytes).await.map(|_| bytes.len()),
                                None => Err(io::Error::new(io::ErrorKind::BrokenPipe, "stdin closed")),
                            };
                            drop(stdin);
                            match write {
                                Ok(written) => write_response(&mut output, sequence, &request.request_id, json!({"written": written})).await?,
                                Err(_) => write_error_for(&mut output, sequence, &request.request_id, "ATTEMPT_STDIN_CLOSED", "child stdin is no longer open").await?,
                            }
                        }
                        Err((code,message)) => write_error_for(&mut output, sequence, &request.request_id, code, message).await?,
                    },
                    "result.get" | "result.ack" | "attempt.cleanup" => match handle_result(&root, &request) {
                        Ok(value) => write_response(&mut output, sequence, &request.request_id, value).await?,
                        Err((code,message)) => write_error_for(&mut output, sequence, &request.request_id, code, message).await?,
                    },
                    _ => write_error_for(&mut output, sequence, &request.request_id, "OP_UNSUPPORTED", "operation is unsupported").await?,
                }
                sequence += 1;
            }
            joined = tasks.join_next(), if !tasks.is_empty() => {
                if let Some(Ok((attempt_id, result))) = joined {
                    if let Some(active) = running.remove(&attempt_id) {
                        match result {
                            Ok(outcome) => {
                                let generation = active.generation;
                                finished.insert(attempt_id.clone(), Finished { generation, finished_at: Instant::now() });
                                // Pre-terminal events must reach the client before
                                // the terminal frame, including whatever is still
                                // queued in the shared event channel.
                                while let Ok(event) = event_rx.try_recv() {
                                    write_json(&mut output, FrameKind::Data, 0, sequence, &event).await?;
                                    sequence += 1;
                                }
                                write_json(&mut output, FrameKind::Exit, 0, sequence, &json!({"event":"process.terminal","result":outcome.record})).await?;
                            }
                            Err(_) => write_error(&mut output, sequence, "PROCESS_FAILED", "process execution failed").await?,
                        }
                        sequence += 1;
                    }
                }
            }
            _ = tick.tick() => {
                if Instant::now() >= lease_deadline {
                    for item in running.values() { let _ = item.cancel.send(true); }
                    lease_deadline = Instant::now() + lease;
                }
                let expired: Vec<_> = finished.iter().filter(|(_, item)| item.finished_at.elapsed() >= Duration::from_secs(result_ttl_secs)).map(|(id,item)|(id.clone(),item.generation)).collect();
                for (id,generation) in expired { let _ = fs::remove_dir_all(result_dir(&root,&id,generation)); finished.remove(&id); }
            }
        }
    }
}

fn capabilities() -> Value {
    json!([
        "browse@1",
        "workspace.read@1",
        "view@1",
        "secret@1",
        "spawn@1",
        "spawn.interactive@2",
        "attempt.write@2",
        "runtime.artifact.mount@3",
        "home@4",
        "observe@1",
        "cancel@1",
        "result@1",
        "lease@1"
    ])
}
fn limits(result_ttl_secs: u64) -> Value {
    json!({"frameBytes":MAX_PAYLOAD,"outputBytes":MAX_OUTPUT_BYTES,"artifactBytes":MAX_ARTIFACT_BYTES,"workspaceFileBytes":MAX_WORKSPACE_FILE_BYTES,"fetchBytes":MAX_FETCH_BYTES,"secretBytes":MAX_SECRET_BYTES,"stdinBytes":MAX_STDIN_BYTES,"defaultTimeoutMs":DEFAULT_TIMEOUT_MS,"maxTimeoutMs":MAX_TIMEOUT_MS,"resultTtlSeconds":result_ttl_secs})
}

fn schedule_result_cleanup(root: &Path, delay_secs: u64) -> io::Result<()> {
    let results = root.join("results");
    let mut names = Vec::new();
    if results.is_dir() {
        for entry in fs::read_dir(&results)? {
            let entry = entry?;
            let kind = entry.file_type()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if kind.is_dir() && !kind.is_symlink() && safe_cleanup_name(&name) {
                names.push(name);
            }
        }
    }
    if names.is_empty() {
        return Ok(());
    }
    names.sort();
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?
        .as_nanos();
    let manifest = root.join(format!(".cleanup-{}-{stamp}.json", std::process::id()));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true).mode(0o600);
    use std::io::Write;
    options
        .open(&manifest)?
        .write_all(&serde_json::to_vec(&names).map_err(io::Error::other)?)?;
    let executable = std::env::current_exe()?;
    let child = std::process::Command::new(executable)
        .args([
            "--cleanup-manifest",
            manifest
                .to_str()
                .ok_or_else(|| io::Error::other("cleanup path is not UTF-8"))?,
            "--delay-seconds",
            &delay_secs.to_string(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    if let Err(error) = child {
        let _ = fs::remove_file(manifest);
        return Err(error);
    }
    Ok(())
}

fn cleanup_from_manifest(args: &[String]) -> io::Result<()> {
    if args.len() != 5 || args[3] != "--delay-seconds" {
        return Err(io::Error::other("malformed cleanup arguments"));
    }
    let delay: u64 = args[4]
        .parse()
        .map_err(|_| io::Error::other("invalid cleanup delay"))?;
    if !(1..=3600).contains(&delay) {
        return Err(io::Error::other("invalid cleanup delay"));
    }
    let manifest = Path::new(&args[2]).canonicalize()?;
    let name = manifest
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let root = manifest
        .parent()
        .ok_or_else(|| io::Error::other("cleanup manifest has no root"))?;
    if !name.starts_with(".cleanup-")
        || !name.ends_with(".json")
        || fs::read_to_string(root.join(".agentbox-worker-root"))? != "agentbox-worker-r1\n"
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "cleanup ownership validation failed",
        ));
    }
    let names: Vec<String> =
        serde_json::from_slice(&fs::read(&manifest)?).map_err(io::Error::other)?;
    if names.iter().any(|value| !safe_cleanup_name(value)) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "cleanup manifest contains an invalid path",
        ));
    }
    std::thread::sleep(Duration::from_secs(delay));
    if fs::read_to_string(root.join(".agentbox-worker-root"))? != "agentbox-worker-r1\n" {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "cleanup ownership changed",
        ));
    }
    for name in names {
        let _ = fs::remove_dir_all(root.join("results").join(name));
    }
    fs::remove_file(manifest)
}

fn safe_cleanup_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && Path::new(value)
            .components()
            .all(|item| matches!(item, Component::Normal(_)))
}

async fn read_encoded<R: AsyncRead + Unpin>(reader: &mut R) -> io::Result<Vec<u8>> {
    let mut header = [0u8; HEADER_LEN];
    reader.read_exact(&mut header).await?;
    let length = u32::from_be_bytes(header[24..28].try_into().unwrap()) as usize;
    if length > MAX_PAYLOAD {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "frame too large",
        ));
    }
    let mut result = header.to_vec();
    let mut payload = vec![0u8; length];
    reader.read_exact(&mut payload).await?;
    result.extend_from_slice(&payload);
    Ok(result)
}

async fn write_json<W: AsyncWrite + Unpin>(
    writer: &mut W,
    kind: FrameKind,
    stream: u64,
    sequence: u64,
    value: &Value,
) -> io::Result<()> {
    let payload = serde_json::to_vec(value).map_err(io::Error::other)?;
    let encoded = encode_frame(&Frame::new(kind, stream, sequence, payload))
        .map_err(|e| io::Error::other(e.to_string()))?;
    writer.write_all(&encoded).await?;
    writer.flush().await
}
async fn write_response<W: AsyncWrite + Unpin>(
    writer: &mut W,
    sequence: u64,
    request_id: &str,
    value: Value,
) -> io::Result<()> {
    write_json(
        writer,
        FrameKind::Data,
        0,
        sequence,
        &json!({"requestId":request_id,"ok":true,"result":value}),
    )
    .await
}
async fn write_error<W: AsyncWrite + Unpin>(
    writer: &mut W,
    sequence: u64,
    code: &str,
    message: &str,
) -> io::Result<()> {
    write_json(
        writer,
        FrameKind::WorkerError,
        0,
        sequence,
        &json!({"ok":false,"error":{"code":code,"message":message}}),
    )
    .await
}
async fn write_error_for<W: AsyncWrite + Unpin>(
    writer: &mut W,
    sequence: u64,
    request_id: &str,
    code: &str,
    message: &str,
) -> io::Result<()> {
    write_json(
        writer,
        FrameKind::WorkerError,
        0,
        sequence,
        &json!({"requestId":request_id,"ok":false,"error":{"code":code,"message":message}}),
    )
    .await
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}
fn value_string<'a>(value: &'a Value, key: &str) -> Result<&'a str, (&'static str, &'static str)> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty())
        .ok_or(("REQUEST_INVALID", "required string is missing"))
}
fn prepare_root(path: &Path) -> io::Result<PathBuf> {
    let marker = path.join(".agentbox-worker-root");
    if path.exists() && !marker.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "worker root owner marker is missing",
        ));
    }
    fs::create_dir_all(path)?;
    if marker.exists() {
        if fs::read_to_string(&marker)? != "agentbox-worker-r1\n" {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "worker root owner marker is invalid",
            ));
        }
    } else {
        fs::write(&marker, b"agentbox-worker-r1\n")?;
    }
    let root = path.canonicalize()?;
    fs::set_permissions(&root, fs::Permissions::from_mode(0o700))?;
    Ok(root)
}
fn canonical_directory(path: &Path) -> io::Result<PathBuf> {
    let value = path.canonicalize()?;
    if !value.is_dir() {
        return Err(io::Error::other("not a directory"));
    }
    Ok(value)
}

fn browse(arguments: &Value) -> Result<Value, (&'static str, &'static str)> {
    let path = canonical_directory(Path::new(value_string(arguments, "path")?))
        .map_err(|_| ("PATH_UNAVAILABLE", "directory is unavailable"))?;
    let mut directories = Vec::new();
    let entries =
        fs::read_dir(&path).map_err(|_| ("PATH_UNAVAILABLE", "directory cannot be read"))?;
    for entry in entries.take(513) {
        let entry = entry.map_err(|_| ("PATH_UNAVAILABLE", "directory cannot be read"))?;
        let ty = entry
            .file_type()
            .map_err(|_| ("PATH_UNAVAILABLE", "entry cannot be read"))?;
        if ty.is_dir() && !ty.is_symlink() {
            directories.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    if directories.len() > 512 {
        return Err((
            "DIRECTORY_LIMIT_EXCEEDED",
            "directory has too many children",
        ));
    }
    directories.sort();
    Ok(json!({"path":path,"directories":directories}))
}
fn canonicalize(arguments: &Value) -> Result<Value, (&'static str, &'static str)> {
    let path = canonical_directory(Path::new(value_string(arguments, "path")?))
        .map_err(|_| ("PATH_UNAVAILABLE", "directory is unavailable"))?;
    Ok(json!({"path":path}))
}

fn workspace_get(
    workspace: &Path,
    arguments: &Value,
) -> Result<Value, (&'static str, &'static str)> {
    let relative = safe_relative(value_string(arguments, "path")?)?;
    let path = workspace
        .join(&relative)
        .canonicalize()
        .map_err(|_| ("ATTACHMENT_UNAVAILABLE", "workspace file is unavailable"))?;
    if !path.starts_with(workspace) || !path.is_file() {
        return Err((
            "ATTACHMENT_UNAUTHORIZED",
            "workspace file is outside the authorized scope",
        ));
    }
    let bytes =
        fs::read(&path).map_err(|_| ("ATTACHMENT_UNAVAILABLE", "workspace file cannot be read"))?;
    if bytes.len() > MAX_WORKSPACE_FILE_BYTES {
        return Err((
            "ATTACHMENT_TOO_LARGE",
            "workspace file exceeds the bounded input size",
        ));
    }
    let offset = arguments.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let maximum = arguments
        .get("maxLength")
        .and_then(Value::as_u64)
        .unwrap_or(MAX_FETCH_BYTES as u64) as usize;
    if maximum == 0 || maximum > MAX_FETCH_BYTES || offset > bytes.len() {
        return Err((
            "ATTACHMENT_INVALID",
            "workspace fetch range is outside bounds",
        ));
    }
    let end = (offset + maximum).min(bytes.len());
    Ok(json!({
        "path": relative, "offset": offset, "nextOffset": end,
        "totalBytes": bytes.len(), "digest": digest(&bytes),
        "data": BASE64.encode(&bytes[offset..end]), "eof": end == bytes.len(),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SpawnArgs {
    argv: Vec<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default = "default_timeout")]
    timeout_ms: u64,
    #[serde(default)]
    stdin_base64: Option<String>,
    /// Interactive attempts keep stdin open for `attempt.write` chunks and
    /// forward pre-terminal stdout/stderr as bounded process.output events.
    #[serde(default)]
    interactive: bool,
}
fn default_timeout() -> u64 {
    DEFAULT_TIMEOUT_MS
}
fn parse_spawn(
    value: &Value,
    workspace: &Path,
    root: &Path,
    home_root: &Path,
    authorized_executables: &[PathBuf],
    authorized_artifacts: &[VerifiedArtifact],
) -> Result<SpawnArgs, (&'static str, &'static str)> {
    let spec: SpawnArgs = serde_json::from_value(value.clone())
        .map_err(|_| ("SPAWN_INVALID", "spawn arguments are invalid"))?;
    if spec.argv.is_empty()
        || spec.argv.len() > 256
        || spec.argv.iter().any(|v| v.len() > 8192 || v.contains('\0'))
    {
        return Err(("SPAWN_INVALID", "argv is outside bounds"));
    }
    if spec.timeout_ms == 0 || spec.timeout_ms > MAX_TIMEOUT_MS {
        return Err(("SPAWN_INVALID", "timeout is outside bounds"));
    }
    if let Some(value) = &spec.stdin_base64 {
        let bytes = BASE64
            .decode(value)
            .map_err(|_| ("SPAWN_INVALID", "stdin payload is invalid"))?;
        if bytes.len() > MAX_STDIN_BYTES {
            return Err(("SPAWN_INVALID", "stdin payload exceeds bound"));
        }
    }
    if spec.argv[0] != "/usr/bin/bwrap" {
        return Err((
            "BWRAP_REQUIRED",
            "worker only starts bwrap-isolated processes",
        ));
    }
    validate_bwrap(
        &spec.argv,
        workspace,
        root,
        &home_root,
        authorized_executables,
        authorized_artifacts,
    )?;
    if let Some(cwd) = &spec.cwd {
        let canonical = canonical_directory(Path::new(cwd))
            .map_err(|_| ("SPAWN_INVALID", "cwd is unavailable"))?;
        if !canonical.starts_with(workspace) && !canonical.starts_with(root) {
            return Err(("WORKSPACE_UNAUTHORIZED", "cwd is outside authorized roots"));
        }
    }
    Ok(spec)
}
fn validate_bwrap(
    argv: &[String],
    workspace: &Path,
    root: &Path,
    home_root: &Path,
    authorized_executables: &[PathBuf],
    authorized_artifacts: &[VerifiedArtifact],
) -> Result<(), (&'static str, &'static str)> {
    if !argv.iter().any(|v| v == "--die-with-parent")
        || !argv.iter().any(|v| v == "--new-session")
        || !argv.iter().any(|v| v == "--")
    {
        return Err((
            "BWRAP_POLICY_INVALID",
            "required isolation flags are missing",
        ));
    }
    let mut i = 1;
    while i < argv.len() {
        match argv[i].as_str() {
            "--bind" | "--ro-bind" => {
                if i + 2 >= argv.len() {
                    return Err(("BWRAP_POLICY_INVALID", "mount is incomplete"));
                }
                let source = Path::new(&argv[i + 1])
                    .canonicalize()
                    .map_err(|_| ("BWRAP_POLICY_INVALID", "mount source is unavailable"))?;
                let target = argv[i + 2].as_str();
                let declared = authorized_artifacts
                    .iter()
                    .find(|item| item.path == source && item.target == target);
                let artifact_shaped = target.starts_with(artifacts::TARGET_PREFIX)
                    || authorized_artifacts.iter().any(|item| item.path == source);
                if artifact_shaped {
                    // A verified artifact tree is mounted read-only, at exactly
                    // the target its declaration named, and never writable.
                    if argv[i] != "--ro-bind" || declared.is_none() {
                        return Err((
                            "RUNTIME_ARTIFACT_UNAUTHORIZED",
                            "runtime artifact mount is not authorized",
                        ));
                    }
                    i += 3;
                    continue;
                }
                let system = argv[i] == "--ro-bind"
                    && ["/usr", "/bin", "/lib", "/lib64", "/etc"]
                        .iter()
                        .filter_map(|value| Path::new(value).canonicalize().ok())
                        .any(|value| source == value);
                let wsl_resolver = argv[i] == "--ro-bind"
                    && argv[i + 1] == "/etc/resolv.conf"
                    && target == "/mnt/wsl/resolv.conf"
                    && Path::new("/etc/resolv.conf")
                        .canonicalize()
                        .is_ok_and(|value| source == value && source.is_file());
                // The Profile's durable home is a third authorized root: it
                // is created and marker-verified by this Worker's own
                // `home.prepare`, and binding it read-write into the room is
                // exactly the native-home contract.
                let in_home = argv[i] == "--bind" && source.starts_with(&home_root);
                if !system
                    && !wsl_resolver
                    && !in_home
                    && !source.starts_with(workspace)
                    && !source.starts_with(root)
                    && !authorized_executables.contains(&source)
                {
                    return Err((
                        "WORKSPACE_UNAUTHORIZED",
                        "mount source is outside authorized roots",
                    ));
                }
                i += 3;
            }
            "--" => break,
            _ => i += 1,
        }
    }
    Ok(())
}

fn authorize_executables(values: &[protocol::ExecutableAuthorization]) -> io::Result<Vec<PathBuf>> {
    let mut result = Vec::new();
    for value in values {
        let path = Path::new(&value.path).canonicalize()?;
        if !path.is_file() || digest(&fs::read(&path)?) != value.digest {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "authorized executable digest mismatch",
            ));
        }
        if result.contains(&path) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "duplicate executable authorization",
            ));
        }
        result.push(path);
    }
    Ok(result)
}

/// One runtime artifact directory the Worker verified itself.
struct VerifiedArtifact {
    path: PathBuf,
    target: String,
}

/// Verify every declared runtime artifact directory inside WSL, or refuse.
///
/// This is the authoritative step of the contract: the Server only checked the
/// declaration's shape, so the digest, the real-directory requirement, the
/// link prohibition and the overlap rules are settled here, in the
/// distribution that will actually read the tree.
fn authorize_runtime_artifacts(
    values: &[protocol::RuntimeArtifactAuthorization],
    workspace: Option<&Path>,
    root: &Path,
) -> Result<Vec<VerifiedArtifact>, artifacts::Rejected> {
    let mut verified: Vec<VerifiedArtifact> = Vec::new();
    for value in values {
        let declared = Path::new(&value.path);
        let metadata = fs::symlink_metadata(declared).map_err(|_| artifacts::Rejected {
            code: "RUNTIME_ARTIFACT_ROOT_INVALID",
            message: "runtime artifact root is unavailable".to_string(),
        })?;
        if metadata.file_type().is_symlink() {
            return Err(artifacts::Rejected {
                code: "RUNTIME_ARTIFACT_ROOT_INVALID",
                message: "runtime artifact root must not be a symlink".to_string(),
            });
        }
        let canonical = declared.canonicalize().map_err(|_| artifacts::Rejected {
            code: "RUNTIME_ARTIFACT_ROOT_INVALID",
            message: "runtime artifact root is unavailable".to_string(),
        })?;
        if canonical != declared {
            return Err(artifacts::Rejected {
                code: "RUNTIME_ARTIFACT_ROOT_INVALID",
                message: "runtime artifact root must be a canonical absolute path".to_string(),
            });
        }
        // A declared artifact may not be the workspace, contain it, or live
        // inside it: those trees already have their own authority, and a
        // user's project must never be re-mounted through this door.
        let mut guarded = vec![root.to_path_buf()];
        if let Some(workspace) = workspace {
            guarded.push(workspace.to_path_buf());
        }
        if guarded
            .iter()
            .any(|other| other.starts_with(&canonical) || canonical.starts_with(other))
        {
            return Err(artifacts::Rejected {
                code: "RUNTIME_ARTIFACT_ROOT_OVERLAP",
                message: "runtime artifact root overlaps an authorized execution root".to_string(),
            });
        }
        if verified
            .iter()
            .any(|item| item.path == canonical || item.target == value.target)
        {
            return Err(artifacts::Rejected {
                code: "RUNTIME_ARTIFACT_DUPLICATE",
                message: "runtime artifact declaration is duplicated".to_string(),
            });
        }
        artifacts::verify_declared(&canonical, &value.digest)?;
        verified.push(VerifiedArtifact {
            path: canonical,
            target: value.target.clone(),
        });
    }
    Ok(verified)
}

async fn run_process(
    spec: SpawnArgs,
    mut cancel: watch::Receiver<bool>,
    events: mpsc::Sender<Value>,
    identity: (String, u64),
    stdin_slot: Option<
        Arc<tokio::sync::OnceCell<Arc<tokio::sync::Mutex<Option<tokio::process::ChildStdin>>>>>,
    >,
) -> io::Result<ProcessOutcome> {
    let (attempt_id, generation) = identity;
    let mut command = Command::new(&spec.argv[0]);
    command
        .args(&spec.argv[1..])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(cwd) = spec.cwd {
        command.current_dir(cwd);
    }
    command.as_std_mut().process_group(0);
    let mut child = command.spawn()?;
    let pid = child
        .id()
        .ok_or_else(|| io::Error::other("child pid unavailable"))? as i32;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("stdout unavailable"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| io::Error::other("stderr unavailable"))?;
    let mut initial_stdin = child
        .stdin
        .take()
        .ok_or_else(|| io::Error::other("stdin unavailable"))?;
    if let Some(value) = &spec.stdin_base64 {
        let bytes = BASE64.decode(value).map_err(io::Error::other)?;
        initial_stdin.write_all(&bytes).await?;
    }
    if !spec.interactive {
        initial_stdin.shutdown().await?;
        drop(initial_stdin);
    } else if let Some(slot) = stdin_slot {
        let _ = slot.set(Arc::new(tokio::sync::Mutex::new(Some(initial_stdin))));
    }
    let forward = if spec.interactive {
        Some((events, attempt_id, generation))
    } else {
        None
    };
    let out_task = tokio::spawn(drain(stdout, MAX_OUTPUT_BYTES, forward.clone(), "stdout"));
    let err_task = tokio::spawn(drain(stderr, MAX_OUTPUT_BYTES, forward, "stderr"));
    let mut timed_out = false;
    let mut cancelled = false;
    let status = tokio::select! {
        value=child.wait()=>value?,
        _=tokio::time::sleep(Duration::from_millis(spec.timeout_ms))=>{timed_out=true;terminate(pid,&mut child).await?},
        _=cancel.changed()=>{cancelled=true;terminate(pid,&mut child).await?},
    };
    let (stdout, out_exceeded) = out_task.await.map_err(io::Error::other)??;
    let (stderr, err_exceeded) = err_task.await.map_err(io::Error::other)??;
    let stdout_digest = digest(&stdout);
    let stderr_digest = digest(&stderr);
    Ok(ProcessOutcome {
        record: ProcessRecord {
            attempt_id: String::new(),
            generation: 0,
            exit_code: status.code(),
            timed_out,
            cancelled,
            output_exceeded: out_exceeded || err_exceeded,
            stdout_bytes: stdout.len(),
            stderr_bytes: stderr.len(),
            stdout_digest,
            stderr_digest,
        },
        stdout,
        stderr,
    })
}
async fn terminate(
    pid: i32,
    child: &mut tokio::process::Child,
) -> io::Result<std::process::ExitStatus> {
    unsafe {
        libc::kill(-pid, libc::SIGTERM);
    }
    tokio::time::sleep(Duration::from_millis(150)).await;
    if let Ok(Some(status)) = child.try_wait() {
        return Ok(status);
    }
    unsafe {
        libc::kill(-pid, libc::SIGKILL);
    }
    child.wait().await
}

async fn drain<R: AsyncRead + Unpin>(
    mut reader: R,
    limit: usize,
    forward: Option<(mpsc::Sender<Value>, String, u64)>,
    stream: &'static str,
) -> io::Result<(Vec<u8>, bool)> {
    let mut kept = Vec::new();
    let mut buf = [0u8; 8192];
    let mut exceeded = false;
    let mut sequence: u64 = 0;
    let mut forwarded_bytes = 0usize;
    let mut truncation_reported = false;
    loop {
        let count = reader.read(&mut buf).await?;
        if count == 0 {
            break;
        }
        if let Some((events, attempt_id, generation)) = &forward {
            sequence += 1;
            if forwarded_bytes + count <= MAX_INTERACTIVE_EVENT_BYTES {
                forwarded_bytes += count;
                let event = json!({
                    "event": "process.output",
                    "result": {
                        "attemptId": attempt_id,
                        "generation": generation,
                        "stream": stream,
                        "seq": sequence,
                        "data": BASE64.encode(&buf[..count]),
                        "eof": false,
                    }
                });
                if events.send(event).await.is_err() {}
            } else if !truncation_reported {
                truncation_reported = true;
                let event = json!({
                    "event": "process.output",
                    "result": {
                        "attemptId": attempt_id,
                        "generation": generation,
                        "stream": stream,
                        "seq": sequence,
                        "data": "",
                        "eof": false,
                        "truncated": true,
                    }
                });
                let _ = events.send(event).await;
            }
        }
        let room = limit.saturating_sub(kept.len());
        kept.extend_from_slice(&buf[..count.min(room)]);
        if count > room {
            exceeded = true;
        }
    }
    Ok((kept, exceeded))
}
fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}
fn result_dir(root: &Path, id: &str, generation: u64) -> PathBuf {
    root.join("results").join(format!("{id}-{generation}"))
}
fn persist_result(root: &Path, outcome: &ProcessOutcome) -> io::Result<()> {
    let dir = result_dir(root, &outcome.record.attempt_id, outcome.record.generation);
    fs::create_dir_all(&dir)?;
    fs::write(dir.join("stdout"), &outcome.stdout)?;
    fs::write(dir.join("stderr"), &outcome.stderr)?;
    fs::write(
        dir.join("result.json"),
        serde_json::to_vec(&outcome.record).map_err(io::Error::other)?,
    )?;
    Ok(())
}
fn load_record(root: &Path, id: &str, generation: u64) -> io::Result<ProcessRecord> {
    serde_json::from_slice(&fs::read(
        result_dir(root, id, generation).join("result.json"),
    )?)
    .map_err(io::Error::other)
}
fn exact_attempt(request: &Request) -> Result<(&str, u64), (&'static str, &'static str)> {
    let id = request
        .attempt_id
        .as_deref()
        .filter(|v| valid_id(v))
        .ok_or(("ATTEMPT_INVALID", "attempt identity is required"))?;
    let generation = request
        .generation
        .filter(|v| *v > 0)
        .ok_or(("ATTEMPT_INVALID", "generation is required"))?;
    Ok((id, generation))
}

fn handle_result(root: &Path, request: &Request) -> Result<Value, (&'static str, &'static str)> {
    let (id, generation) = exact_attempt(request)?;
    let dir = result_dir(root, id, generation);
    if !dir.join("result.json").is_file() {
        return Err(("RESULT_UNAVAILABLE", "result is unavailable"));
    }
    match request.op.as_str() {
        "result.get" => {
            let artifact = value_string(&request.arguments, "artifact")?;
            if artifact != "stdout" && artifact != "stderr" {
                return Err(("ARTIFACT_INVALID", "artifact is invalid"));
            }
            let offset = request
                .arguments
                .get("offset")
                .and_then(Value::as_u64)
                .unwrap_or(0) as usize;
            let maximum = request
                .arguments
                .get("maxLength")
                .and_then(Value::as_u64)
                .unwrap_or(MAX_FETCH_BYTES as u64) as usize;
            if maximum == 0 || maximum > MAX_FETCH_BYTES {
                return Err(("ARTIFACT_INVALID", "fetch length is outside bounds"));
            }
            let bytes = fs::read(dir.join(artifact))
                .map_err(|_| ("RESULT_UNAVAILABLE", "artifact is unavailable"))?;
            if bytes.len() > MAX_ARTIFACT_BYTES {
                return Err(("ARTIFACT_TOO_LARGE", "artifact exceeds bound"));
            }
            let start = offset.min(bytes.len());
            let end = (start + maximum).min(bytes.len());
            Ok(
                json!({"artifact":artifact,"offset":start,"nextOffset":end,"totalBytes":bytes.len(),"digest":digest(&bytes),"data":BASE64.encode(&bytes[start..end]),"eof":end==bytes.len()}),
            )
        }
        "result.ack" => {
            fs::write(dir.join(".acked"), b"ack")
                .map_err(|_| ("RESULT_ACK_FAILED", "result acknowledgement failed"))?;
            Ok(json!({"status":"acknowledged"}))
        }
        "attempt.cleanup" => {
            if !dir.join(".acked").is_file() {
                return Err((
                    "RESULT_NOT_ACKNOWLEDGED",
                    "result must be acknowledged before cleanup",
                ));
            }
            fs::remove_dir_all(&dir).map_err(|_| ("CLEANUP_FAILED", "attempt cleanup failed"))?;
            Ok(json!({"status":"cleaned"}))
        }
        _ => unreachable!(),
    }
}

fn safe_relative(value: &str) -> Result<PathBuf, (&'static str, &'static str)> {
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(("PATH_INVALID", "relative path is invalid"));
    }
    Ok(path.to_path_buf())
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ViewFile {
    path: String,
    digest: String,
    size: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ViewManifest {
    files: Vec<ViewFile>,
}

fn read_view_manifest(dir: &Path) -> Result<ViewManifest, (&'static str, &'static str)> {
    serde_json::from_slice(
        &fs::read(dir.join("manifest.json"))
            .map_err(|_| ("VIEW_INVALID", "view manifest is unavailable"))?,
    )
    .map_err(|_| ("VIEW_INVALID", "view manifest is invalid"))
}

fn handle_view(root: &Path, op: &str, args: &Value) -> Result<Value, (&'static str, &'static str)> {
    let id = value_string(args, "viewId")?;
    if !valid_id(id) {
        return Err(("VIEW_INVALID", "view identity is invalid"));
    }
    let dir = root.join("views").join(id);
    match op {
        "view.prepare" => {
            if dir.exists() {
                return Err(("VIEW_EXISTS", "view already exists"));
            }
            let files: Vec<ViewFile> =
                serde_json::from_value(args.get("files").cloned().unwrap_or(Value::Null))
                    .map_err(|_| ("VIEW_INVALID", "view manifest is invalid"))?;
            if files.len() > 1024 {
                return Err(("VIEW_FILE_LIMIT", "view manifest exceeds file limit"));
            }
            let mut total = 0u64;
            let mut paths = HashSet::new();
            for file in &files {
                safe_relative(&file.path)?;
                if !paths.insert(file.path.clone()) {
                    return Err(("VIEW_INVALID", "view contains a duplicate path"));
                }
                if !file.digest.starts_with("sha256:")
                    || file.digest.len() != 71
                    || !file.digest[7..]
                        .bytes()
                        .all(|byte| byte.is_ascii_hexdigit())
                    || file.size as usize > MAX_ARTIFACT_BYTES
                {
                    return Err(("VIEW_INVALID", "view file metadata is invalid"));
                }
                if file.size == 0 && file.digest != digest(&[]) {
                    return Err((
                        "VIEW_DIGEST_MISMATCH",
                        "empty view file digest did not match",
                    ));
                }
                total = total
                    .checked_add(file.size)
                    .ok_or(("VIEW_INVALID", "view size overflow"))?;
            }
            if total as usize > MAX_ARTIFACT_BYTES {
                return Err(("VIEW_INVALID", "view exceeds total size bound"));
            }
            fs::create_dir_all(dir.join("partial"))
                .map_err(|_| ("VIEW_IO", "view creation failed"))?;
            fs::create_dir_all(dir.join("ready"))
                .map_err(|_| ("VIEW_IO", "view creation failed"))?;
            for file in files.iter().filter(|file| file.size == 0) {
                let target = dir.join("ready").join(safe_relative(&file.path)?);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|_| ("VIEW_IO", "view directory creation failed"))?;
                }
                fs::write(target, [])
                    .map_err(|_| ("VIEW_IO", "empty view file creation failed"))?;
            }
            fs::write(
                dir.join("manifest.json"),
                serde_json::to_vec(&ViewManifest { files })
                    .map_err(|_| ("VIEW_INVALID", "view manifest is invalid"))?,
            )
            .map_err(|_| ("VIEW_IO", "view manifest write failed"))?;
            Ok(json!({"status":"prepared","totalBytes":total}))
        }
        "view.put" => {
            let rel = safe_relative(value_string(args, "path")?)?;
            let manifest = read_view_manifest(&dir)?;
            let expected = manifest
                .files
                .iter()
                .find(|file| Path::new(&file.path) == rel)
                .ok_or(("VIEW_INVALID", "view path is not declared"))?;
            let data = BASE64
                .decode(value_string(args, "data")?)
                .map_err(|_| ("VIEW_INVALID", "view chunk is invalid"))?;
            if data.len() > MAX_FETCH_BYTES {
                return Err(("VIEW_INVALID", "view chunk exceeds bound"));
            }
            let offset = args
                .get("offset")
                .and_then(Value::as_u64)
                .ok_or(("VIEW_INVALID", "view offset is required"))?;
            let target = dir.join("partial").join(&rel);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|_| ("VIEW_IO", "view directory creation failed"))?;
            }
            let current = target.metadata().map(|value| value.len()).unwrap_or(0);
            if current != offset || current + data.len() as u64 > expected.size {
                return Err((
                    "VIEW_OFFSET_INVALID",
                    "view chunk offset or size is invalid",
                ));
            }
            let mut options = fs::OpenOptions::new();
            options.create(true).append(true).mode(0o600);
            use std::io::Write;
            options
                .open(&target)
                .and_then(|mut f| f.write_all(&data))
                .map_err(|_| ("VIEW_IO", "view chunk write failed"))?;
            let written = current + data.len() as u64;
            if written == expected.size {
                let bytes = fs::read(&target).map_err(|_| ("VIEW_IO", "view read-back failed"))?;
                if digest(&bytes) != expected.digest {
                    let _ = fs::remove_file(&target);
                    return Err(("VIEW_DIGEST_MISMATCH", "view file digest did not match"));
                }
                let ready = dir.join("ready").join(&rel);
                if let Some(parent) = ready.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|_| ("VIEW_IO", "view directory creation failed"))?;
                }
                fs::rename(&target, &ready).map_err(|_| ("VIEW_IO", "view publication failed"))?;
            }
            Ok(
                json!({"status":"stored","bytes":data.len(),"nextOffset":written,"complete":written==expected.size}),
            )
        }
        "view.commit" => {
            let manifest = read_view_manifest(&dir)?;
            let view_fd = pinned_view_fd(&dir)?;
            let ready = open_beneath(view_fd.as_raw_fd(), Path::new("ready"), true)?;
            for file in &manifest.files {
                let relative = safe_relative(&file.path)?;
                let bytes = match read_view_entry(ready.as_raw_fd(), &relative) {
                    Ok(bytes) => bytes,
                    // A declared file that is not there is an incomplete view,
                    // not churn: commit is a one-shot publication step.
                    Err(("VIEW_MISSING", _)) => {
                        return Err(("VIEW_INCOMPLETE", "view has incomplete files"))
                    }
                    Err(error) => return Err(error),
                };
                if bytes.len() as u64 != file.size || digest(&bytes) != file.digest {
                    return Err(("VIEW_DIGEST_MISMATCH", "view read-back did not match"));
                }
            }
            fs::write(dir.join(".committed"), b"ready")
                .map_err(|_| ("VIEW_IO", "view commit failed"))?;
            Ok(json!({"status":"ready","path":dir.join("ready")}))
        }
        "view.list" => {
            if !dir.join(".committed").is_file() {
                return Err(("VIEW_INCOMPLETE", "view is not committed"));
            }
            let view_fd = pinned_view_fd(&dir)?;
            let ready = open_beneath(view_fd.as_raw_fd(), Path::new("ready"), true)?;
            let mut files = Vec::new();
            let mut visited = 0usize;
            list_view_files(ready.as_raw_fd(), "", &mut files, &mut visited)?;
            if files.len() > 1024 {
                return Err(("VIEW_FILE_LIMIT", "view exceeds file limit"));
            }
            files.sort_by(|left, right| left["path"].as_str().cmp(&right["path"].as_str()));
            Ok(json!({"status":"listed","files":files}))
        }
        "view.get" => {
            if !dir.join(".committed").is_file() {
                return Err(("VIEW_INCOMPLETE", "view is not committed"));
            }
            let relative = safe_relative(value_string(args, "path")?)?;
            let view_fd = pinned_view_fd(&dir)?;
            let ready = open_beneath(view_fd.as_raw_fd(), Path::new("ready"), true)?;
            let file = read_view_entry(ready.as_raw_fd(), &relative)?;
            let offset = args.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
            let maximum = args
                .get("maxLength")
                .and_then(Value::as_u64)
                .unwrap_or(MAX_FETCH_BYTES as u64) as usize;
            // The fetch range is validated as a request, on its own face: a
            // first request past the end is simply invalid, and a genuine
            // shortening between two chunks of one read is caught by the
            // caller's digest check on the chunk that no longer matches.
            if maximum == 0 || maximum > MAX_FETCH_BYTES || offset > file.len() {
                return Err(("VIEW_INVALID", "view fetch range is invalid"));
            }
            let end = (offset + maximum).min(file.len());
            Ok(
                json!({"path":value_string(args,"path")?,"offset":offset,"nextOffset":end,"totalBytes":file.len(),"digest":digest(&file),"data":BASE64.encode(&file[offset..end]),"eof":end==file.len()}),
            )
        }
        "view.cleanup" => {
            if dir.exists() {
                fs::remove_dir_all(dir).map_err(|_| ("VIEW_IO", "view cleanup failed"))?;
            }
            Ok(json!({"status":"cleaned"}))
        }
        _ => unreachable!(),
    }
}

/// Open the committed view directory itself as an fd, so every later step
/// anchors at an inode instead of a path a Harness-writable bind could swap.
fn pinned_view_fd(dir: &Path) -> Result<fs::File, (&'static str, &'static str)> {
    fs::File::open(dir).map_err(|_| ("VIEW_IO", "view open failed"))
}

/// Open one path component beneath a pinned directory fd without following a
/// symlink, so an entry or a parent directory that is swapped for a link
/// between a check and an open cannot redirect the read. `directory` requires
/// the final component to be a directory. `O_NONBLOCK` keeps a FIFO that
/// appeared in the view from blocking the open; the type check rejects it.
fn open_at(
    base: RawFd,
    name: &std::ffi::OsStr,
    directory: bool,
) -> Result<RawFd, (&'static str, &'static str)> {
    let mut flags = libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK;
    if directory {
        flags |= libc::O_DIRECTORY;
    }
    // CString is required: `openat` needs the terminator, and `OsStr::as_bytes`
    // alone would let it read past the name.
    let c_name = std::ffi::CString::new(name.as_bytes())
        .map_err(|_| ("PATH_INVALID", "relative path is invalid"))?;
    let fd = unsafe { libc::openat(base, c_name.as_ptr(), flags, 0) };
    if fd >= 0 {
        return Ok(fd);
    }
    let error = std::io::Error::last_os_error();
    Err(match error.raw_os_error() {
        // A link in the resolved path is a refusal: the view contract reads
        // declared regular files only, and nothing may resolve through a link.
        Some(libc::ELOOP) => ("VIEW_SPECIAL_FILE", "view path resolves through a symlink"),
        Some(libc::ENOTDIR) => ("VIEW_INVALID", "view path crosses a non-directory"),
        _ if error.kind() == std::io::ErrorKind::NotFound => {
            ("VIEW_MISSING", "view entry is not there")
        }
        _ => ("VIEW_IO", "view open failed"),
    })
}

/// Resolve `relative` beneath `base_fd` one component at a time, every open
/// with `O_NOFOLLOW`, and return the final fd as an owned file. Only that fd
/// is left open; a parent swap therefore cannot redirect any later component.
fn open_beneath(
    base_fd: RawFd,
    relative: &Path,
    final_is_directory: bool,
) -> Result<fs::File, (&'static str, &'static str)> {
    let components: Vec<&std::ffi::OsStr> = relative
        .components()
        .map(|component| match component {
            Component::Normal(name) => Some(name),
            _ => None,
        })
        .collect::<Option<Vec<_>>>()
        .ok_or(("PATH_INVALID", "relative path is invalid"))?;
    if components.is_empty() {
        return Err(("PATH_INVALID", "relative path is invalid"));
    }
    let mut opened: Vec<RawFd> = Vec::new();
    let result = (|| {
        let mut current = base_fd;
        for (index, name) in components.iter().enumerate() {
            let directory = final_is_directory || index + 1 < components.len();
            let fd = open_at(current, name, directory)?;
            opened.push(fd);
            current = fd;
        }
        Ok(())
    })();
    match result {
        Ok(()) => {
            let final_fd = opened.pop().expect("at least one component");
            for fd in opened {
                unsafe { libc::close(fd) };
            }
            // SAFETY: `final_fd` is a freshly opened descriptor this call owns.
            Ok(unsafe { fs::File::from_raw_fd(final_fd) })
        }
        Err(error) => {
            for fd in opened {
                unsafe { libc::close(fd) };
            }
            Err(error)
        }
    }
}

/// Read one open view entry to the end, proving the bytes belong to the file
/// that was opened: the fd was opened with `O_NOFOLLOW`, the type and size are
/// taken from that fd, the read is bounded by the artifact limit no matter
/// what the metadata claimed, and a swap or a truncate during the read is a
/// content change rather than bytes this Worker will serve.
fn read_view_entry(
    view_fd: RawFd,
    relative: &Path,
) -> Result<Vec<u8>, (&'static str, &'static str)> {
    use std::io::Read;
    let mut file = open_beneath(view_fd, relative, false)?;
    let before = file
        .metadata()
        .map_err(|_| ("VIEW_IO", "view file metadata failed"))?;
    if !before.is_file() {
        // A directory, FIFO, socket or device that sits where a declared file
        // should be is a refusal; nothing is ever read from it.
        return Err(("VIEW_SPECIAL_FILE", "view file is not a regular file"));
    }
    if before.len() as usize > MAX_ARTIFACT_BYTES {
        return Err(("VIEW_INVALID", "view file exceeds the artifact bound"));
    }
    let mut bytes = Vec::with_capacity(before.len() as usize);
    (&mut file)
        .take(MAX_ARTIFACT_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ("VIEW_IO", "view file read failed"))?;
    let after = file
        .metadata()
        .map_err(|_| ("VIEW_IO", "view file metadata failed"))?;
    let identity = |metadata: &fs::Metadata| (metadata.dev(), metadata.ino(), metadata.len());
    if identity(&after) != identity(&before) || bytes.len() as u64 > MAX_ARTIFACT_BYTES as u64 {
        return Err(("VIEW_CHANGED", "view file changed while it was being read"));
    }
    Ok(bytes)
}

/// Walk one pinned directory fd. Descent re-opens every child with
/// `openat(.., O_NOFOLLOW | O_DIRECTORY)` from the pinned parent, so no swap
/// can redirect the walk; an entry that vanishes or turns into a link under
/// the walk is skipped (the next snapshot simply differs), and everything else
/// keeps its typed refusal.
fn list_view_files(
    directory_fd: RawFd,
    prefix: &str,
    files: &mut Vec<Value>,
    visited: &mut usize,
) -> Result<(), (&'static str, &'static str)> {
    for entry in
        fs::read_dir(fd_path(directory_fd)).map_err(|_| ("VIEW_IO", "view listing failed"))?
    {
        let entry = entry.map_err(|_| ("VIEW_IO", "view listing failed"))?;
        let name = entry.file_name();
        // DirEntry::metadata is lstat: a swapped-in link is seen as a link.
        let metadata = entry
            .metadata()
            .map_err(|_| ("VIEW_IO", "view metadata failed"))?;
        // Every visited entry costs one step, whatever its type.
        *visited += 1;
        if *visited > MAX_VIEW_TRAVERSAL_ENTRIES {
            return Err(("VIEW_TRAVERSAL_LIMIT", "view exceeds traversal bound"));
        }
        // A view lists regular files. Harnesses legitimately leave short-lived
        // symlinks in their home - Codex writes argv0 aliases under its tmp/
        // directory while it runs - and one of those must not invalidate the
        // whole listing. A skipped symlink is never declared in the manifest and
        // reads only serve declared regular files, so nothing resolves through
        // it; skipping never deletes it either, so cleanup still works.
        if metadata.file_type().is_symlink() {
            continue;
        }
        let child_prefix = if prefix.is_empty() {
            name.to_string_lossy().into_owned()
        } else {
            format!("{prefix}/{}", name.to_string_lossy())
        };
        if metadata.is_dir() {
            match open_at(directory_fd, &name, true) {
                Ok(child_fd) => {
                    let walked = list_view_files(child_fd, &child_prefix, files, visited);
                    unsafe { libc::close(child_fd) };
                    walked?;
                }
                // A child that vanished or turned into a link under the walk is
                // churn, not a fault: the listing simply stops seeing it.
                Err(("VIEW_MISSING", _)) | Err(("VIEW_SPECIAL_FILE", _)) => {}
                Err(other) => return Err(other),
            }
        } else if metadata.is_file() {
            files.push(json!({"path":child_prefix,"size":metadata.len()}));
            if files.len() > 1024 {
                return Err(("VIEW_FILE_LIMIT", "view exceeds file limit"));
            }
        } else {
            // A FIFO, socket or device is not a view file, and silently leaving
            // it out would describe a directory that is not what is there.
            return Err(("VIEW_SPECIAL_FILE", "view contains a special file"));
        }
    }
    Ok(())
}

/// The path that reads back a pinned directory fd, so iteration is anchored to
/// the inode the Worker already verified instead of to a swappable name.
fn fd_path(fd: RawFd) -> PathBuf {
    PathBuf::from(format!("/proc/self/fd/{fd}"))
}
fn handle_secret(
    root: &Path,
    op: &str,
    args: &Value,
) -> Result<Value, (&'static str, &'static str)> {
    let attempt = value_string(args, "attemptId")?;
    let frame = value_string(args, "frameId")?;
    if !valid_id(attempt) || !valid_id(frame) {
        return Err(("SECRET_REJECTED", "secret identity is invalid"));
    }
    let dir = root.join("secrets").join(attempt);
    let target = dir.join(frame);
    match op {
        "secret.put" => {
            if target.exists() {
                return Err(("SECRET_REJECTED", "secret frame is one-shot"));
            }
            let data = BASE64
                .decode(value_string(args, "data")?)
                .map_err(|_| ("SECRET_REJECTED", "secret frame is invalid"))?;
            if data.len() > MAX_SECRET_BYTES {
                return Err(("SECRET_REJECTED", "secret frame exceeds bound"));
            }
            fs::create_dir_all(&dir).map_err(|_| ("SECRET_IO", "secret staging failed"))?;
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(&target)
                .map_err(|_| ("SECRET_IO", "secret staging failed"))?;
            use std::io::Write;
            file.write_all(&data)
                .map_err(|_| ("SECRET_IO", "secret staging failed"))?;
            Ok(json!({"status":"materialized","frameId":frame,"path":target}))
        }
        "secret.cleanup" => {
            let _ = fs::remove_file(target);
            if dir.exists()
                && fs::read_dir(&dir)
                    .map(|mut i| i.next().is_none())
                    .unwrap_or(false)
            {
                let _ = fs::remove_dir(dir);
            }
            Ok(json!({"status":"cleaned","frameId":frame}))
        }
        _ => unreachable!(),
    }
}

/// One Profile's home: the durable directory on this machine that is the only
/// source of truth for the harness's native state. Everything here outlives the
/// attempt, the view cleanup and the Worker process itself, which is why the
/// home root must sit outside the ephemeral `--root`.
///
/// The marker at `<home root>/<role>/.agentbox-profile.json` records which
/// product identity owns the directory. A conflict is a typed refusal
/// (`HOME_MARKER_CONFLICT`): two Profiles must never share one home, and the
/// Server is the side that translates this into its own
/// `PROFILE_HOME_CONFLICT` wording.
const HOME_MARKER_FILE: &str = ".agentbox-profile.json";
/// The per-harness session store lives here, inside the home root so the
/// bwrap bind authorization already covers it. Reserved: a profile locator
/// may not use this first segment (the store is harness-scoped, not
/// profile-scoped, and the two must never collide).
const SESSION_STORE_DIR: &str = "_sessions";
/// Audit bounds. They mirror the state-capture bounds the channels already
/// had: 1024 audited files, 8 MiB per digested file, 64 MiB digested in
/// total, 4096 visited entries per walk. Everything beyond a bound is a
/// reported fact (`truncated`), never a silently skipped entry.
const MAX_HOME_FILES: usize = 1024;
const MAX_HOME_FILE_BYTES: usize = 8 * 1024 * 1024;
const MAX_HOME_AUDIT_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HomeMarker {
    profile_id: String,
    harness_type: String,
    native_home: String,
    #[serde(default)]
    created_at: Option<u64>,
}

/// A locator is `<role>` or `<role>/<native-home>`, one to two segments, each
/// a short safe name. `.` and `..` are explicitly refused even though the
/// character class alone would admit them: a locator that traverses is not a
/// locator, it is an escape.
fn home_locator(value: &str) -> Result<Vec<String>, (&'static str, &'static str)> {
    let segments: Vec<&str> = value.split('/').collect();
    // One role segment plus the registry's native home, which may itself be
    // nested (`.config/opencode`), so up to 6 segments are well-formed.
    if segments.is_empty() || segments.len() > 6 || segments.iter().any(|s| s.is_empty()) {
        return Err(("HOME_LOCATOR_INVALID", "home locator is invalid"));
    }
    for segment in &segments {
        let bytes = segment.as_bytes();
        if bytes.len() > 64
            || !bytes
                .iter()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
            || *segment == "."
            || *segment == ".."
        {
            return Err(("HOME_LOCATOR_INVALID", "home locator is invalid"));
        }
    }
    Ok(segments.iter().map(|s| s.to_string()).collect())
}

fn home_dir(home_root: &Path, locator: &str) -> Result<PathBuf, (&'static str, &'static str)> {
    let segments = home_locator(locator)?;
    let mut dir = home_root.to_path_buf();
    for segment in segments {
        dir.push(segment);
    }
    Ok(dir)
}

/// The resolved home must stay inside the home root: a symlinked segment
/// planted under the root must not relocate the home elsewhere on disk.
fn ensure_inside_home_root(
    home_root: &Path,
    candidate: &Path,
) -> Result<(), (&'static str, &'static str)> {
    let root = canonical_directory(home_root).map_err(|_| ("HOME_IO", "home root is unusable"))?;
    let resolved = candidate
        .canonicalize()
        .map_err(|_| ("HOME_NOT_FOUND", "home directory does not exist"))?;
    if !resolved.starts_with(&root) {
        return Err(("HOME_OUTSIDE_ROOT", "home escapes the home root"));
    }
    Ok(())
}

fn read_home_marker(path: &Path) -> Result<Option<HomeMarker>, (&'static str, &'static str)> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| ("HOME_MARKER_CONFLICT", "home marker is not a valid marker")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(("HOME_IO", "home marker read failed")),
    }
}

fn handle_home(
    home_root: &Path,
    op: &str,
    args: &Value,
) -> Result<Value, (&'static str, &'static str)> {
    let locator = value_string(args, "locator")?;
    let dir = home_dir(home_root, locator)?;
    // Every path in the home ops is relative to the role directory, not to
    // the native home: a Harness's declared audit window may name another
    // subtree of the same role (OpenCode's data lives under
    // `.local/share/opencode` while its native home is `.config/opencode`),
    // and a role-relative path covers both without a second authority.
    let role_dir = home_root.join(home_locator(locator)?[0].clone());
    match op {
        "home.delete" => {
            // The one destructive home operation, and it deletes exactly one
            // regular file: the credential rule is "a hit file is removed, and
            // nothing else is touched". Links are never followed, directories
            // are never removed here.
            ensure_inside_home_root(home_root, &role_dir)?;
            let relative = safe_relative(value_string(args, "path")?)?;
            let dir_fd =
                fs::File::open(&role_dir).map_err(|_| ("HOME_NOT_FOUND", "home does not exist"))?;
            let parent = match relative.parent() {
                Some(parent) if !parent.as_os_str().is_empty() => {
                    open_beneath(dir_fd.as_raw_fd(), parent, true)?
                }
                _ => dir_fd
                    .try_clone()
                    .map_err(|_| ("HOME_IO", "home open failed"))?,
            };
            let name = relative
                .file_name()
                .ok_or(("PATH_INVALID", "relative path is invalid"))?
                .to_owned();
            let c_name = std::ffi::CString::new(name.as_bytes())
                .map_err(|_| ("PATH_INVALID", "relative path is invalid"))?;
            let removed = unsafe { libc::unlinkat(parent.as_raw_fd(), c_name.as_ptr(), 0) };
            if removed != 0 {
                let error = std::io::Error::last_os_error();
                return Err(match error.raw_os_error() {
                    Some(libc::EISDIR) | Some(libc::EPERM) => {
                        ("HOME_IO", "only a regular file may be removed from a home")
                    }
                    _ if error.kind() == io::ErrorKind::NotFound => {
                        ("VIEW_MISSING", "home entry is not there")
                    }
                    _ => ("HOME_IO", "home entry removal failed"),
                });
            }
            Ok(json!({"deleted": value_string(args, "path")?}))
        }
        "home.prepare" => {
            if args.get("kind").and_then(Value::as_str) == Some("session-store") {
                // The per-harness session library: one directory per harness
                // family, shared by every profile of that family on this
                // machine. It has no profile identity, so no profile marker is
                // written or checked here; the harness segment alone names it.
                let harness = value_string(args, "harness")?;
                let segments = home_locator(harness)?;
                if segments.len() != 1 {
                    return Err((
                        "HOME_LOCATOR_INVALID",
                        "a session store names exactly one harness",
                    ));
                }
                let dir = home_root.join(SESSION_STORE_DIR).join(&segments[0]);
                let created = !dir.exists();
                fs::create_dir_all(&dir)
                    .map_err(|_| ("HOME_IO", "session store creation failed"))?;
                ensure_inside_home_root(home_root, &dir)?;
                return Ok(json!({
                    "path": dir, "created": created, "markerState": "session-store",
                }));
            }
            let marker: HomeMarker =
                serde_json::from_value(args.get("marker").cloned().unwrap_or(Value::Null))
                    .map_err(|_| ("HOME_LOCATOR_INVALID", "home marker is invalid"))?;
            if marker.profile_id.is_empty()
                || marker.profile_id.len() > 128
                || marker.harness_type.is_empty()
                || marker.harness_type.len() > 64
                || marker.native_home.is_empty()
                || marker.native_home.len() > 255
            {
                return Err(("HOME_LOCATOR_INVALID", "home marker is invalid"));
            }
            // Create the directory before reading anything: an absent home is
            // a fresh home, and preparation is the one operation that may
            // create it.
            fs::create_dir_all(&dir).map_err(|_| ("HOME_IO", "home directory creation failed"))?;
            ensure_inside_home_root(home_root, &dir)?;
            let role_segment = home_locator(locator)?[0].clone();
            if role_segment == SESSION_STORE_DIR {
                return Err((
                    "HOME_LOCATOR_INVALID",
                    "the session store directory is reserved",
                ));
            }
            let marker_path = home_root
                .join(role_segment)
                .join(HOME_MARKER_FILE);
            let (created, marker_state) = match read_home_marker(&marker_path)? {
                None => {
                    let stamp = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map_err(|_| ("HOME_IO", "clock is before the epoch"))?
                        .as_secs();
                    let recorded = HomeMarker {
                        created_at: Some(stamp),
                        ..marker
                    };
                    use std::io::Write;
                    fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .mode(0o600)
                        .open(&marker_path)
                        .and_then(|mut file| {
                            file.write_all(
                                &serde_json::to_vec(&recorded).map_err(io::Error::other)?,
                            )
                        })
                        .map_err(|_| ("HOME_IO", "home marker write failed"))?;
                    (true, "written")
                }
                Some(existing) => {
                    if existing.profile_id != marker.profile_id
                        || existing.harness_type != marker.harness_type
                        || existing.native_home != marker.native_home
                    {
                        return Err((
                            "HOME_MARKER_CONFLICT",
                            "the home belongs to another profile identity",
                        ));
                    }
                    (false, "verified")
                }
            };
            // The audit window (the stateProjection target minus the guest
            // home prefix) must exist before the harness starts: harnesses
            // differ in what they do with a missing directory, and the window
            // is ours to own, not theirs. It is role-relative, so it covers a
            // window outside the native home too - OpenCode's data lives under
            // `.local/share/opencode` while its native home is
            // `.config/opencode`.
            if let Some(window) = args.get("window").and_then(Value::as_str) {
                let relative = safe_relative(window)?;
                let target = role_dir.join(&relative);
                fs::create_dir_all(&target)
                    .map_err(|_| ("HOME_IO", "home window creation failed"))?;
                ensure_inside_home_root(home_root, &target)?;
            }
            Ok(json!({"path": dir, "created": created, "markerState": marker_state}))
        }
        "home.list" | "home.get" => {
            ensure_inside_home_root(home_root, &role_dir)?;
            let dir_fd =
                fs::File::open(&role_dir).map_err(|_| ("HOME_NOT_FOUND", "home does not exist"))?;
            if op == "home.get" {
                let relative = safe_relative(value_string(args, "path")?)?;
                let file = read_view_entry(dir_fd.as_raw_fd(), &relative)?;
                let offset = args.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
                let maximum = args
                    .get("maxLength")
                    .and_then(Value::as_u64)
                    .unwrap_or(MAX_FETCH_BYTES as u64) as usize;
                if maximum == 0 || maximum > MAX_FETCH_BYTES || offset > file.len() {
                    return Err(("VIEW_INVALID", "home fetch range is invalid"));
                }
                let end = (offset + maximum).min(file.len());
                Ok(
                    json!({"path": value_string(args, "path")?, "offset": offset, "nextOffset": end,
                           "totalBytes": file.len(), "digest": digest(&file),
                           "data": BASE64.encode(&file[offset..end]), "eof": end == file.len()}),
                )
            } else {
                let relative = match args.get("relative") {
                    Some(Value::String(value)) if !value.is_empty() => Some(safe_relative(value)?),
                    _ => None,
                };
                enum Base {
                    Pinned(fs::File),
                    Owned(fs::File),
                }
                let base = match &relative {
                    Some(relative) => {
                        Base::Owned(open_beneath(dir_fd.as_raw_fd(), relative, true)?)
                    }
                    None => Base::Pinned(dir_fd),
                };
                let raw = match &base {
                    Base::Pinned(file) => file.as_raw_fd(),
                    Base::Owned(file) => file.as_raw_fd(),
                };
                let mut audit = HomeAudit::default();
                let walk = audit_home_files(raw, "", &mut audit);
                drop(base);
                walk?;
                Ok(json!({
                    "files": audit.files,
                    "truncated": {"entries": audit.truncated_entries, "bytes": audit.truncated_bytes,
                                  "oversize": audit.oversize},
                    "skipped": audit.skipped,
                }))
            }
        }
        _ => unreachable!(),
    }
}

/// One bounded audit walk over a home directory. Same descent rules as a view
/// listing - every step pinned with `openat(.., O_NOFOLLOW)`, links skipped,
/// special files never read - but the outcome is a fact, not a failure: what
/// did not fit is counted in `truncated`, because an audit that refused to
/// report would be an audit that never runs.
#[derive(Default)]
struct HomeAudit {
    files: Vec<Value>,
    bytes: u64,
    skipped: u64,
    truncated_entries: u64,
    truncated_bytes: u64,
    oversize: u64,
    visited: usize,
}

fn audit_home_files(
    directory_fd: RawFd,
    prefix: &str,
    audit: &mut HomeAudit,
) -> Result<(), (&'static str, &'static str)> {
    for entry in
        fs::read_dir(fd_path(directory_fd)).map_err(|_| ("VIEW_IO", "home listing failed"))?
    {
        let entry = entry.map_err(|_| ("VIEW_IO", "home listing failed"))?;
        let name = entry.file_name();
        // A live Harness churns its own home: a file that vanishes between
        // listing and stat is churn, reported as a truncation fact - the same
        // rule the Server's local channel applies - never a failed audit.
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                audit.truncated_entries += 1;
                continue;
            }
            Err(_) => return Err(("VIEW_IO", "home metadata failed")),
        };
        audit.visited += 1;
        if audit.visited > MAX_VIEW_TRAVERSAL_ENTRIES {
            // The walk is cut here: at least this entry was not audited, and
            // the report says so instead of pretending the walk finished.
            audit.truncated_entries += 1;
            return Ok(());
        }
        let child_prefix = if prefix.is_empty() {
            name.to_string_lossy().into_owned()
        } else {
            format!("{prefix}/{}", name.to_string_lossy())
        };
        if metadata.file_type().is_symlink() {
            audit.skipped += 1;
            continue;
        }
        if metadata.is_dir() {
            match open_at(directory_fd, &name, true) {
                Ok(child_fd) => {
                    let walked = audit_home_files(child_fd, &child_prefix, audit);
                    unsafe { libc::close(child_fd) };
                    walked?;
                }
                Err(("VIEW_MISSING", _)) | Err(("VIEW_SPECIAL_FILE", _)) => {
                    audit.truncated_entries += 1;
                }
                Err(other) => return Err(other),
            }
        } else if metadata.is_file() {
            let size = metadata.len();
            if audit.files.len() >= MAX_HOME_FILES
                || size > MAX_HOME_FILE_BYTES as u64
                || audit.bytes + size > MAX_HOME_AUDIT_BYTES
            {
                audit.truncated_entries += 1;
                audit.truncated_bytes += size;
                if size > MAX_HOME_FILE_BYTES as u64 {
                    audit.oversize += 1;
                }
                continue;
            }
            let file = open_beneath(directory_fd, Path::new(&name), false)?;
            // SAFETY: `file` is a freshly opened descriptor this call owns.
            let mut owned = file;
            let bytes = read_home_entry(&mut owned)?;
            audit.files.push(json!({
                "path": child_prefix, "size": bytes.len(), "digest": digest(&bytes)
            }));
            audit.bytes += bytes.len() as u64;
        } else {
            // A FIFO, socket or device is never read; the audit says it was
            // seen and skipped rather than listing a file that is not there.
            audit.truncated_entries += 1;
        }
    }
    Ok(())
}

/// Read one open home entry to the end with the same swap protection as a
/// view read: the fd was opened with `O_NOFOLLOW`, identity is checked before
/// and after, and an entry that changed mid-read is churn the caller will see
/// as a different digest next time, not bytes this Worker invented.
fn read_home_entry(file: &fs::File) -> Result<Vec<u8>, (&'static str, &'static str)> {
    use std::io::Read;
    let before = file
        .metadata()
        .map_err(|_| ("VIEW_IO", "home file metadata failed"))?;
    if !before.is_file() {
        return Err(("VIEW_SPECIAL_FILE", "home file is not a regular file"));
    }
    let mut bytes = Vec::with_capacity(before.len() as usize);
    file.take(MAX_HOME_FILE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ("VIEW_IO", "home file read failed"))?;
    if bytes.len() as u64 > MAX_HOME_FILE_BYTES as u64 {
        return Err(("VIEW_FILE_LIMIT", "home file exceeds the audit bound"));
    }
    let after = file
        .metadata()
        .map_err(|_| ("VIEW_IO", "home file metadata failed"))?;
    let identity = |metadata: &fs::Metadata| (metadata.dev(), metadata.ino(), metadata.len());
    if identity(&after) != identity(&before) {
        return Err(("VIEW_CHANGED", "home file changed while it was being read"));
    }
    Ok(bytes)
}

/// The default home root is this user's own home, one step removed: the
/// Worker knows its `$HOME` on any machine it runs on, which is exactly what
/// "the machine that runs it" means.
fn default_home_root() -> io::Result<PathBuf> {
    let home =
        std::env::var("HOME").map_err(|_| io::Error::other("HOME is not set; pass --home-root"))?;
    let trimmed = home.trim();
    if trimmed.is_empty() {
        return Err(io::Error::other("HOME is not set; pass --home-root"));
    }
    Ok(Path::new(trimmed).join(".agent-box").join("profiles"))
}

/// The ephemeral root is deleted on exit; the home root must not be inside it,
/// and the root must not be inside the home. Either nesting would let one
/// lifetime destroy the other's facts.
fn ensure_home_outside_root(home_root: &Path, root: &Path) -> io::Result<()> {
    if home_root.starts_with(root) || root.starts_with(home_root) {
        return Err(io::Error::other(
            "--home-root must sit outside the ephemeral --root",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod view_listing_tests {
    use super::*;
    use std::os::unix::net::UnixListener;

    fn scratch(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("agentbox-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn listing(root: &std::path::Path) -> Result<Vec<String>, (&'static str, &'static str)> {
        let view_fd = fs::File::open(root).map_err(|_| ("VIEW_IO", "view open failed"))?;
        let mut files = Vec::new();
        let mut visited = 0usize;
        list_view_files(view_fd.as_raw_fd(), "", &mut files, &mut visited)?;
        Ok(files
            .iter()
            .map(|item| item["path"].as_str().unwrap().to_string())
            .collect())
    }

    /// A non-regular entry inside a view must not invalidate the listing.
    ///
    /// Codex writes argv0 alias symlinks under its home while it runs; the
    /// capture has to ignore them and still see the regular state files. Reads
    /// stay strict: an entry that is not listed is never declared, so `view.get`
    /// can never serve it.
    #[test]
    fn view_listing_skips_symlinks_and_keeps_regular_files() {
        let root = scratch("view-listing");
        fs::create_dir_all(root.join("tmp").join("arg0")).unwrap();
        fs::write(root.join("state.db"), b"state").unwrap();
        std::os::unix::fs::symlink("alias-target", root.join("tmp").join("arg0").join("codex"))
            .unwrap();
        assert_eq!(listing(&root).unwrap(), vec!["state.db".to_string()]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_special_file_is_refused_instead_of_skipped() {
        // Skipping a FIFO or socket would let a capture report a view that does
        // not describe what is actually there, so they are typed failures.
        let root = scratch("view-fifo");
        fs::write(root.join("state.db"), b"state").unwrap();
        let fifo = root.join("pipe");
        let name = std::ffi::CString::new(fifo.to_str().unwrap()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        let refused = listing(&root);
        assert_eq!(refused.unwrap_err().0, "VIEW_SPECIAL_FILE");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_unix_socket_is_refused_instead_of_skipped() {
        let root = scratch("view-socket");
        let _socket = UnixListener::bind(root.join("agent.sock")).unwrap();
        assert_eq!(listing(&root).unwrap_err().0, "VIEW_SPECIAL_FILE");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_forest_of_directories_and_links_stays_within_the_traversal_bound() {
        // Empty directories and skipped symlinks used to cost nothing, so a tree
        // made only of them could be walked without limit. Every entry visited is
        // counted, so traversal is bounded whatever the mix is.
        let root = scratch("view-forest");
        for index in 0..(MAX_VIEW_TRAVERSAL_ENTRIES + 8) {
            let directory = root.join(format!("d{index}"));
            fs::create_dir(&directory).unwrap();
            std::os::unix::fs::symlink("nowhere", directory.join("alias")).unwrap();
        }
        assert_eq!(listing(&root).unwrap_err().0, "VIEW_TRAVERSAL_LIMIT");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_view_over_the_file_limit_is_refused_with_its_own_code() {
        let root = scratch("view-too-many-files");
        for index in 0..1025 {
            fs::write(root.join(format!("f{index:04}")), b"x").unwrap();
        }
        assert_eq!(listing(&root).unwrap_err().0, "VIEW_FILE_LIMIT");
        let _ = fs::remove_dir_all(&root);
    }

    /// A view entry that is not there is a deterministic refusal. The sidecar
    /// knows a captured path was just listed, so converting that refusal into
    /// "the bytes moved" is its decision, never the Worker's.
    #[test]
    fn a_missing_view_entry_is_refused_without_a_retry_hint() {
        let root = scratch("view-missing-entry");
        committed_view(&root, "view-1");
        let refused = handle_view(
            &root,
            "view.get",
            &json!({"viewId":"view-1","path":"state.db"}),
        );
        assert_eq!(refused.unwrap_err().0, "VIEW_MISSING");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn open_at_maps_a_link_a_missing_entry_and_a_non_directory() {
        let root = scratch("view-open-mapping");
        fs::write(root.join("regular"), b"x").unwrap();
        std::os::unix::fs::symlink("regular", root.join("link")).unwrap();
        let fd = fs::File::open(&root).unwrap();
        let base = fd.as_raw_fd();
        assert_eq!(
            open_at(base, std::ffi::OsStr::new("link"), false).unwrap_err(),
            ("VIEW_SPECIAL_FILE", "view path resolves through a symlink")
        );
        assert_eq!(
            open_at(base, std::ffi::OsStr::new("gone"), true)
                .unwrap_err()
                .0,
            "VIEW_MISSING"
        );
        assert_eq!(
            open_at(base, std::ffi::OsStr::new("regular"), true)
                .unwrap_err()
                .0,
            "VIEW_INVALID"
        );
        drop(fd);
        let _ = fs::remove_dir_all(&root);
    }

    fn committed_view(root: &std::path::Path, id: &str) -> std::path::PathBuf {
        let dir = root.join("views").join(id);
        fs::create_dir_all(dir.join("ready")).unwrap();
        fs::write(dir.join(".committed"), b"ready").unwrap();
        dir
    }

    #[test]
    fn a_first_fetch_past_the_end_is_an_invalid_request_not_churn() {
        let root = scratch("view-shrunk");
        let dir = committed_view(&root, "view-shrunk-1");
        fs::write(dir.join("ready").join("state.db"), b"brief").unwrap();
        let refused = handle_view(
            &root,
            "view.get",
            &json!({"viewId":"view-shrunk-1","path":"state.db","offset":64}),
        );
        assert_eq!(refused.unwrap_err().0, "VIEW_INVALID");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_read_of_something_that_is_not_a_regular_file_is_refused() {
        for (name, code, make) in [
            ("view-get-symlink", "VIEW_SPECIAL_FILE", 0u8),
            ("view-get-fifo", "VIEW_SPECIAL_FILE", 1u8),
            ("view-get-missing", "VIEW_MISSING", 2u8),
        ] {
            let root = scratch(name);
            let dir = committed_view(&root, "view-1");
            let ready = dir.join("ready").join("state.db");
            match make {
                0 => {
                    fs::write(dir.join("ready").join("target"), b"state").unwrap();
                    std::os::unix::fs::symlink("target", &ready).unwrap();
                }
                1 => {
                    let path = std::ffi::CString::new(ready.to_str().unwrap()).unwrap();
                    assert_eq!(unsafe { libc::mkfifo(path.as_ptr(), 0o600) }, 0);
                }
                _ => {}
            }
            assert_eq!(
                handle_view(
                    &root,
                    "view.get",
                    &json!({"viewId":"view-1","path":"state.db"})
                )
                .unwrap_err()
                .0,
                code,
                "{name}",
            );
            let _ = fs::remove_dir_all(&root);
        }
    }

    /// A declared file that is swapped for a link to something outside the
    /// view is never read through: the open refuses the link itself.
    #[test]
    fn a_swapped_in_symlink_is_never_read_through_to_its_target() {
        let root = scratch("view-swap-final");
        let dir = committed_view(&root, "view-1");
        let outside = root.join("outside-sentinel");
        fs::write(&outside, b"VIEW-OUTSIDE-SENTINEL").unwrap();
        let ready = dir.join("ready");
        fs::write(ready.join("state.db"), b"state").unwrap();
        let link = ready.join("state.db.link");
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        fs::rename(&link, ready.join("state.db")).unwrap();
        let refused = handle_view(
            &root,
            "view.get",
            &json!({"viewId":"view-1","path":"state.db"}),
        );
        assert_eq!(refused.unwrap_err().0, "VIEW_SPECIAL_FILE");
        assert_eq!(fs::read(&outside).unwrap(), b"VIEW-OUTSIDE-SENTINEL");
        let _ = fs::remove_dir_all(&root);
    }

    /// A declared parent directory swapped for a link cannot redirect the
    /// walk either: every component is opened no-follow from the pinned view.
    #[test]
    fn a_swapped_parent_directory_cannot_redirect_the_read() {
        let root = scratch("view-swap-parent");
        let dir = committed_view(&root, "view-1");
        let outside = root.join("outside-tree");
        fs::create_dir_all(outside.join("b")).unwrap();
        fs::write(outside.join("b").join("state.db"), b"VIEW-OUTSIDE-SENTINEL").unwrap();
        let ready = dir.join("ready");
        fs::create_dir_all(ready.join("a").join("b")).unwrap();
        fs::write(ready.join("a").join("b").join("state.db"), b"state").unwrap();
        let link = ready.join("a.link");
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        fs::remove_dir_all(ready.join("a")).unwrap();
        fs::rename(&link, ready.join("a")).unwrap();
        let refused = handle_view(
            &root,
            "view.get",
            &json!({"viewId":"view-1","path":"a/b/state.db"}),
        );
        // The kernel answers ENOTDIR/ELOOP for a link where a walkable
        // directory was required; both are deterministic hard failures, never
        // churn, and the outside bytes are never served.
        assert_eq!(refused.unwrap_err().0, "VIEW_INVALID");
        assert_eq!(
            fs::read(outside.join("b").join("state.db")).unwrap(),
            b"VIEW-OUTSIDE-SENTINEL"
        );
        let _ = fs::remove_dir_all(&root);
    }

    /// The size bound is taken from the opened fd and the read is bounded by
    /// it, so a file that lies about - or exceeds - the bound is refused
    /// without the Worker ever buffering more than the limit allows.
    #[test]
    fn an_oversized_declared_file_is_refused_without_an_unbounded_read() {
        let root = scratch("view-oversize");
        let dir = committed_view(&root, "view-1");
        let file = dir.join("ready").join("state.db");
        let oversize = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&file)
            .unwrap();
        oversize.set_len(MAX_ARTIFACT_BYTES as u64 + 1).unwrap();
        drop(oversize);
        let refused = handle_view(
            &root,
            "view.get",
            &json!({"viewId":"view-1","path":"state.db"}),
        );
        assert_eq!(refused.unwrap_err().0, "VIEW_INVALID");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_manifest_over_the_file_limit_is_refused_at_prepare() {
        let root = scratch("view-prepare-limit");
        let entry = json!({"path":"f","digest":format!("sha256:{}", "0".repeat(64)),"size":0});
        let files = (0..1025).map(|_| entry.clone()).collect::<Vec<_>>();
        assert_eq!(
            handle_view(&root, "view.prepare", &json!({"viewId":"v","files":files}))
                .unwrap_err()
                .0,
            "VIEW_FILE_LIMIT"
        );
        assert!(!root.join("views").join("v").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_committed_view_over_the_file_limit_is_refused_when_listed() {
        let root = scratch("view-list-too-many");
        let dir = committed_view(&root, "view-1");
        for index in 0..1025 {
            fs::write(dir.join("ready").join(format!("f{index:04}")), b"x").unwrap();
        }
        assert_eq!(
            handle_view(&root, "view.list", &json!({"viewId":"view-1"}))
                .unwrap_err()
                .0,
            "VIEW_FILE_LIMIT",
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn skipped_symlinks_survive_the_listing_and_are_still_cleanable() {
        let root = scratch("view-cleanup");
        fs::write(root.join("state.db"), b"state").unwrap();
        std::os::unix::fs::symlink("state.db", root.join("alias")).unwrap();
        assert_eq!(listing(&root).unwrap(), vec!["state.db".to_string()]);
        assert!(
            root.join("alias").symlink_metadata().is_ok(),
            "skipping must not delete the entry"
        );
        fs::remove_dir_all(&root).unwrap();
        assert!(!root.exists());
    }
}

/// Adding error-code values must not change the control-protocol response shape.
///
/// The view refusals that used to share one code now have their own, and one of
/// them (`VIEW_CHANGED`) is expected to be retried by a content-stability
/// capture. Neither move alters what crosses the wire: a failed view request is
/// still one `WorkerError` frame carrying one `error` object with exactly `code`
/// and `message`, which is why `protocol::PROTOCOL_VERSION` stays 3.
#[cfg(test)]
mod view_error_envelope_tests {
    use super::*;

    async fn envelope(code: &str) -> Value {
        let mut buffer = Vec::new();
        write_error_for(&mut buffer, 7, "req-1", code, "a view refusal")
            .await
            .unwrap();
        let frame = protocol::decode_frame(&buffer).unwrap();
        assert_eq!(frame.kind, protocol::FrameKind::WorkerError);
        assert_eq!(frame.sequence, 7);
        serde_json::from_slice(&frame.payload).unwrap()
    }

    #[tokio::test]
    async fn every_new_view_code_travels_in_the_same_error_envelope() {
        for code in [
            "VIEW_SPECIAL_FILE",
            "VIEW_TRAVERSAL_LIMIT",
            "VIEW_FILE_LIMIT",
            "VIEW_CHANGED",
            "VIEW_INVALID",
        ] {
            let payload = envelope(code).await;
            assert_eq!(
                payload.as_object().unwrap().len(),
                3,
                "the response shape must not grow: {payload}",
            );
            assert_eq!(payload["ok"], json!(false));
            assert_eq!(payload["requestId"], json!("req-1"));
            assert_eq!(
                payload["error"].as_object().unwrap().len(),
                2,
                "the error object must not grow: {payload}",
            );
            assert_eq!(payload["error"]["code"], json!(code));
            assert_eq!(payload["error"]["message"], json!("a view refusal"));
        }
    }

    #[tokio::test]
    async fn the_worker_still_answers_at_the_control_protocol_version_it_announces() {
        // The client compares this number on handshake, so it is checked against
        // the constant the same frame encoder uses rather than a literal here.
        assert_eq!(protocol::PROTOCOL_VERSION, 4);
        let mut buffer = Vec::new();
        write_error(&mut buffer, 4, "VIEW_CHANGED", "a view refusal")
            .await
            .unwrap();
        let frame = protocol::decode_frame(&buffer).unwrap();
        let payload: Value = serde_json::from_slice(&frame.payload).unwrap();
        assert_eq!(payload["error"]["code"], json!("VIEW_CHANGED"));
    }
}

/// The home operation family: durable per-Profile state on this machine, the
/// only place the harness's native facts live. Each rule here is one a gate
/// depends on, so each has a counter-example.
#[cfg(test)]
mod home_tests {
    use super::*;
    use serde_json::json;

    fn scratch(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("agentbox-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn marker() -> Value {
        json!({"profileId": "profile_aaaa", "harnessType": "pi", "nativeHome": ".pi"})
    }

    #[test]
    fn a_locator_refuses_traversal_absolute_and_bad_segments() {
        assert_eq!(home_locator("pi/.pi").unwrap().len(), 2);
        assert_eq!(home_locator("pi").unwrap().len(), 1);
        for bad in [
            "../escape",
            "pi/../escape",
            "/absolute",
            "pi//double",
            "pi/.",
            ".",
            "..",
            "pi/with space",
            "pi/back\\slash",
            "",
        ] {
            assert_eq!(
                home_locator(bad).unwrap_err().0,
                "HOME_LOCATOR_INVALID",
                "locator {bad:?} must be refused"
            );
        }
    }

    #[test]
    fn prepare_writes_then_verifies_the_marker_and_refuses_a_conflict() {
        let root = scratch("home-marker");
        let arguments = |marker: Value| json!({"locator": "pi-test/.pi", "marker": marker});
        let first = handle_home(&root, "home.prepare", &arguments(marker())).unwrap();
        assert_eq!(first["created"], json!(true));
        assert_eq!(first["markerState"], json!("written"));
        assert!(root.join("pi-test/.agentbox-profile.json").is_file());
        assert!(root.join("pi-test/.pi").is_dir());
        let again = handle_home(&root, "home.prepare", &arguments(marker())).unwrap();
        assert_eq!(again["created"], json!(false));
        assert_eq!(again["markerState"], json!("verified"));
        let mut foreign = marker();
        foreign["profileId"] = json!("profile_bbbb");
        let conflict = handle_home(&root, "home.prepare", &arguments(foreign)).unwrap_err();
        assert_eq!(conflict.0, "HOME_MARKER_CONFLICT");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn prepare_creates_the_audit_window_before_the_harness_runs() {
        let root = scratch("home-window");
        let arguments = json!({
            "locator": "pi-test/.pi",
            "marker": marker(),
            "window": ".pi/agent/sessions",
        });
        let prepared = handle_home(&root, "home.prepare", &arguments).unwrap();
        let home = PathBuf::from(prepared["path"].as_str().unwrap());
        assert!(home.join("agent").join("sessions").is_dir());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn list_audits_digests_and_reports_what_it_could_not_audit() {
        let root = scratch("home-list");
        let arguments = json!({
            "locator": "pi-test/.pi",
            "marker": marker(),
            "window": ".pi/sessions",
        });
        handle_home(&root, "home.prepare", &arguments).unwrap();
        let home = root.join("pi-test").join(".pi");
        fs::write(home.join("sessions").join("journal.jsonl"), b"line one\n").unwrap();
        fs::write(home.join("sessions").join("state.db"), b"state-bytes").unwrap();
        std::os::unix::fs::symlink("elsewhere", home.join("alias")).unwrap();
        let listed = handle_home(&root, "home.list", &json!({"locator": "pi-test/.pi"})).unwrap();
        assert_eq!(listed["skipped"], json!(1));
        assert_eq!(listed["truncated"]["entries"], json!(0));
        let files = listed["files"].as_array().unwrap();
        // The role-relative listing also sees the ownership marker; the
        // Server's audit excludes it by name, the Worker just reports.
        assert_eq!(files.len(), 3);
        assert!(files
            .iter()
            .all(|file| file["digest"].as_str().unwrap().starts_with("sha256:")));
        // A relative window lists only its own subtree, like a view does.
        let window = handle_home(
            &root,
            "home.list",
            &json!({"locator": "pi-test/.pi", "relative": ".pi/sessions"}),
        )
        .unwrap();
        assert_eq!(window["files"].as_array().unwrap().len(), 2);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn list_reports_truncation_instead_of_refusing_a_large_tree() {
        let root = scratch("home-truncated");
        let arguments = json!({"locator": "pi-test/.pi", "marker": marker()});
        handle_home(&root, "home.prepare", &arguments).unwrap();
        let home = root.join("pi-test").join(".pi");
        let big = home.join("big.bin");
        fs::write(&big, vec![7u8; MAX_HOME_FILE_BYTES as usize + 1]).unwrap();
        let listed = handle_home(&root, "home.list", &json!({"locator": "pi-test/.pi"})).unwrap();
        // The oversized file is a fact, not a failure: it is counted, its
        // bytes are counted, and nothing was read from it.
        assert_eq!(listed["truncated"]["oversize"], json!(1));
        assert!(listed["truncated"]["entries"].as_u64().unwrap() >= 1);
        assert_eq!(listed["files"].as_array().unwrap().len(), 1);
        let _ = fs::remove_dir_all(&big);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn get_serves_bounded_chunks_of_one_home_file() {
        let root = scratch("home-get");
        let arguments = json!({"locator": "pi-test/.pi", "marker": marker()});
        handle_home(&root, "home.prepare", &arguments).unwrap();
        let payload = b"0123456789abcdef";
        fs::write(root.join("pi-test/.pi/journal.jsonl"), payload).unwrap();
        let chunk = handle_home(
            &root,
            "home.get",
            &json!({"locator": "pi-test/.pi", "path": ".pi/journal.jsonl",
                    "offset": 4, "maxLength": 4}),
        )
        .unwrap();
        assert_eq!(chunk["offset"], json!(4));
        assert_eq!(chunk["nextOffset"], json!(8));
        assert_eq!(chunk["eof"], json!(false));
        assert_eq!(
            chunk["digest"],
            json!(digest(payload)),
            "the digest covers the whole file, as a view fetch does"
        );
        let missing = handle_home(
            &root,
            "home.get",
            &json!({"locator": "pi-test/.pi", "path": ".pi/no-such-file",
                    "offset": 0, "maxLength": 8}),
        )
        .unwrap_err();
        assert_eq!(missing.0, "VIEW_MISSING");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_session_store_is_one_directory_per_harness_with_no_profile_marker() {
        let root = scratch("session-store");
        let prepared = handle_home(
            &root,
            "home.prepare",
            &json!({"locator": "codex", "harness": "codex", "kind": "session-store"}),
        )
        .unwrap();
        let store = root.join("_sessions").join("codex");
        assert_eq!(prepared["markerState"], "session-store");
        assert!(store.is_dir());
        assert!(!store.join(HOME_MARKER_FILE).exists(), "no profile marker on a store");
        // Idempotent: preparing twice reports created=false and keeps the files.
        std::fs::write(store.join("session.jsonl"), b"{}\n").unwrap();
        let again = handle_home(
            &root,
            "home.prepare",
            &json!({"locator": "codex", "harness": "codex", "kind": "session-store"}),
        )
        .unwrap();
        assert_eq!(again["created"], false);
        assert!(store.join("session.jsonl").exists());
        // The store is readable through the ordinary home ops by locator.
        let listed = handle_home(
            &root,
            "home.list",
            &json!({"locator": "_sessions/codex"}),
        )
        .unwrap();
        assert!(!listed["files"].as_array().unwrap().is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_profile_locator_may_not_claim_the_reserved_store_segment() {
        let root = scratch("store-reserved");
        let refused = handle_home(
            &root,
            "home.prepare",
            &json!({"locator": "_sessions/codex", "marker": marker()}),
        )
        .unwrap_err();
        assert_eq!(refused.0, "HOME_LOCATOR_INVALID");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn an_unprepared_home_is_not_found_not_created_by_reads() {
        let root = scratch("home-missing");
        let missing =
            handle_home(&root, "home.list", &json!({"locator": "pi-test/.pi"})).unwrap_err();
        assert_eq!(missing.0, "HOME_NOT_FOUND");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_symlink_segment_cannot_relocate_a_home_outside_the_root() {
        let root = scratch("home-outside");
        let outside = scratch("home-outside-target");
        std::os::unix::fs::symlink(&outside, root.join("pi-test")).unwrap();
        let arguments = json!({"locator": "pi-test/.pi", "marker": marker()});
        // `create_dir_all` through the link succeeds on the filesystem, and
        // that is exactly the escape the inside-root check exists to refuse:
        // the resolved home is outside the home root, so nothing is prepared.
        let refused = handle_home(&root, "home.prepare", &arguments).unwrap_err();
        assert_eq!(refused.0, "HOME_OUTSIDE_ROOT");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn the_home_root_may_not_nest_the_ephemeral_root() {
        let nested = scratch("home-nested-root").join("worker-root");
        let home = nested.join("home");
        assert!(ensure_home_outside_root(&home, &nested).is_err());
        assert!(ensure_home_outside_root(&nested, &home).is_err());
        let separate = scratch("home-separate");
        let other = scratch("home-separate-other");
        assert!(ensure_home_outside_root(&separate, &other).is_ok());
        let _ = fs::remove_dir_all(&separate);
        let _ = fs::remove_dir_all(&other);
    }

    #[test]
    fn delete_removes_one_regular_file_and_nothing_else() {
        let root = scratch("home-delete");
        let arguments = json!({"locator": "pi-test/.pi", "marker": marker()});
        handle_home(&root, "home.prepare", &arguments).unwrap();
        let home = root.join("pi-test").join(".pi");
        fs::write(home.join("leaked.txt"), b"secret bytes").unwrap();
        fs::create_dir_all(home.join("keep").join("me")).unwrap();
        fs::write(home.join("keep").join("me").join("state.db"), b"keep").unwrap();
        let removed = handle_home(
            &root,
            "home.delete",
            &json!({"locator": "pi-test/.pi", "path": ".pi/leaked.txt"}),
        )
        .unwrap();
        assert_eq!(removed["deleted"], json!(".pi/leaked.txt"));
        assert!(!home.join("leaked.txt").exists());
        assert!(home.join("keep").join("me").join("state.db").is_file());
        // A directory is never a deletion target, and a second delete of the
        // same name is a typed miss rather than a silent success.
        let directory = handle_home(
            &root,
            "home.delete",
            &json!({"locator": "pi-test/.pi", "path": ".pi/keep"}),
        )
        .unwrap_err();
        assert_eq!(directory.0, "HOME_IO");
        let twice = handle_home(
            &root,
            "home.delete",
            &json!({"locator": "pi-test/.pi", "path": ".pi/leaked.txt"}),
        )
        .unwrap_err();
        assert_eq!(twice.0, "VIEW_MISSING");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_default_home_root_sits_under_this_users_home() {
        let root = default_home_root().unwrap();
        let home = PathBuf::from(std::env::var("HOME").unwrap());
        assert!(root.starts_with(home));
        assert!(root.ends_with(".agent-box/profiles"));
    }
}
