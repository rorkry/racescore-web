CREATE TABLE `races` (
	`raceKey` text PRIMARY KEY NOT NULL,
	`date` text,
	`place` text,
	`raceNo` integer,
	`data` text
);
--> statement-breakpoint
CREATE TABLE `umadata` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`race_id_new_no_horse_num` text,
	`date` text,
	`distance` text,
	`horse_number` text,
	`horse_name` text,
	`index_value` text,
	`class_name` text,
	`track_condition` text,
	`finish_position` text,
	`last_3f` text,
	`finish_time` text,
	`standard_time` text,
	`rpci` text,
	`pci` text,
	`good_run` text,
	`pci3` text,
	`horse_mark` text,
	`corner_2` text,
	`corner_3` text,
	`corner_4` text,
	`gender` text,
	`age` text,
	`horse_weight` text,
	`weight_change` text,
	`jockey_weight` text,
	`jockey` text,
	`multiple_entries` text,
	`affiliation` text,
	`trainer` text,
	`place` text,
	`number_of_horses` text,
	`popularity` text,
	`sire` text,
	`dam` text,
	`track_condition_2` text,
	`place_2` text,
	`margin` text,
	`corner_1` text,
	`corner_2_2` text,
	`corner_3_2` text,
	`corner_4_2` text,
	`work_1s` text,
	`horse_mark_2` text,
	`horse_mark_3` text,
	`horse_mark_4` text,
	`horse_mark_5` text,
	`horse_mark_6` text,
	`horse_mark_7` text,
	`horse_mark_7_2` text,
	`horse_mark_8` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `umaren` (
	`raceKey` text NOT NULL,
	`comb` text NOT NULL,
	`odds` integer
);
--> statement-breakpoint
CREATE TABLE `wide` (
	`raceKey` text NOT NULL,
	`comb` text NOT NULL,
	`odds` integer
);
