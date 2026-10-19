CREATE TABLE `waitlist_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`registration_id` integer NOT NULL,
	`seat` text,
	`status` text DEFAULT 'offen' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`answered_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `waitlist_offers_event_status` ON `waitlist_offers` (`event_id`,`status`);--> statement-breakpoint
ALTER TABLE `events` ADD `demand_closed_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `demand_until` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `seat_until` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `booking_until` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `booking_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `booking_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `booking_released_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `remind_days` text DEFAULT '[14,7,2]' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `booking_remind_days` text DEFAULT '[7,2]' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `offer_hours` integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `waitlist_auto` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `max_participants` integer;--> statement-breakpoint
ALTER TABLE `message_deliveries` ADD `dedupe_key` text;--> statement-breakpoint
ALTER TABLE `message_deliveries` ADD `components` text;--> statement-breakpoint
ALTER TABLE `message_deliveries` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `message_deliveries_dedupe` ON `message_deliveries` (`dedupe_key`);--> statement-breakpoint
ALTER TABLE `persons` ADD `avatar` text;--> statement-breakpoint
ALTER TABLE `persons` ADD `reminders_off` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `registrations` ADD `status` text DEFAULT 'zugesagt' NOT NULL;--> statement-breakpoint
ALTER TABLE `registrations` ADD `status_at` integer;--> statement-breakpoint
ALTER TABLE `registrations` ADD `booking` text DEFAULT 'offen' NOT NULL;--> statement-breakpoint
ALTER TABLE `registrations` ADD `booked_seat` text;--> statement-breakpoint
ALTER TABLE `registrations` ADD `booked_at` integer;--> statement-breakpoint
ALTER TABLE `registrations` ADD `booked_by` text;--> statement-breakpoint
ALTER TABLE `registrations` ADD `waitlist_at` integer;--> statement-breakpoint
ALTER TABLE `registrations` ADD `waitlist_rank` integer;--> statement-breakpoint
ALTER TABLE `registrations` ADD `swap_left` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` text;