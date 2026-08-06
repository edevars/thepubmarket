ALTER TABLE `webhook_events` ADD `status` text DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE `webhook_events` ADD `processed_at` integer;--> statement-breakpoint
ALTER TABLE `webhook_events` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `webhook_events` ADD `last_error` text;--> statement-breakpoint
-- Historia (TASK-022): todo evento anterior a este ledger se da por procesado.
-- Sin esto, el default 'received' los convertiría en "trabajo inconcluso" y un
-- redelivery (o un barrido futuro) intentaría re-ejecutarlos.
UPDATE `webhook_events` SET `status` = 'processed', `processed_at` = unixepoch();