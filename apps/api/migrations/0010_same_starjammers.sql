CREATE TABLE `inventory_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inventory_photos_size_bytes_check" CHECK("inventory_photos"."size_bytes" > 0),
	CONSTRAINT "inventory_photos_sort_order_check" CHECK("inventory_photos"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_photos_r2_key` ON `inventory_photos` (`r2_key`);--> statement-breakpoint
CREATE INDEX `idx_inventory_photos_inventory_id` ON `inventory_photos` (`inventory_id`);