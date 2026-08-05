const COMMANDS: &[&str] = &[
    "scan_folder",
    "validate_ffprobe",
    "list_library",
    "identify_media_file",
    "list_history",
    "get_settings",
    "save_settings",
    "preflight_rename_batch",
    "execute_rename_batch",
    "undo_rename",
    "search_tmdb",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to build the Tauri application manifest");
}
