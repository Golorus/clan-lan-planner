CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `docs` (
	`path` text PRIMARY KEY NOT NULL,
	`data` text,
	`rev` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `docs_rev_idx` ON `docs` (`rev`);--> statement-breakpoint
CREATE TABLE `users` (
	`discord_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text,
	`created_at` integer NOT NULL,
	`last_login_at` integer NOT NULL
);
