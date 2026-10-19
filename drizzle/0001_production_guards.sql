CREATE TRIGGER orders_valid_insert BEFORE INSERT ON cutting_orders BEGIN
 SELECT CASE WHEN NEW.status != 'CUTTING' OR NEW.target_qty < 1 OR NEW.target_qty > 500000 OR typeof(NEW.target_qty) != 'integer' OR NEW.actual_fabric_yds < 1 OR typeof(NEW.actual_fabric_yds) != 'integer' OR length(trim(NEW.fabric_roll_id))=0 THEN RAISE(ABORT,'Invalid cutting order') END;
 SELECT CASE WHEN (SELECT role FROM users WHERE id=NEW.created_by) != 'cutting_supervisor' THEN RAISE(ABORT,'Cutting supervisor required') END;
END;
--> statement-breakpoint
CREATE TRIGGER orders_state_guard BEFORE UPDATE ON cutting_orders BEGIN
 SELECT CASE WHEN NOT (NEW.status=OLD.status OR (OLD.status='CUTTING' AND NEW.status='PENDING_VERIFICATION') OR (OLD.status='PENDING_VERIFICATION' AND NEW.status IN ('VERIFIED','REJECTED')) OR (OLD.status='REJECTED' AND NEW.status='CUTTING') OR (OLD.status='VERIFIED' AND NEW.status='SEWING')) THEN RAISE(ABORT,'Invalid production state transition') END;
 SELECT CASE WHEN NEW.status NOT IN ('CUTTING','PENDING_VERIFICATION','REJECTED','VERIFIED','SEWING') THEN RAISE(ABORT,'Unknown production status') END;
 SELECT CASE WHEN NEW.recipe_id != OLD.recipe_id OR NEW.target_qty != OLD.target_qty OR NEW.created_by != OLD.created_by OR NEW.fabric_roll_id != OLD.fabric_roll_id OR NEW.order_no != OLD.order_no OR NEW.created_at != OLD.created_at THEN RAISE(ABORT,'Batch identity and recipe snapshot are immutable') END;
 SELECT CASE WHEN NEW.actual_fabric_yds != OLD.actual_fabric_yds AND NOT (OLD.status='REJECTED' AND NEW.status='CUTTING') THEN RAISE(ABORT,'Fabric changes require rework') END;
 SELECT CASE WHEN NEW.actual_fabric_yds < 1 OR typeof(NEW.actual_fabric_yds) != 'integer' THEN RAISE(ABORT,'Invalid fabric quantity') END;
 SELECT CASE WHEN OLD.status IN ('VERIFIED','SEWING') AND NEW.decision_id IS NOT OLD.decision_id THEN RAISE(ABORT,'Verification attribution is immutable') END;
 SELECT CASE WHEN NEW.status IN ('VERIFIED','REJECTED') AND OLD.status='PENDING_VERIFICATION' AND NOT EXISTS(SELECT 1 FROM verification_logs WHERE id=NEW.decision_id AND order_id=OLD.id AND order_revision=OLD.revision AND decision=CASE WHEN NEW.status='VERIFIED' THEN 'APPROVED' ELSE 'REJECTED' END) THEN RAISE(ABORT,'A matching verifier sign-off is required') END;
 SELECT CASE WHEN NEW.status='VERIFIED' AND (EXISTS(SELECT 1 FROM verification_items WHERE order_id=OLD.id AND (actual_qty IS NULL OR actual_qty<expected_qty)) OR (SELECT count(*) FROM verification_items WHERE order_id=OLD.id)!=(SELECT count(*) FROM recipe_components WHERE recipe_id=OLD.recipe_id) OR (SELECT count(*) FROM verification_items WHERE order_id=OLD.id)=0) THEN RAISE(ABORT,'Incomplete component counts cannot enter sewing') END;
