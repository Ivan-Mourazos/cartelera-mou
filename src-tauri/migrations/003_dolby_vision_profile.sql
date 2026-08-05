ALTER TABLE video_streams ADD COLUMN dolby_vision_profile TEXT;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
