CREATE TABLE `catalog_cards` (
	`tcg` text NOT NULL,
	`catalog_id` text NOT NULL,
	`oracle_id` text,
	`name` text NOT NULL,
	`set_code` text NOT NULL,
	`set_name` text NOT NULL,
	`collector_number` text NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`rarity` text DEFAULT '' NOT NULL,
	`artist` text,
	`finishes` text,
	`rules_text` text,
	`flavor_text` text,
	`game_attributes` text,
	`price_data` text,
	`price_fetched_at` integer,
	`source_image_url` text,
	`source_image_back_url` text,
	`image_r2_key` text,
	`image_back_r2_key` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`tcg`, `catalog_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_cards_name_nocase` ON `catalog_cards` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE INDEX `idx_catalog_cards_set_code` ON `catalog_cards` (`set_code`);