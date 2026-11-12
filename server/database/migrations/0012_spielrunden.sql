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
--> statement-breakpoint
INSERT INTO `games` (`name`, `created_at`) VALUES ('Counter-Strike 2', strftime('%s','now')), ('Dota 2', strftime('%s','now')), ('League of Legends', strftime('%s','now')), ('Rocket League', strftime('%s','now')), ('Age of Empires II', strftime('%s','now'));--> statement-breakpoint
INSERT INTO `game_modes` (`game_id`, `name`, `max_players`, `min_players`) SELECT `id`, 'Premier (5er-Stack)', 5, NULL FROM `games` WHERE `name` = 'Counter-Strike 2';--> statement-breakpoint
INSERT INTO `game_modes` (`game_id`, `name`, `max_players`, `min_players`) SELECT `id`, 'Wingman (2er-Stack)', 2, NULL FROM `games` WHERE `name` = 'Counter-Strike 2';--> statement-breakpoint
INSERT INTO `game_modes` (`game_id`, `name`, `max_players`, `min_players`) SELECT `id`, '5 gegen 5 intern', 10, 6 FROM `games` WHERE `name` = 'Counter-Strike 2';--> statement-breakpoint
INSERT INTO `game_modes` (`game_id`, `name`, `max_players`, `min_players`) SELECT `id`, '5-Stack', 5, NULL FROM `games` WHERE `name` = 'Dota 2';--> statement-breakpoint
INSERT INTO `game_modes` (`game_id`, `name`, `max_players`, `min_players`) SELECT `id`, '5 gegen 5 intern', 10, 10 FROM `games` WHERE `name` = 'Dota 2';--> statement-breakpoint
INSERT INTO `game_modes` (`game_id`, `name`, `max_players`, `min_players`) SELECT `id`, '5er-Stack', 5, NULL FROM `games` WHERE `name` = 'League of Legends';--> statement-breakpoint
INSERT INTO `game_modes` (`game_id`, `name`, `max_players`, `min_players`) SELECT `id`, '5 gegen 5 intern', 10, 10 FROM `games` WHERE `name` = 'League of Legends';--> statement-breakpoint
INSERT INTO `game_modes` (`game_id`, `name`, `max_players`, `min_players`) SELECT `id`, '3er-Stack', 3, NULL FROM `games` WHERE `name` = 'Rocket League';--> statement-breakpoint
INSERT INTO `game_modes` (`game_id`, `name`, `max_players`, `min_players`) SELECT `id`, '2er-Stack', 2, NULL FROM `games` WHERE `name` = 'Rocket League';--> statement-breakpoint
INSERT INTO `game_modes` (`game_id`, `name`, `max_players`, `min_players`) SELECT `id`, 'Team-Spiel', 8, 2 FROM `games` WHERE `name` = 'Age of Empires II';
