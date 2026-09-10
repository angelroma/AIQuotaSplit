CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`display_name` text NOT NULL,
	`platform` text NOT NULL,
	`token_hash` text NOT NULL,
	`registered_at` integer NOT NULL,
	`last_sync_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_devices_member_id` ON `devices` (`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_devices_token_hash` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` integer NOT NULL,
	`display_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`quota_percent` real DEFAULT 50 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "members_slot_check" CHECK("members"."slot" in (1, 2)),
	CONSTRAINT "members_quota_check" CHECK("members"."quota_percent" = 50)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_slot` ON `members` (`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_normalized_name` ON `members` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `rate_limit_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`limit_id` text DEFAULT 'codex' NOT NULL,
	`window_resets_at` integer NOT NULL,
	`window_duration_mins` integer NOT NULL,
	`observed_at` integer NOT NULL,
	`shared_used_percent` real NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rate_limit_device_window_observed` ON `rate_limit_observations` (`device_id`,`window_resets_at`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_rate_limit_window_observed` ON `rate_limit_observations` (`window_resets_at`,`observed_at`);--> statement-breakpoint
CREATE TABLE `sync_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`member_id` text NOT NULL,
	`window_resets_at` integer NOT NULL,
	`window_duration_mins` integer NOT NULL,
	`collected_at` integer NOT NULL,
	`tracking_started_at` integer NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cache_read_tokens` integer NOT NULL,
	`cache_creation_tokens` integer NOT NULL,
	`total_tokens` integer NOT NULL,
	`estimated_cost_usd` real,
	`model_breakdown_json` text NOT NULL,
	`local_usage_available` integer NOT NULL,
	`collector_version` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_reports_device_window` ON `sync_reports` (`device_id`,`window_resets_at`);--> statement-breakpoint
CREATE INDEX `idx_sync_reports_window_collected` ON `sync_reports` (`window_resets_at`,`collected_at`);--> statement-breakpoint
CREATE INDEX `idx_sync_reports_member_window` ON `sync_reports` (`member_id`,`window_resets_at`);--> statement-breakpoint
PRAGMA optimize;
