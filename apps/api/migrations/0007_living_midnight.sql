ALTER TABLE `orders` ADD `delivery_method` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_recipient` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_phone` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_line1` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_line2` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_neighborhood` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_city` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_state` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_postal_code` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_country` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `pickup_seller_id` text REFERENCES sellers(id) ON DELETE SET NULL;