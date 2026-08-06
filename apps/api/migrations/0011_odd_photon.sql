ALTER TABLE `inventory` ADD `catalog_id` text;--> statement-breakpoint
CREATE INDEX `idx_inventory_catalog_id` ON `inventory` (`catalog_id`);