CREATE TABLE `game_modes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`name` text NOT NULL,
	`max_players` integer NOT NULL,
	`min_players` integer,
	`archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_modes_game_idx` ON `game_modes` (`game_id`);--> statement-breakpoint
CREATE TABLE `game_round_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL,
	`discord_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `game_rounds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_round_players_round_user` ON `game_round_players` (`round_id`,`discord_id`);--> statement-breakpoint
CREATE TABLE `game_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer,
	`game_id` integer NOT NULL,
	`mode_id` integer NOT NULL,
	`series_id` integer,
	`number` integer DEFAULT 1 NOT NULL,
	`starts_at` integer NOT NULL,
	`max_players` integer NOT NULL,
	`min_players` integer,
	`note` text,
	`created_by` text NOT NULL,
	`status` text DEFAULT 'offen' NOT NULL,
	`channel_id` text,
	`message_id` text,
	`remind_at` integer,
	`reminded_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mode_id`) REFERENCES `game_modes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_rounds_status_idx` ON `game_rounds` (`status`,`starts_at`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
