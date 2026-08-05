mod commands;
mod database;
mod error;
mod ffprobe;
mod models;
mod naming;
mod rename;
mod scanner;
mod tmdb;

use database::Database;
use std::path::PathBuf;
use tauri::Manager;
use tmdb::TmdbService;
use tracing_subscriber::EnvFilter;

pub struct AppState {
    database: Database,
    journal_directory: PathBuf,
    tmdb: TmdbService,
    rename_coordinator: rename::RenameCoordinator,
}

fn initialize_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("cinevault_desktop_lib=info"));
    let _ = tracing_subscriber::fmt()
        .json()
        .with_env_filter(filter)
        .with_target(false)
        .try_init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    initialize_tracing();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let local_data = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&local_data)?;
            let database = Database::open(&local_data.join("cinevault.sqlite3"))?;
            let journal_directory = local_data.join("rename-journals");
            std::fs::create_dir_all(&journal_directory)?;
            let rename_coordinator = rename::RenameCoordinator::new();
            let recovery = rename_coordinator.recover_incomplete(&database, &journal_directory)?;
            if recovery != rename::RecoveryReport::default() {
                tracing::warn!(
                    operation = "startup_recovery_summary",
                    recovered_batches = recovery.recovered_batches,
                    recovery_required_batches = recovery.recovery_required_batches,
                    corrupt_journals = recovery.corrupt_journals,
                    untracked_journals = recovery.untracked_journals,
                    "finalizó la recuperación de journals"
                );
            }
            let tmdb = TmdbService::new()?;
            app.manage(AppState {
                database,
                journal_directory,
                tmdb,
                rename_coordinator,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_folder,
            commands::validate_ffprobe,
            commands::list_library,
            commands::identify_media_file,
            commands::list_history,
            commands::get_settings,
            commands::save_settings,
            commands::preflight_rename_batch,
            commands::execute_rename_batch,
            commands::undo_rename,
            commands::search_tmdb,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CineVault");
}
