CREATE TABLE `sepomex_corpus_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`source_url` text NOT NULL,
	`published_label` text,
	`row_count` integer NOT NULL,
	`file_sha256` text NOT NULL,
	`loaded_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "sepomex_corpus_meta_singleton" CHECK("sepomex_corpus_meta"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `sepomex_settlements` (
	`postal_code` text NOT NULL,
	`settlement_id` text NOT NULL,
	`settlement` text NOT NULL,
	`settlement_type` text NOT NULL,
	`municipality` text NOT NULL,
	`state` text NOT NULL,
	`city` text,
	`zone` text NOT NULL,
	`state_code` text NOT NULL,
	`municipality_code` text NOT NULL,
	`city_code` text,
	`settlement_norm` text NOT NULL,
	`municipality_norm` text NOT NULL,
	`state_norm` text NOT NULL,
	`city_norm` text,
	`corpus_version` text NOT NULL,
	PRIMARY KEY(`postal_code`, `settlement_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_sepomex_municipality` ON `sepomex_settlements` (`state_norm`,`municipality_norm`);