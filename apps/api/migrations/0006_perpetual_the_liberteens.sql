CREATE TABLE `seller_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`invited_by` text NOT NULL,
	`ip` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_seller_invitations_seller_id` ON `seller_invitations` (`seller_id`);--> statement-breakpoint
CREATE INDEX `idx_seller_invitations_email` ON `seller_invitations` (`email`);