PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- Migrationen laufen in einer Transaktion, dort wirkt foreign_keys=OFF nicht: DROP TABLE würde
-- message_deliveries.registration_id auf NULL setzen. Deshalb die Verweise sichern und danach zurückschreiben.
CREATE TABLE `__deliveries_registration` AS SELECT `id`, `registration_id` FROM `message_deliveries` WHERE `registration_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_registrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`seat` text,
	`double` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_registrations`("id", "event_id", "person_id", "seat", "double", "created_at", "updated_at") SELECT "id", "event_id", "person_id", "seat", "double", "created_at", "updated_at" FROM `registrations`;--> statement-breakpoint
DROP TABLE `registrations`;--> statement-breakpoint
ALTER TABLE `__new_registrations` RENAME TO `registrations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `registrations_event_person` ON `registrations` (`event_id`,`person_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `registrations_event_seat` ON `registrations` (`event_id`,`seat`);--> statement-breakpoint
UPDATE `message_deliveries` SET `registration_id` = (SELECT d.`registration_id` FROM `__deliveries_registration` d WHERE d.`id` = `message_deliveries`.`id`) WHERE `id` IN (SELECT `id` FROM `__deliveries_registration`);--> statement-breakpoint
DROP TABLE `__deliveries_registration`;