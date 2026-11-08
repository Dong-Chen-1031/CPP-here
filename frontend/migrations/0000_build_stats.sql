CREATE TABLE `build_stats` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`total_lines` integer DEFAULT 0 NOT NULL,
	`total_wasm_size_bytes` integer DEFAULT 0 NOT NULL,
	`total_duration_seconds` real DEFAULT 0 NOT NULL,
	`browser_count` integer DEFAULT 0 NOT NULL
);
