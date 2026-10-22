CREATE TABLE fabric_rolls (
 id TEXT PRIMARY KEY, roll_code TEXT NOT NULL UNIQUE, material TEXT NOT NULL,
 color TEXT NOT NULL, supplier TEXT NOT NULL, available_yds INTEGER NOT NULL CHECK(available_yds BETWEEN 0 AND 1000000),
 reorder_yds INTEGER NOT NULL CHECK(reorder_yds BETWEEN 0 AND 1000000),
 revision INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE fabric_movements (
 id TEXT PRIMARY KEY, roll_id TEXT NOT NULL REFERENCES fabric_rolls(id),
 kind TEXT NOT NULL CHECK(kind IN ('OPENING','RECEIPT','ISSUE')), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
 note TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), timestamp TEXT NOT NULL,
 mutation_token TEXT NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE production_plans (
 id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL REFERENCES recipes(id), target_qty INTEGER NOT NULL CHECK(target_qty BETWEEN 1 AND 500000),
 due_date TEXT NOT NULL, priority TEXT NOT NULL CHECK(priority IN ('NORMAL','HIGH','URGENT')),
 status TEXT NOT NULL CHECK(status IN ('PLANNED','SCHEDULED','CANCELLED')),
 note TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX movements_roll_time ON fabric_movements(roll_id,timestamp);
--> statement-breakpoint
CREATE INDEX plans_due_status ON production_plans(status,due_date);
--> statement-breakpoint
CREATE TRIGGER fabric_movement_no_update BEFORE UPDATE ON fabric_movements BEGIN SELECT RAISE(ABORT,'Stock history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER fabric_movement_no_delete BEFORE DELETE ON fabric_movements BEGIN SELECT RAISE(ABORT,'Stock history is immutable'); END;
