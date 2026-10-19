CREATE TABLE `persons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_id` text,
	`discord_name` text,
	`nick` text NOT NULL,
	`contact_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `persons_discord_id_unique` ON `persons` (`discord_id`);--> statement-breakpoint
ALTER TABLE `events` ADD `starts_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `ends_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `location` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `discord_event_id` text;--> statement-breakpoint
ALTER TABLE `registrations` ADD `person_id` integer REFERENCES persons(id);--> statement-breakpoint
UPDATE `events` SET `starts_at` = `date` || 'T18:00', `ends_at` = `date` || 'T23:59' WHERE `starts_at` = '';--> statement-breakpoint
INSERT INTO `persons` (`discord_id`, `discord_name`, `nick`, `contact_id`, `created_at`, `updated_at`)
	SELECT r.`discord_id`, r.`discord_name`, r.`nick`, r.`contact_id`,
		(SELECT MIN(x.`created_at`) FROM `registrations` x WHERE x.`discord_id` = r.`discord_id`), r.`updated_at`
	FROM `registrations` r
	WHERE r.`discord_id` IS NOT NULL AND r.`id` = (SELECT MAX(y.`id`) FROM `registrations` y WHERE y.`discord_id` = r.`discord_id`);--> statement-breakpoint
UPDATE `registrations` SET `person_id` = (SELECT p.`id` FROM `persons` p WHERE p.`discord_id` = `registrations`.`discord_id`) WHERE `discord_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `persons` (`discord_id`, `discord_name`, `nick`, `contact_id`, `created_at`, `updated_at`)
	SELECT NULL, NULL, r.`nick`, r.`contact_id`, r.`created_at`, r.`updated_at`
	FROM `registrations` r
	WHERE r.`discord_id` IS NULL AND r.`id` = (SELECT MAX(y.`id`) FROM `registrations` y WHERE y.`discord_id` IS NULL AND y.`nick` = r.`nick`);--> statement-breakpoint
UPDATE `registrations` SET `person_id` = (SELECT p.`id` FROM `persons` p WHERE p.`discord_id` IS NULL AND p.`nick` = `registrations`.`nick`) WHERE `discord_id` IS NULL;
