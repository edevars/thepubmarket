ALTER TABLE `orders` ADD `tracking_number` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipped_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivered_at` integer;--> statement-breakpoint
CREATE INDEX `idx_sellers_user_id` ON `sellers` (`user_id`);