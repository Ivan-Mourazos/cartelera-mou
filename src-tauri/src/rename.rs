use crate::database::Database;
use crate::error::{BackendError, BackendResult};
use crate::models::{
    PreflightIssue, PreflightResult, RenameBatchRequest, RenameBatchResult, RenameItemResult,
    RenameJournal, RenameJournalEntry, RenamePlan, UndoResult,
};
use chrono::Utc;
use std::collections::{HashMap, HashSet};
#[cfg(not(target_os = "windows"))]
use std::fs::File;
use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::UNIX_EPOCH;
use uuid::Uuid;

const WINDOWS_MAX_COMPONENT_UTF16: usize = 255;
const WINDOWS_MAX_PATH_UTF16: usize = 260;
const WINDOWS_PATH_WARNING_UTF16: usize = 240;

struct PreparedBatch {
    plans: Vec<RenamePlan>,
    preflight: PreflightResult,
}

#[derive(Debug)]
struct FileTransactionFailure {
    message: String,
    recovery_required: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RecoveryReport {
    pub recovered_batches: usize,
    pub recovery_required_batches: usize,
    pub corrupt_journals: usize,
    pub untracked_journals: usize,
}

pub struct RenameCoordinator {
    operation_lock: Mutex<()>,
}

impl Default for RenameCoordinator {
    fn default() -> Self {
        Self::new()
    }
}

impl RenameCoordinator {
    pub fn new() -> Self {
        Self {
            operation_lock: Mutex::new(()),
        }
    }

    fn lock(&self) -> BackendResult<MutexGuard<'_, ()>> {
        self.operation_lock.lock().map_err(|_| {
            BackendError::State("el mutex global de renombrado está contaminado".into())
        })
    }

    pub fn execute_batch(
        &self,
        database: &Database,
        request: &RenameBatchRequest,
        journal_directory: &Path,
    ) -> BackendResult<RenameBatchResult> {
        let _guard = self.lock()?;
        execute_batch_unlocked(database, request, journal_directory)
    }

    pub fn undo(&self, database: &Database, history_id: i64) -> BackendResult<UndoResult> {
        let _guard = self.lock()?;
        undo_unlocked(database, history_id)
    }

    pub fn recover_incomplete(
        &self,
        database: &Database,
        journal_directory: &Path,
    ) -> BackendResult<RecoveryReport> {
        let _guard = self.lock()?;
        recover_incomplete_unlocked(database, journal_directory)
    }
}

pub fn preflight(
    database: &Database,
    request: &RenameBatchRequest,
) -> BackendResult<PreflightResult> {
    Ok(prepare(database, request, &Uuid::new_v4().to_string())?.preflight)
}

