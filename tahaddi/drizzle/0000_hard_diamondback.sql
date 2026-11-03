CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`player` text NOT NULL,
	`step` integer NOT NULL,
	`choice` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games` (
	`pin` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`title` text NOT NULL,
	`questions` text NOT NULL,
	`step` integer DEFAULT -1 NOT NULL,
	`deadline` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`pin` text NOT NULL,
	`name` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL
);
