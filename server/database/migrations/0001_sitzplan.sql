CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_id` text NOT NULL,
	`discord_name` text NOT NULL,
	`nick` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_discord_id_unique` ON `contacts` (`discord_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`registration_open` integer DEFAULT false NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`target` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `message_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer,
	`event_id` integer NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`text` text,
	`registration_id` integer,
	`discord_id` text,
	`nick` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`send_after` integer NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `message_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `message_deliveries_status_idx` ON `message_deliveries` (`status`,`send_after`);--> statement-breakpoint
CREATE TABLE `message_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `registrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`discord_id` text,
	`discord_name` text,
	`nick` text NOT NULL,
	`contact_id` integer,
	`seat` text,
	`double` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registrations_event_discord` ON `registrations` (`event_id`,`discord_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `registrations_event_seat` ON `registrations` (`event_id`,`seat`);--> statement-breakpoint
CREATE TABLE `seat_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`at` integer NOT NULL,
	`actor_discord_id` text,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`registration_id` integer,
	`nick` text,
	`from_seat` text,
	`to_seat` text,
	`detail` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `seat_log_event_idx` ON `seat_log` (`event_id`,`at`);--> statement-breakpoint
CREATE TABLE `seat_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`letter` text NOT NULL,
	`start` integer NOT NULL,
	`carpet` text DEFAULT 'none' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seat_rows_event_letter` ON `seat_rows` (`event_id`,`letter`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `message_templates` (`name`, `body`) VALUES
	('Dein Platz', 'Hallo {nick}, dein Platz bei {event} ist {platz}. Bis bald!'),
	('Registrierung schließt', 'Hallo {nick}, die Registrierung für {event} schließt am … Falls du noch keinen Platz hast, such dir jetzt einen aus.'),
	('Erinnerung Event', 'Hallo {nick}, am {datum} geht es los: {event}. Dein Platz: {platz}. Bei Fragen wende dich an {kontakt}.');