fn prepare(
    database: &Database,
    request: &RenameBatchRequest,
    batch_uuid: &str,
) -> BackendResult<PreparedBatch> {
    if request.items.is_empty() {
        return Ok(PreparedBatch {
            plans: Vec::new(),
            preflight: PreflightResult {
                valid: false,
                ready_count: 0,
                issues: vec![PreflightIssue {
                    client_id: "batch".into(),
                    code: "emptyBatch".into(),
                    message: "el lote no contiene archivos".into(),
                    severity: "error".into(),
                }],
            },
        });
    }
    if request.items.len() > 10_000 {
        return Err(BackendError::InvalidInput(
            "un lote no puede contener más de 10 000 archivos".into(),
        ));
    }

    let mut plans = Vec::with_capacity(request.items.len());
    let mut issues = Vec::new();
    let mut invalid_clients = HashSet::new();
    let mut media_ids = HashMap::<i64, String>::new();
    let mut target_clients = HashMap::<String, Vec<String>>::new();
    let mut batch_sources = HashSet::new();
    for requested in &request.items {
        match database.media_file(requested.media_file_id) {
            Ok(stored) => {
                batch_sources.insert(stored.current_path.to_string_lossy().to_lowercase());
            }
            Err(BackendError::NotFound(_)) => {}
            Err(error) => return Err(error),
        }
    }

    for (index, requested) in request.items.iter().enumerate() {
        let client_id = requested.resolved_client_id();
        if let Some(previous_client) = media_ids.insert(requested.media_file_id, client_id.clone())
        {
            push_error(
                &mut issues,
                &mut invalid_clients,
                previous_client,
                "duplicateMediaFile",
                "el mismo archivo aparece más de una vez en el lote",
            );
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id,
                "duplicateMediaFile",
                "el mismo archivo aparece más de una vez en el lote",
            );
            continue;
        }

        let stored = match database.media_file(requested.media_file_id) {
            Ok(stored) => stored,
            Err(BackendError::NotFound(_)) => {
                push_error(
                    &mut issues,
                    &mut invalid_clients,
                    client_id,
                    "missingLibraryItem",
                    "el archivo ya no existe en la biblioteca",
                );
                continue;
            }
            Err(error) => return Err(error),
        };
        let proposal = requested.proposed_filename.trim();
        if proposal != requested.proposed_filename || proposal.is_empty() {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "invalidFilename",
                "el nombre no puede estar vacío ni empezar o terminar con espacios",
            );
        }
        if proposal.contains('/') || proposal.contains('\\') || proposal == "." || proposal == ".."
        {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "pathSeparator",
                "la propuesta debe ser solo un nombre de archivo, no una ruta",
            );
        }
        if proposal.chars().any(|character| {
            character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*')
        }) {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "windowsInvalidCharacter",
                "el nombre contiene caracteres incompatibles con Windows",
            );
        }
        if proposal.ends_with('.') || proposal.ends_with(' ') {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "windowsTrailingCharacter",
                "Windows no admite nombres terminados en punto o espacio",
            );
        }
        if is_reserved_windows_name(proposal) {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "windowsReservedName",
                "el nombre utiliza un dispositivo reservado de Windows",
            );
        }
        if proposal.encode_utf16().count() > WINDOWS_MAX_COMPONENT_UTF16 {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "filenameTooLong",
                "el nombre supera los 255 caracteres UTF-16; no se ha recortado",
            );
        }
        let extension = Path::new(proposal)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if !extension.eq_ignore_ascii_case(&stored.extension) {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "extensionChanged",
                "la extensión del vídeo debe conservarse",
            );
        }

        let metadata = match std::fs::symlink_metadata(&stored.current_path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                push_error(
                    &mut issues,
                    &mut invalid_clients,
                    client_id.clone(),
                    "symbolicLink",
                    "no se renombran enlaces simbólicos",
                );
                continue;
            }
            Ok(metadata) if metadata.is_file() => metadata,
            Ok(_) => {
                push_error(
                    &mut issues,
                    &mut invalid_clients,
                    client_id.clone(),
                    "sourceNotFile",
                    "la ruta registrada ya no es un archivo",
                );
                continue;
            }
            Err(_) => {
                push_error(
                    &mut issues,
                    &mut invalid_clients,
                    client_id.clone(),
                    "sourceMissing",
                    "el archivo original ya no existe",
                );
                continue;
            }
        };
        let parent = stored.current_path.parent().ok_or_else(|| {
            BackendError::InvalidInput("el archivo no tiene una carpeta contenedora".into())
        })?;
        let target = parent.join(proposal);
        if stored.current_filename == proposal {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "noChange",
                "el nombre propuesto es igual al actual",
            );
        }
        if let Some(existing) = case_insensitive_entry(parent, proposal)? {
            let occupied_by_batch_source =
                batch_sources.contains(&existing.to_string_lossy().to_lowercase());
            if !same_case_insensitive_path(&existing, &stored.current_path)
                && !occupied_by_batch_source
            {
                push_error(
                    &mut issues,
                    &mut invalid_clients,
                    client_id.clone(),
                    "targetExists",
                    "ya existe un archivo con ese nombre; nunca se sobrescribirá",
                );
            }
        }

        let path_length = target.to_string_lossy().encode_utf16().count();
        if path_length >= WINDOWS_MAX_PATH_UTF16 {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "pathTooLong",
                "la ruta alcanzaría 260 caracteres UTF-16; no se ha recortado",
            );
        } else if path_length >= WINDOWS_PATH_WARNING_UTF16 {
            issues.push(PreflightIssue {
                client_id: client_id.clone(),
                code: "pathNearLimit".into(),
                message: "la ruta está cerca del límite clásico de Windows".into(),
                severity: "warning".into(),
            });
        }

        let normalized_target = target.to_string_lossy().to_lowercase();
        target_clients
            .entry(normalized_target)
            .or_default()
            .push(client_id.clone());
        let stage = parent.join(format!(".cinevault-{batch_uuid}-{index}.stage"));
        if stage.exists() {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "stagingConflict",
                "existe una ruta temporal de un lote anterior; se requiere revisión",
            );
        }
        plans.push(RenamePlan {
            client_id,
            media_file_id: stored.id,
            source: stored.current_path,
            target,
            stage,
            expected_size: metadata.len(),
            expected_modified_at: modified_seconds(&metadata),
            manual_override: requested.manual_override,
        });
    }

    for clients in target_clients.values().filter(|clients| clients.len() > 1) {
        for client_id in clients {
            push_error(
                &mut issues,
                &mut invalid_clients,
                client_id.clone(),
                "duplicateTarget",
                "varios elementos del lote producirían el mismo nombre",
            );
        }
    }

    let ready_count = request.items.len().saturating_sub(invalid_clients.len());
    Ok(PreparedBatch {
        plans,
        preflight: PreflightResult {
            valid: invalid_clients.is_empty() && ready_count == request.items.len(),
            ready_count,
            issues,
        },
    })
}

fn push_error(
    issues: &mut Vec<PreflightIssue>,
    invalid_clients: &mut HashSet<String>,
    client_id: String,
    code: &str,
    message: &str,
) {
    invalid_clients.insert(client_id.clone());
    issues.push(PreflightIssue {
        client_id,
        code: code.into(),
        message: message.into(),
        severity: "error".into(),
    });
}

