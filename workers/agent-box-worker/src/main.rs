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
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
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
    let (root, workspace, result_ttl_secs) = arguments(&args)?;
    let root = root.ok_or_else(|| io::Error::other("--root is required"))?;
    let root = prepare_root(Path::new(&root))?;
    let workspace = match workspace {
        Some(path) => Some(canonical_directory(Path::new(&path))?),
        None => None,
    };
    let ephemeral = workspace.is_none();
    let outcome = serve(root.clone(), workspace, result_ttl_secs).await;
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

fn arguments(args: &[String]) -> io::Result<(Option<String>, Option<String>, u64)> {
    let mut root = None;
    let mut workspace = None;
    let mut result_ttl_secs = RESULT_TTL_SECS;
    let mut index = 1;
    while index < args.len() {
        if index + 1 >= args.len() {
            return Err(io::Error::other("malformed arguments"));
        }
        match args[index].as_str() {
            "--root" | "--workspace" => {
                let target = if args[index] == "--root" {
                    &mut root
                } else {
                    &mut workspace
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
    Ok((root, workspace, result_ttl_secs))
}

async fn serve(root: PathBuf, workspace: Option<PathBuf>, result_ttl_secs: u64) -> io::Result<()> {
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
                            &request.arguments, &workspace, &root,
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
                if !system
                    && !wsl_resolver
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
            for file in &manifest.files {
                let path = dir.join("ready").join(safe_relative(&file.path)?);
                let bytes =
                    fs::read(path).map_err(|_| ("VIEW_INCOMPLETE", "view has incomplete files"))?;
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
            let ready = dir.join("ready");
            let mut files = Vec::new();
            let mut visited = 0usize;
            list_view_files(&ready, &ready, &mut files, &mut visited)?;
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
            let rel = safe_relative(value_string(args, "path")?)?;
            let target = dir.join("ready").join(rel);
            let metadata = view_entry_metadata(&target)?;
            // A view lists regular files. An entry of any other type is either a
            // special file that was never a view file, or a regular file that
            // changed type under the read; both are refused, and the caller's
            // classifier decides whether the second one is retryable.
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(("VIEW_SPECIAL_FILE", "view file is not a regular file"));
            }
            if metadata.len() as usize > MAX_ARTIFACT_BYTES {
                return Err(("VIEW_INVALID", "view file exceeds the artifact bound"));
            }
            let bytes = read_view_bytes(&target)?;
            let offset = args.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
            let maximum = args
                .get("maxLength")
                .and_then(Value::as_u64)
                .unwrap_or(MAX_FETCH_BYTES as u64) as usize;
            if maximum == 0 || maximum > MAX_FETCH_BYTES {
                return Err(("VIEW_INVALID", "view fetch range is invalid"));
            }
            if offset > bytes.len() {
                // Every offset but the first comes from this Worker's previous
                // response, so an offset past the end means the file got shorter
                // while it was being fetched.
                return Err((
                    "VIEW_CHANGED",
                    "view file shrank below the requested offset",
                ));
            }
            let end = (offset + maximum).min(bytes.len());
            Ok(
                json!({"path":value_string(args,"path")?,"offset":offset,"nextOffset":end,"totalBytes":bytes.len(),"digest":digest(&bytes),"data":BASE64.encode(&bytes[offset..end]),"eof":end==bytes.len()}),
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

/// List one view directory, distinguishing a subtree that moved under the walk
/// from a plain fault: only the first is a content change a caller may retry.
fn read_view_dir(directory: &Path) -> Result<fs::ReadDir, (&'static str, &'static str)> {
    fs::read_dir(directory).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => (
            "VIEW_CHANGED",
            "view directory vanished while it was being listed",
        ),
        _ => ("VIEW_IO", "view listing failed"),
    })
}

/// The metadata of one view entry, distinguishing "it moved" from "it failed".
fn view_entry_metadata(path: &Path) -> Result<fs::Metadata, (&'static str, &'static str)> {
    path.symlink_metadata().map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => ("VIEW_CHANGED", "view entry vanished before it was read"),
        _ => ("VIEW_IO", "view metadata failed"),
    })
}

/// The bytes of one declared view file, distinguishing "it moved" from a fault.
fn read_view_bytes(path: &Path) -> Result<Vec<u8>, (&'static str, &'static str)> {
    fs::read(path).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => ("VIEW_CHANGED", "view file vanished during the read"),
        _ => ("VIEW_IO", "view file read failed"),
    })
}

fn list_view_files(
    base: &Path,
    directory: &Path,
    files: &mut Vec<Value>,
    visited: &mut usize,
) -> Result<(), (&'static str, &'static str)> {
    for entry in read_view_dir(directory)? {
        let entry = entry.map_err(|_| ("VIEW_IO", "view listing failed"))?;
        let metadata = view_entry_metadata(&entry.path())?;
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
        if metadata.is_dir() {
            list_view_files(base, &entry.path(), files, visited)?;
        } else if metadata.is_file() {
            let relative = entry
                .path()
                .strip_prefix(base)
                .map_err(|_| ("VIEW_INVALID", "view path escaped"))?
                .to_string_lossy()
                .replace('\\', "/");
            files.push(json!({"path":relative,"size":metadata.len()}));
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
        let mut files = Vec::new();
        let mut visited = 0usize;
        list_view_files(root, root, &mut files, &mut visited)?;
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

    /// A directory that moved while it was listed is churn, not a plain fault.
    #[test]
    fn a_directory_that_vanished_mid_listing_is_reported_as_a_change() {
        let root = scratch("view-vanished-dir");
        fs::write(root.join("state.db"), b"state").unwrap();
        let mut files = Vec::new();
        let mut visited = 0usize;
        let missing = root.join("gone");
        assert_eq!(
            list_view_files(&root, &missing, &mut files, &mut visited)
                .unwrap_err()
                .0,
            "VIEW_CHANGED",
        );
        assert!(files.is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    fn committed_view(root: &std::path::Path, id: &str) -> std::path::PathBuf {
        let dir = root.join("views").join(id);
        fs::create_dir_all(dir.join("ready")).unwrap();
        fs::write(dir.join(".committed"), b"ready").unwrap();
        dir
    }

    #[test]
    fn a_file_that_shortened_under_the_fetch_is_reported_as_a_change() {
        let root = scratch("view-shrunk");
        let dir = committed_view(&root, "view-shrunk-1");
        fs::write(dir.join("ready").join("state.db"), b"brief").unwrap();
        let refused = handle_view(
            &root,
            "view.get",
            &json!({"viewId":"view-shrunk-1","path":"state.db","offset":64}),
        );
        assert_eq!(refused.unwrap_err().0, "VIEW_CHANGED");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_read_of_something_that_is_not_a_regular_file_is_refused() {
        for (name, code, make) in [
            ("view-get-symlink", "VIEW_SPECIAL_FILE", 0u8),
            ("view-get-fifo", "VIEW_SPECIAL_FILE", 1u8),
            ("view-get-missing", "VIEW_CHANGED", 2u8),
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
        assert_eq!(protocol::PROTOCOL_VERSION, 3);
        let mut buffer = Vec::new();
        write_error(&mut buffer, 4, "VIEW_CHANGED", "a view refusal")
            .await
            .unwrap();
        let frame = protocol::decode_frame(&buffer).unwrap();
        let payload: Value = serde_json::from_slice(&frame.payload).unwrap();
        assert_eq!(payload["error"]["code"], json!("VIEW_CHANGED"));
    }
}