END;
--> statement-breakpoint
CREATE UNIQUE INDEX verification_component_unique ON verification_items(order_id,component_id);
--> statement-breakpoint
CREATE INDEX orders_status_idx ON cutting_orders(status,created_at);
--> statement-breakpoint
CREATE INDEX logs_order_idx ON verification_logs(order_id,timestamp);
--> statement-breakpoint
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
--> statement-breakpoint
CREATE TRIGGER item_valid_insert BEFORE INSERT ON verification_items BEGIN
 SELECT CASE WHEN (SELECT status FROM cutting_orders WHERE id=NEW.order_id)!='CUTTING' THEN RAISE(ABORT,'Components can only be created during cutting') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM recipe_components c JOIN cutting_orders o ON o.recipe_id=c.recipe_id WHERE c.id=NEW.component_id AND o.id=NEW.order_id AND NEW.expected_qty=c.pieces_per_garment*o.target_qty) THEN RAISE(ABORT,'Expected count must match recipe') END;
END;
--> statement-breakpoint
CREATE TRIGGER item_update_guard BEFORE UPDATE ON verification_items BEGIN
 SELECT CASE WHEN (SELECT status FROM cutting_orders WHERE id=OLD.order_id) IN ('VERIFIED','SEWING') THEN RAISE(ABORT,'Verified counts are immutable') END;
 SELECT CASE WHEN NEW.expected_qty != OLD.expected_qty OR NEW.component_id != OLD.component_id OR NEW.order_id != OLD.order_id OR NEW.id != OLD.id THEN RAISE(ABORT,'Component identity and expected counts are immutable') END;
 SELECT CASE WHEN NEW.actual_qty IS NOT NULL AND (typeof(NEW.actual_qty)!='integer' OR NEW.actual_qty<0 OR NEW.actual_qty>1000000) THEN RAISE(ABORT,'Invalid component count') END;
 SELECT CASE WHEN NEW.status != CASE WHEN NEW.actual_qty IS NULL THEN 'UNCOUNTED' WHEN NEW.actual_qty<NEW.expected_qty THEN 'RED' WHEN NEW.actual_qty>NEW.expected_qty THEN 'YELLOW' ELSE 'GREEN' END THEN RAISE(ABORT,'Component status does not match count') END;
END;
--> statement-breakpoint
CREATE TRIGGER item_delete_guard BEFORE DELETE ON verification_items WHEN (SELECT status FROM cutting_orders WHERE id=OLD.order_id) IN ('VERIFIED','SEWING') BEGIN SELECT RAISE(ABORT,'Verified counts cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER log_valid_insert BEFORE INSERT ON verification_logs BEGIN
 SELECT CASE WHEN (SELECT role FROM users WHERE id=NEW.verifier_id)!='cutting_verifier' THEN RAISE(ABORT,'Cutting verifier required') END;
 SELECT CASE WHEN NEW.decision NOT IN ('APPROVED','REJECTED') OR (NEW.decision='REJECTED' AND (NEW.rejection_note IS NULL OR length(trim(NEW.rejection_note))=0)) THEN RAISE(ABORT,'A rejection needs a reason') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cutting_orders WHERE id=NEW.order_id AND status='PENDING_VERIFICATION' AND revision=NEW.order_revision) THEN RAISE(ABORT,'Sign-off requires a current pending batch') END;
 SELECT CASE WHEN NEW.decision='APPROVED' AND EXISTS(SELECT 1 FROM verification_items WHERE order_id=NEW.order_id AND (actual_qty IS NULL OR actual_qty<expected_qty)) THEN RAISE(ABORT,'Cannot sign off a shortage') END;
END;
--> statement-breakpoint
CREATE TRIGGER logs_no_update BEFORE UPDATE ON verification_logs BEGIN SELECT RAISE(ABORT,'Verification audit is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER logs_no_delete BEFORE DELETE ON verification_logs BEGIN SELECT RAISE(ABORT,'Verification audit is immutable'); END;