fn is_reserved_windows_name(filename: &str) -> bool {
    let stem = filename
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end_matches([' ', '.'])
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit()
            && stem.as_bytes()[3] != b'0')
}

fn case_insensitive_entry(parent: &Path, filename: &str) -> BackendResult<Option<PathBuf>> {
    let wanted = filename.to_lowercase();
    for entry in std::fs::read_dir(parent)? {
        let entry = entry?;
        if entry.file_name().to_string_lossy().to_lowercase() == wanted {
            return Ok(Some(entry.path()));
        }
    }
    Ok(None)
}

fn same_case_insensitive_path(left: &Path, right: &Path) -> bool {
    left.to_string_lossy().to_lowercase() == right.to_string_lossy().to_lowercase()
}

fn modified_seconds(metadata: &std::fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs())
}

fn verify_fingerprint(plan: &RenamePlan, path: &Path) -> BackendResult<()> {
    let metadata = std::fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(BackendError::Conflict(format!(
            "el archivo {} dejó de ser un archivo regular",
            plan.media_file_id
        )));
    }
    if metadata.len() != plan.expected_size
        || (plan.expected_modified_at.is_some()
            && modified_seconds(&metadata) != plan.expected_modified_at)
    {
        return Err(BackendError::Conflict(format!(
            "el archivo {} cambió después de la previsualización",
            plan.media_file_id
        )));
    }
    Ok(())
}

fn safe_rename(source: &Path, target: &Path) -> BackendResult<()> {
    if !source.exists() {
        return Err(BackendError::NotFound(format!(
            "origen de renombrado: {}",
            source.display()
        )));
    }
    if target.exists() {
        return Err(BackendError::Conflict(format!(
            "el destino ya existe y no se sobrescribirá: {}",
            target.display()
        )));
    }
    std::fs::rename(source, target)?;
    Ok(())
}

fn journal_for(batch_id: i64, batch_uuid: &str, plans: &[RenamePlan]) -> RenameJournal {
    RenameJournal {
        batch_id,
        batch_uuid: batch_uuid.into(),
        status: "running".into(),
        entries: plans
            .iter()
            .map(|plan| RenameJournalEntry {
                media_file_id: plan.media_file_id,
                source: plan.source.clone(),
                target: plan.target.clone(),
                stage: plan.stage.clone(),
                state: "planned".into(),
                expected_size: plan.expected_size,
                expected_modified_at: plan.expected_modified_at,
            })
            .collect(),
        updated_at: Utc::now().to_rfc3339(),
    }
}

fn write_journal(path: &Path, journal: &mut RenameJournal) -> BackendResult<()> {
    write_journal_impl(path, journal, false)
}

