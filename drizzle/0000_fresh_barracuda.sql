CREATE TABLE `cutting_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_no` text NOT NULL,
	`recipe_id` text NOT NULL,
	`target_qty` integer NOT NULL,
	`fabric_roll_id` text NOT NULL,
	`actual_fabric_yds` integer NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`mutation_token` text,
	`decision_id` text,
	`sewing_started_at` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cutting_orders_order_no_unique` ON `cutting_orders` (`order_no`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_components` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`component_name` text NOT NULL,
	`pieces_per_garment` integer NOT NULL,
	`image_url` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_code` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`std_fabric_yards` real NOT NULL,
	`wastage_cap` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_recipe_code_unique` ON `recipes` (`recipe_code`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`component_id` text NOT NULL,
	`expected_qty` integer NOT NULL,
	`actual_qty` integer,
	`status` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `cutting_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `recipe_components`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `verification_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`verifier_id` text NOT NULL,
	`decision` text NOT NULL,
	`rejection_note` text,
	`wastage_pct` real NOT NULL,
	`component_snapshot` text NOT NULL,
	`timestamp` text NOT NULL,
	`order_revision` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `cutting_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verifier_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
