CREATE TABLE `inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`tcg` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`condition` text,
	`price_cents` integer NOT NULL,
	`currency` text DEFAULT 'MXN' NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`scryfall_id` text,
	`oracle_id` text,
	`set_code` text,
	`set_name` text,
	`collector_number` text,
	`card_lang` text,
	`rarity` text,
	`finish` text DEFAULT 'nonfoil' NOT NULL,
	`image_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inventory_price_cents_check" CHECK("inventory"."price_cents" >= 0),
	CONSTRAINT "inventory_quantity_check" CHECK("inventory"."quantity" >= 0),
	CONSTRAINT "inventory_status_check" CHECK("inventory"."status" IN ('active', 'inactive')),
	CONSTRAINT "inventory_finish_check" CHECK("inventory"."finish" IN ('nonfoil', 'foil'))
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_seller_id` ON `inventory` (`seller_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_scryfall_id` ON `inventory` (`scryfall_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_status` ON `inventory` (`status`);--> statement-breakpoint
CREATE INDEX `idx_inventory_set_code` ON `inventory` (`set_code`);--> statement-breakpoint
CREATE INDEX `idx_inventory_title_nocase` ON `inventory` ("title" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`inventory_id` text,
	`title_snapshot` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`quantity` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "order_items_unit_price_cents_check" CHECK("order_items"."unit_price_cents" >= 0),
	CONSTRAINT "order_items_quantity_check" CHECK("order_items"."quantity" > 0),
	CONSTRAINT "order_items_line_total_cents_check" CHECK("order_items"."line_total_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_order_items_order_id` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_order_items_inventory_id` ON `order_items` (`inventory_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer_user_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`platform_fee_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`currency` text DEFAULT 'MXN' NOT NULL,
	`stripe_payment_intent_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "orders_status_check" CHECK("orders"."status" IN ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded')),
	CONSTRAINT "orders_subtotal_cents_check" CHECK("orders"."subtotal_cents" >= 0),
	CONSTRAINT "orders_platform_fee_cents_check" CHECK("orders"."platform_fee_cents" >= 0),
	CONSTRAINT "orders_total_cents_check" CHECK("orders"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_orders_buyer_user_id` ON `orders` (`buyer_user_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_seller_id` ON `orders` (`seller_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_stripe_payment_intent_id` ON `orders` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE TABLE `sellers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`stripe_connect_account_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sellers_status_check" CHECK("sellers"."status" IN ('invited', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sellers_slug` ON `sellers` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sellers_stripe_connect_account_id` ON `sellers` (`stripe_connect_account_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`role` text DEFAULT 'buyer' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('buyer', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);