fn write_journal_impl(
    path: &Path,
    journal: &mut RenameJournal,
    fail_before_replace: bool,
) -> BackendResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    journal.updated_at = Utc::now().to_rfc3339();
    let bytes = serde_json::to_vec_pretty(journal)?;
    let parent = path.parent().ok_or_else(|| {
        BackendError::InvalidInput("el journal no tiene directorio contenedor".into())
    })?;
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| BackendError::InvalidInput("nombre de journal no Unicode".into()))?;
    let temporary = parent.join(format!(".{filename}.{}.tmp", Uuid::new_v4()));
    let result = (|| -> BackendResult<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.flush()?;
        file.sync_all()?;
        drop(file);
        if fail_before_replace {
            return Err(BackendError::State(
                "fallo de prueba antes del reemplazo atómico".into(),
            ));
        }
        atomic_replace_file(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(target_os = "windows")]
fn atomic_replace_file(temporary: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, ReplaceFileW, MOVEFILE_WRITE_THROUGH,
    };

    let temporary_wide = temporary
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination_wide = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let result = if destination.exists() {
        // SAFETY: both buffers are owned, NUL-terminated UTF-16 paths and remain alive for the call.
        unsafe {
            ReplaceFileW(
                destination_wide.as_ptr(),
                temporary_wide.as_ptr(),
                std::ptr::null(),
                0,
                std::ptr::null(),
                std::ptr::null(),
            )
        }
    } else {
        // SAFETY: both buffers are owned, NUL-terminated UTF-16 paths and remain alive for the call.
        unsafe {
            MoveFileExW(
                temporary_wide.as_ptr(),
                destination_wide.as_ptr(),
                MOVEFILE_WRITE_THROUGH,
            )
        }
    };
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        // ReplaceFileW has no supported write-through flag. The temporary file was synced
        // before replacement; syncing the resulting file handle closes the remaining gap
        // available through Rust's portable filesystem API.
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(destination)?
            .sync_all()?;
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn atomic_replace_file(temporary: &Path, destination: &Path) -> io::Result<()> {
    std::fs::rename(temporary, destination)?;
    if let Some(parent) = destination.parent() {
        File::open(parent)?.sync_all()?;
    }
    Ok(())
}

fn transition(
    database: &Database,
    batch_id: i64,
    journal_path: &Path,
    journal: &mut RenameJournal,
    entry_index: usize,
    state: &str,
) -> BackendResult<()> {
    journal.entries[entry_index].state = state.into();
    write_journal(journal_path, journal)?;
    database.set_rename_state(batch_id, journal.entries[entry_index].media_file_id, state)?;
    Ok(())
}

fn perform_file_transaction(
    database: &Database,
    batch_id: i64,
    plans: &[RenamePlan],
    journal_path: &Path,
    journal: &mut RenameJournal,
    fail_after_commits: Option<usize>,
) -> Result<(), FileTransactionFailure> {
    let operation = (|| -> BackendResult<()> {
        for (index, plan) in plans.iter().enumerate() {
            verify_fingerprint(plan, &plan.source)?;
            safe_rename(&plan.source, &plan.stage)?;
            transition(database, batch_id, journal_path, journal, index, "staged")?;
        }
        for (index, plan) in plans.iter().enumerate() {
            if fail_after_commits == Some(index) {
                return Err(BackendError::State(
                    "fallo de prueba inyectado durante el commit".into(),
                ));
            }
            safe_rename(&plan.stage, &plan.target)?;
            transition(
                database,
                batch_id,
                journal_path,
                journal,
                index,
                "completed",
            )?;
        }
        journal.status = "filesystemCommitted".into();
        write_journal(journal_path, journal)?;
        Ok(())
    })();

    if let Err(error) = operation {
        let rollback_errors = rollback_files(database, batch_id, plans, journal_path, journal);
        let recovery_required = !rollback_errors.is_empty();
        let mut message = error.to_string();
        if recovery_required {
            message.push_str("; falló el rollback: ");
            message.push_str(&rollback_errors.join(" | "));
        }
        return Err(FileTransactionFailure {
            message,
            recovery_required,
        });
    }
    Ok(())
}

fn rollback_files(
    database: &Database,
    batch_id: i64,
    plans: &[RenamePlan],
    journal_path: &Path,
    journal: &mut RenameJournal,
) -> Vec<String> {
    let mut errors = Vec::new();
    for (index, plan) in plans.iter().enumerate().rev() {
        let source_exists = plan.source.exists();
        let stage_exists = plan.stage.exists();
        let target_exists = plan.target.exists();
        let holders =
            usize::from(source_exists) + usize::from(stage_exists) + usize::from(target_exists);
        let result = match (source_exists, stage_exists, target_exists, holders) {
            (true, false, false, 1) => verify_fingerprint(plan, &plan.source),
            (false, true, false, 1) => verify_fingerprint(plan, &plan.stage)
                .and_then(|()| safe_rename(&plan.stage, &plan.source)),
            (false, false, true, 1) => verify_fingerprint(plan, &plan.target)
                .and_then(|()| safe_rename(&plan.target, &plan.source)),
            (_, _, _, 0) => Err(BackendError::NotFound(format!(
                "no aparece ninguna ruta del journal para {}",
                plan.media_file_id
            ))),
            _ => Err(BackendError::Conflict(format!(
                "hay varias rutas ocupadas para {}; no se moverá ninguna sin revisión",
                plan.media_file_id
            ))),
        };

        match result {
            Ok(()) => {
                journal.entries[index].state = "rolledBack".into();
                if let Err(error) =
                    database.set_rename_state(batch_id, plan.media_file_id, "rolledBack")
                {
                    errors.push(error.to_string());
                }
            }
            Err(error) => {
                journal.entries[index].state = "recoveryRequired".into();
                let _ = database.set_rename_state(batch_id, plan.media_file_id, "recoveryRequired");
                errors.push(error.to_string());
            }
        }
        if let Err(error) = write_journal(journal_path, journal) {
            errors.push(error.to_string());
        }
    }
    journal.status = if errors.is_empty() {
        "rolledBack".into()
    } else {
        "recoveryRequired".into()
    };
    if let Err(error) = write_journal(journal_path, journal) {
        errors.push(error.to_string());
    }
    errors
}

fn execute_batch_unlocked(
    database: &Database,
    request: &RenameBatchRequest,
    journal_directory: &Path,
) -> BackendResult<RenameBatchResult> {
    execute_batch_with_failure(database, request, journal_directory, None)
}

fn execute_batch_with_failure(
    database: &Database,
    request: &RenameBatchRequest,
    journal_directory: &Path,
    fail_after_commits: Option<usize>,
) -> BackendResult<RenameBatchResult> {
    let batch_uuid = Uuid::new_v4().to_string();
    let prepared = prepare(database, request, &batch_uuid)?;
    if !prepared.preflight.valid {
        let messages = prepared
            .preflight
            .issues
            .iter()
            .filter(|issue| issue.severity == "error")
            .map(|issue| format!("{}: {}", issue.code, issue.message))
            .collect::<Vec<_>>()
            .join("; ");
        return Err(BackendError::Conflict(format!(
            "el preflight rechazó el lote: {messages}"
        )));
    }
    let batch_id = database.create_batch(&batch_uuid, &prepared.plans)?;
    let journal_path = journal_directory.join(format!("{batch_uuid}.json"));
    let mut journal = journal_for(batch_id, &batch_uuid, &prepared.plans);
    if let Err(error) = write_journal(&journal_path, &mut journal) {
        database.fail_batch(batch_id, &prepared.plans, &error.to_string(), false)?;
        return Err(error);
    }

    if let Err(failure) = perform_file_transaction(
        database,
        batch_id,
        &prepared.plans,
        &journal_path,
        &mut journal,
        fail_after_commits,
    ) {
        database.fail_batch(
            batch_id,
            &prepared.plans,
            &failure.message,
            failure.recovery_required,
        )?;
        tracing::error!(
            operation = "rename_batch",
            batch_id,
            recovery_required = failure.recovery_required,
            "el lote no se pudo completar"
        );
        return Ok(failed_result(batch_id, &prepared.plans, &failure.message));
    }

    if let Err(database_error) = database.complete_batch(batch_id, &prepared.plans) {
        let rollback_errors = rollback_files(
            database,
            batch_id,
            &prepared.plans,
            &journal_path,
            &mut journal,
        );
        let recovery_required = !rollback_errors.is_empty();
        let mut message = format!("no se pudo confirmar SQLite: {database_error}");
        if recovery_required {
            message.push_str("; falló el rollback: ");
            message.push_str(&rollback_errors.join(" | "));
        }
        database.fail_batch(batch_id, &prepared.plans, &message, recovery_required)?;
        return Ok(failed_result(batch_id, &prepared.plans, &message));
    }

    journal.status = "completed".into();
    if let Err(error) = write_journal(&journal_path, &mut journal) {
        // SQLite is authoritative after commit; startup recovery checks it before touching files.
        tracing::warn!(
            operation = "rename_journal_finalize",
            batch_id,
            error_code = "journalWrite",
            "no se pudo marcar el journal como completado"
        );
        let _ = error;
    }
    tracing::info!(
        operation = "rename_batch",
        batch_id,
        item_count = prepared.plans.len(),
        "lote completado"
    );
    Ok(RenameBatchResult {
        batch_id,
        succeeded: prepared.plans.len(),
        failed: 0,
        results: prepared
            .plans
            .iter()
            .map(|plan| RenameItemResult {
                client_id: plan.client_id.clone(),
                media_file_id: plan.media_file_id,
                status: "completed".into(),
                old_path: plan.source.to_string_lossy().into_owned(),
                new_path: Some(plan.target.to_string_lossy().into_owned()),
                error_message: None,
            })
            .collect(),
    })
}

fn failed_result(batch_id: i64, plans: &[RenamePlan], message: &str) -> RenameBatchResult {
    RenameBatchResult {
        batch_id,
        succeeded: 0,
        failed: plans.len(),
        results: plans
            .iter()
            .map(|plan| RenameItemResult {
                client_id: plan.client_id.clone(),
                media_file_id: plan.media_file_id,
                status: "failed".into(),
                old_path: plan.source.to_string_lossy().into_owned(),
                new_path: None,
                error_message: Some(message.into()),
            })
            .collect(),
    }
}

fn undo_unlocked(database: &Database, history_id: i64) -> BackendResult<UndoResult> {
    let history = database.history(history_id)?;
    if !history.can_undo || history.status != "completed" {
        return Err(BackendError::Conflict(
            "esta operación ya no se puede deshacer".into(),
        ));
    }
    let media = database.media_file(history.media_file_id)?;
    let current = PathBuf::from(&history.new_path);
    let original = PathBuf::from(&history.old_path);
    if media.current_path != current {
        return Err(BackendError::Conflict(
            "la biblioteca ya no apunta al destino registrado".into(),
        ));
    }
    if original.exists() {
        return Err(BackendError::Conflict(
            "la ruta original está ocupada; no se sobrescribirá".into(),
        ));
    }
    let metadata = std::fs::symlink_metadata(&current)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(BackendError::Conflict(
            "el destino ya no es el archivo regular renombrado".into(),
        ));
    }
    if history
        .expected_size
        .is_some_and(|size| metadata.len() != size)
        || (history.expected_modified_at.is_some()
            && modified_seconds(&metadata) != history.expected_modified_at)
    {
        return Err(BackendError::Conflict(
            "el archivo cambió desde el renombrado; se requiere revisión manual".into(),
        ));
    }

    safe_rename(&current, &original)?;
    if let Err(error) = database.complete_undo(&history) {
        if let Err(rollback_error) = safe_rename(&original, &current) {
            return Err(BackendError::State(format!(
                "SQLite rechazó el deshacer ({error}) y también falló el rollback ({rollback_error})"
            )));
        }
        return Err(error);
    }
    tracing::info!(operation = "undo_rename", history_id, "renombrado deshecho");
    Ok(UndoResult {
        history_id,
        status: "undone".into(),
        restored_path: Some(history.old_path),
        error_message: None,
    })
}

