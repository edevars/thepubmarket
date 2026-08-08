ALTER TABLE `orders` ADD `shipping_address_match` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_address_original` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_corpus_version` text;