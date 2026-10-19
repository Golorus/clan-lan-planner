ALTER TABLE `persons` ADD `approval` text DEFAULT 'frei' NOT NULL;--> statement-breakpoint
ALTER TABLE `persons` ADD `approval_at` integer;--> statement-breakpoint
ALTER TABLE `persons` ADD `approval_by` text;