fn recover_incomplete_unlocked(
    database: &Database,
    journal_directory: &Path,
) -> BackendResult<RecoveryReport> {
    let mut report = RecoveryReport::default();
    if !journal_directory.exists() {
        return Ok(report);
    }
    for entry in std::fs::read_dir(journal_directory)? {
        let path = entry?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let file_uuid = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown-journal")
            .to_owned();
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) => {
                recover_corrupt_journal(
                    database,
                    &path,
                    &file_uuid,
                    &format!("no se pudo leer el journal: {error}"),
                    &mut report,
                )?;
                continue;
            }
        };
        let parsed: RenameJournal = match serde_json::from_slice(&bytes) {
            Ok(journal) => journal,
            Err(error) => {
                recover_corrupt_journal(
                    database,
                    &path,
                    &file_uuid,
                    &format!("JSON de journal inválido: {error}"),
                    &mut report,
                )?;
                continue;
            }
        };
        if parsed.batch_uuid != file_uuid {
            recover_corrupt_journal(
                database,
                &path,
                &file_uuid,
                "el identificador interno no coincide con el nombre del journal",
                &mut report,
            )?;
            continue;
        }
        let Some((batch_id, database_status)) = database.batch_by_uuid(&file_uuid)? else {
            database.record_recovery_event(
                None,
                &file_uuid,
                "untrackedJournal",
                "el journal no tiene un lote asociado en SQLite",
            )?;
            report.untracked_journals += 1;
            tracing::error!(
                operation = "startup_recovery",
                batch_uuid = file_uuid,
                error_code = "untrackedJournal",
                "journal sin lote SQLite; no se tocarán archivos"
            );
            continue;
        };
        if parsed.batch_id != batch_id {
            database.record_recovery_event(
                Some(batch_id),
                &file_uuid,
                "journalIdentityMismatch",
                "el batchId del journal no coincide con SQLite",
            )?;
        }
        let plans = database.rename_plans_for_batch(batch_id)?;
        if database_status == "completed" || database_status == "rolledBack" {
            let state = if database_status == "completed" {
                "completed"
            } else {
                "rolledBack"
            };
            if parsed.status != database_status || parsed.batch_id != batch_id {
                write_rebuilt_journal(&path, batch_id, &file_uuid, &plans, state)?;
            }
            continue;
        }
        recover_batch_from_database(database, &path, batch_id, &file_uuid, &plans, &mut report)?;
    }
    Ok(report)
}

fn recover_corrupt_journal(
    database: &Database,
    path: &Path,
    batch_uuid: &str,
    reason: &str,
    report: &mut RecoveryReport,
) -> BackendResult<()> {
    report.corrupt_journals += 1;
    let batch = database.batch_by_uuid(batch_uuid)?;
    database.record_recovery_event(
        batch.as_ref().map(|(batch_id, _)| *batch_id),
        batch_uuid,
        "corruptJournal",
        reason,
    )?;
    tracing::error!(
        operation = "startup_recovery",
        batch_uuid,
        error_code = "corruptJournal",
        "journal corrupto registrado"
    );
    let Some((batch_id, status)) = batch else {
        report.untracked_journals += 1;
        return Ok(());
    };
    let plans = database.rename_plans_for_batch(batch_id)?;
    if status == "completed" || status == "rolledBack" {
        let state = if status == "completed" {
            "completed"
        } else {
            "rolledBack"
        };
        write_rebuilt_journal(path, batch_id, batch_uuid, &plans, state)?;
        return Ok(());
    }
    recover_batch_from_database(database, path, batch_id, batch_uuid, &plans, report)
}

fn write_rebuilt_journal(
    path: &Path,
    batch_id: i64,
    batch_uuid: &str,
    plans: &[RenamePlan],
    state: &str,
) -> BackendResult<()> {
    let mut journal = journal_for(batch_id, batch_uuid, plans);
    journal.status = state.into();
    for entry in &mut journal.entries {
        entry.state = state.into();
    }
    write_journal(path, &mut journal)
}

fn recover_batch_from_database(
    database: &Database,
    path: &Path,
    batch_id: i64,
    batch_uuid: &str,
    plans: &[RenamePlan],
    report: &mut RecoveryReport,
) -> BackendResult<()> {
    let mut journal = journal_for(batch_id, batch_uuid, plans);
    let errors = rollback_files(database, batch_id, plans, path, &mut journal);
    let recovery_required = !errors.is_empty();
    let message = if recovery_required {
        format!(
            "recuperación de arranque incompleta: {}",
            errors.join(" | ")
        )
    } else {
        "lote revertido durante la recuperación de arranque".into()
    };
    database.fail_batch(batch_id, plans, &message, recovery_required)?;
    if recovery_required {
        report.recovery_required_batches += 1;
    } else {
        report.recovered_batches += 1;
    }
    tracing::warn!(
        operation = "startup_recovery",
        batch_id,
        recovery_required,
        "se procesó un lote incompleto"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ParsedMediaName, ProbeData, RenameItemRequest};
    use std::sync::{mpsc, Arc};
    use std::time::Duration;
    use tempfile::TempDir;

    fn add_file(database: &Database, path: &Path, contents: &[u8]) -> i64 {
        std::fs::write(path, contents).unwrap();
        database
            .upsert_scanned_file(
                path,
                &ParsedMediaName {
                    title: path.file_stem().unwrap().to_string_lossy().into_owned(),
                    extension: "mkv".into(),
                    ..ParsedMediaName::default()
                },
                &ProbeData::default(),
                contents.len() as u64,
            )
            .unwrap()
    }

    #[test]
    fn preflight_rejects_case_insensitive_duplicate_targets() {
        let directory = TempDir::new().unwrap();
        let database = Database::open_in_memory().unwrap();
        let first = add_file(&database, &directory.path().join("one.mkv"), b"one");
        let second = add_file(&database, &directory.path().join("two.mkv"), b"two");
        let result = preflight(
            &database,
            &RenameBatchRequest {
                items: vec![
                    RenameItemRequest {
                        client_id: Some("one".into()),
                        media_file_id: first,
                        proposed_filename: "Movie.mkv".into(),
                        manual_override: false,
                    },
                    RenameItemRequest {
                        client_id: Some("two".into()),
                        media_file_id: second,
                        proposed_filename: "movie.MKV".into(),
                        manual_override: false,
                    },
                ],
            },
        )
        .unwrap();
        assert!(!result.valid);
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.code == "duplicateTarget"));
    }

    #[test]
    fn two_file_name_swap_is_valid_and_executes_through_staging() {
        let directory = TempDir::new().unwrap();
        let database = Database::open_in_memory().unwrap();
        let first_path = directory.path().join("a.mkv");
        let second_path = directory.path().join("b.mkv");
        let first = add_file(&database, &first_path, b"first");
        let second = add_file(&database, &second_path, b"second");
        let request = RenameBatchRequest {
            items: vec![
                RenameItemRequest {
                    client_id: Some("first".into()),
                    media_file_id: first,
                    proposed_filename: "b.mkv".into(),
                    manual_override: false,
                },
                RenameItemRequest {
                    client_id: Some("second".into()),
                    media_file_id: second,
                    proposed_filename: "a.mkv".into(),
                    manual_override: false,
                },
            ],
        };

        assert!(preflight(&database, &request).unwrap().valid);
        let result = RenameCoordinator::new()
            .execute_batch(&database, &request, &directory.path().join("journals"))
            .unwrap();

        assert_eq!(result.succeeded, 2);
        assert_eq!(std::fs::read(&first_path).unwrap(), b"second");
        assert_eq!(std::fs::read(&second_path).unwrap(), b"first");
        assert_eq!(
            database.media_file(first).unwrap().current_filename,
            "b.mkv"
        );
        assert_eq!(
            database.media_file(second).unwrap().current_filename,
            "a.mkv"
        );
    }

    #[test]
    fn batch_rename_and_undo_use_only_temporary_dummy_files() {
        let directory = TempDir::new().unwrap();
        let database = Database::open_in_memory().unwrap();
        let original = directory.path().join("old.mkv");
        let id = add_file(&database, &original, b"not a video");
        let coordinator = RenameCoordinator::new();
        let result = coordinator
            .execute_batch(
                &database,
                &RenameBatchRequest {
                    items: vec![RenameItemRequest {
                        client_id: Some("row".into()),
                        media_file_id: id,
                        proposed_filename: "New name (2024).mkv".into(),
                        manual_override: true,
                    }],
                },
                &directory.path().join("journals"),
            )
            .unwrap();
        assert_eq!(result.succeeded, 1);
        let renamed = directory.path().join("New name (2024).mkv");
        assert!(renamed.exists());
        assert!(!original.exists());
        assert_eq!(database.manual_filename_correction_count(id).unwrap(), 1);

        let history = database.list_history().unwrap();
        let undo_result = coordinator.undo(&database, history[0].id).unwrap();
        assert_eq!(undo_result.status, "undone");
        assert!(original.exists());
        assert!(!renamed.exists());
        assert_eq!(database.manual_filename_correction_count(id).unwrap(), 0);
    }

    #[test]
    fn injected_mid_commit_failure_rolls_back_every_dummy_file() {
        let directory = TempDir::new().unwrap();
        let database = Database::open_in_memory().unwrap();
        let first_path = directory.path().join("a.mkv");
        let second_path = directory.path().join("b.mkv");
        let first = add_file(&database, &first_path, b"a");
        let second = add_file(&database, &second_path, b"b");
        let result = execute_batch_with_failure(
            &database,
            &RenameBatchRequest {
                items: vec![
                    RenameItemRequest {
                        client_id: Some("a".into()),
                        media_file_id: first,
                        proposed_filename: "renamed-a.mkv".into(),
                        manual_override: false,
                    },
                    RenameItemRequest {
                        client_id: Some("b".into()),
                        media_file_id: second,
                        proposed_filename: "renamed-b.mkv".into(),
                        manual_override: false,
                    },
                ],
            },
            &directory.path().join("journals"),
            Some(1),
        )
        .unwrap();
        assert_eq!(result.failed, 2);
        assert!(first_path.exists());
        assert!(second_path.exists());
        assert!(!directory.path().join("renamed-a.mkv").exists());
        assert!(!directory.path().join("renamed-b.mkv").exists());
        assert!(database
            .list_history()
            .unwrap()
            .iter()
            .all(|entry| entry.status == "failed"));
    }

    #[test]
    fn rollback_never_moves_an_unrelated_target_when_stage_also_exists() {
        let directory = TempDir::new().unwrap();
        let database = Database::open_in_memory().unwrap();
        let source = directory.path().join("source.mkv");
        let id = add_file(&database, &source, b"owned");
        let request = RenameBatchRequest {
            items: vec![RenameItemRequest {
                client_id: Some("row".into()),
                media_file_id: id,
                proposed_filename: "target.mkv".into(),
                manual_override: false,
            }],
        };
        let prepared = prepare(&database, &request, "recovery-test").unwrap();
        let plan = &prepared.plans[0];
        std::fs::rename(&plan.source, &plan.stage).unwrap();
        std::fs::write(&plan.target, b"unrelated").unwrap();
        let batch_id = database
            .create_batch("recovery-test", &prepared.plans)
            .unwrap();
        let journal_path = directory.path().join("journal.json");
        let mut journal = journal_for(batch_id, "recovery-test", &prepared.plans);

        let errors = rollback_files(
            &database,
            batch_id,
            &prepared.plans,
            &journal_path,
            &mut journal,
        );

        assert!(!errors.is_empty());
        assert_eq!(std::fs::read(&plan.target).unwrap(), b"unrelated");
        assert!(plan.stage.exists());
        assert!(!plan.source.exists());
    }

    #[test]
    fn failed_atomic_replace_preserves_the_previous_valid_journal() {
        let directory = TempDir::new().unwrap();
        let journal_path = directory.path().join("batch.json");
        let mut journal = RenameJournal {
            batch_id: 7,
            batch_uuid: "batch".into(),
            status: "running".into(),
            entries: Vec::new(),
            updated_at: String::new(),
        };
        write_journal(&journal_path, &mut journal).unwrap();
        let previous_bytes = std::fs::read(&journal_path).unwrap();

        journal.status = "completed".into();
        let error = write_journal_impl(&journal_path, &mut journal, true).unwrap_err();

        assert!(error.to_string().contains("reemplazo atómico"));
        assert_eq!(std::fs::read(&journal_path).unwrap(), previous_bytes);
        let persisted: RenameJournal =
            serde_json::from_slice(&std::fs::read(&journal_path).unwrap()).unwrap();
        assert_eq!(persisted.status, "running");
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn corrupt_journal_is_recorded_and_recovered_from_sqlite() {
        let directory = TempDir::new().unwrap();
        let database = Database::open_in_memory().unwrap();
        let source = directory.path().join("source.mkv");
        let media_file_id = add_file(&database, &source, b"owned");
        let batch_uuid = Uuid::new_v4().to_string();
        let request = RenameBatchRequest {
            items: vec![RenameItemRequest {
                client_id: Some("row".into()),
                media_file_id,
                proposed_filename: "target.mkv".into(),
                manual_override: false,
            }],
        };
        let prepared = prepare(&database, &request, &batch_uuid).unwrap();
        let batch_id = database.create_batch(&batch_uuid, &prepared.plans).unwrap();
        std::fs::rename(&prepared.plans[0].source, &prepared.plans[0].stage).unwrap();
        let journals = directory.path().join("journals");
        std::fs::create_dir_all(&journals).unwrap();
        let journal_path = journals.join(format!("{batch_uuid}.json"));
        std::fs::write(&journal_path, b"{not valid json").unwrap();

        let report = RenameCoordinator::new()
            .recover_incomplete(&database, &journals)
            .unwrap();

        assert_eq!(report.corrupt_journals, 1);
        assert_eq!(report.recovered_batches, 1);
        assert_eq!(report.recovery_required_batches, 0);
        assert!(source.exists());
        assert!(!prepared.plans[0].stage.exists());
        assert_eq!(
            database.batch_status(batch_id).unwrap().as_deref(),
            Some("rolledBack")
        );
        assert_eq!(database.recovery_event_count().unwrap(), 1);
        assert!(database
            .list_history()
            .unwrap()
            .iter()
            .all(|entry| entry.status == "failed"));
        let repaired: RenameJournal =
            serde_json::from_slice(&std::fs::read(journal_path).unwrap()).unwrap();
        assert_eq!(repaired.status, "rolledBack");
    }

    #[test]
    fn one_mutex_serializes_execute_undo_and_recovery_entry_points() {
        let coordinator = Arc::new(RenameCoordinator::new());
        let held = coordinator.lock().unwrap();
        let (attempted_tx, attempted_rx) = mpsc::channel();
        let (acquired_tx, acquired_rx) = mpsc::channel();
        let contender = Arc::clone(&coordinator);
        let worker = std::thread::spawn(move || {
            attempted_tx.send(()).unwrap();
            let _guard = contender.lock().unwrap();
            acquired_tx.send(()).unwrap();
        });

        attempted_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(acquired_rx
            .recv_timeout(Duration::from_millis(100))
            .is_err());
        drop(held);
        acquired_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        worker.join().unwrap();
    }
}
