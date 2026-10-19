import { AppError, requireRole, integer, text, flag, assertApproval, wastage } from './domain.ts';
import { passwordHash } from './auth.ts';
type User = {
    id: string;
    role: string;
    full_name: string;
    email: string;
};
export async function seed(db: D1Database) {
    // Seed records, never schema. INSERT OR IGNORE makes simultaneous first visits safe.
    const now = new Date().toISOString();
    const accounts = [['u-cut', 'cutting@apparelflow.demo', 'cutting_supervisor', 'Nimal Perera'], ['u-qc', 'verifier@apparelflow.demo', 'cutting_verifier', 'Amaya Silva'], ['u-sew', 'sewing@apparelflow.demo', 'sewing_supervisor', 'Ravi Fernando']];
    const exists = await db.prepare('SELECT id FROM users LIMIT 1').first();
    if (exists)
        return;
    const statements = [];
    for (const [id, email, role, name] of accounts) {
        const salt = crypto.randomUUID();
        const hash = await passwordHash('ApparelFlow!2026', salt);
        statements.push(db.prepare('INSERT OR IGNORE INTO users (id,email,password_hash,role,full_name,created_at) VALUES (?,?,?,?,?,?)').bind(id, email, `${salt}:${hash}`, role, name, now));
    }
    const recipes = [['blouse', 'REC-BL01', 'Casual Blouse', 'Blouse', 1.8, 5], ['crop', 'REC-CT02', 'Crop Top', 'Crop Top', 1.1, 8]];
    for (const r of recipes)
        statements.push(db.prepare('INSERT OR IGNORE INTO recipes VALUES (?,?,?,?,?,?)').bind(...r));
    for (const [recipe, parts] of [['blouse', [['Front Body Panel', 1], ['Back Body Panel', 1], ['Sleeves (Left & Right)', 2], ['Collar & Stand', 1], ['Sleeve Cuffs', 2]]], ['crop', [['Front Chest Panel', 1], ['Back Support Panel', 1], ['Neck Binding Strip', 1], ['Hem Elastic Casing', 1], ['Side Strap Accents', 2]]]] as const)
        for (let i = 0; i < parts.length; i++)
            statements.push(db.prepare('INSERT OR IGNORE INTO recipe_components (id,recipe_id,component_name,pieces_per_garment) VALUES (?,?,?,?)').bind(`${recipe}-${i}`, recipe, ...parts[i]));
    await db.batch(statements);
}
export async function listRecipes(db: D1Database) { const recipes = (await db.prepare('SELECT * FROM recipes ORDER BY recipe_code').all()).results; const components = (await db.prepare('SELECT * FROM recipe_components ORDER BY id').all()).results; return recipes.map((r: any) => ({ ...r, components: components.filter((c: any) => c.recipe_id === r.id) })); }
export async function listOrders(db: D1Database, user: User, sewing = false) {
    if (sewing)
        requireRole(user, 'sewing_supervisor');
    else
        requireRole(user, 'cutting_supervisor', 'cutting_verifier');
    // Caller parameters never determine this predicate.
    const where = sewing ? "WHERE o.status='VERIFIED'" : '';
    return (await db.prepare(`SELECT o.*,r.name AS recipe_name,r.recipe_code,r.std_fabric_yards,r.wastage_cap,u.full_name AS creator_name,(SELECT COUNT(*) FROM verification_items i WHERE i.order_id=o.id AND i.actual_qty IS NOT NULL) AS counted_components FROM cutting_orders o JOIN recipes r ON r.id=o.recipe_id JOIN users u ON u.id=o.created_by ${where} ORDER BY o.created_at DESC`).all()).results;
}
export async function detail(db: D1Database, user: User, id: string) {
    const order = await db.prepare('SELECT o.*,r.name AS recipe_name,r.recipe_code,r.std_fabric_yards,r.wastage_cap,u.full_name AS creator_name FROM cutting_orders o JOIN recipes r ON r.id=o.recipe_id JOIN users u ON u.id=o.created_by WHERE o.id=?').bind(id).first<any>();
    if (!order || (user.role === 'sewing_supervisor' && !['VERIFIED', 'SEWING'].includes(order.status)))
        throw new AppError(404, 'Batch not found.');
    const items = (await db.prepare('SELECT i.*,c.component_name,c.pieces_per_garment FROM verification_items i JOIN recipe_components c ON c.id=i.component_id WHERE i.order_id=? ORDER BY c.id').bind(id).all()).results;
    const logs = (await db.prepare('SELECT l.*,u.full_name AS verifier_name FROM verification_logs l JOIN users u ON u.id=l.verifier_id WHERE l.order_id=? ORDER BY l.timestamp DESC').bind(id).all()).results;
    return { ...order, items, logs };
}
export async function createOrder(db: D1Database, user: User, body: any) {
    requireRole(user, 'cutting_supervisor');
    const recipeId = text(body.recipe_id, 'Recipe');
    const qty = integer(body.target_qty, 'Batch quantity', 1);
    const fabric = integer(body.actual_fabric_yds, 'Actual fabric used', 1);
    const roll = text(body.fabric_roll_id, 'Fabric roll ID');
    const recipe = await db.prepare('SELECT * FROM recipes WHERE id=?').bind(recipeId).first();
    if (!recipe)
        throw new AppError(422, 'Choose a valid production recipe.');
    if (qty > 500000)
        throw new AppError(422, 'A batch may contain at most 500,000 garments.');
    const components = (await db.prepare('SELECT * FROM recipe_components WHERE recipe_id=? ORDER BY id').bind(recipeId).all()).results as any[];
    const id = crypto.randomUUID(), now = new Date().toISOString(), no = `CUT-${Date.now().toString(36).toUpperCase()}-${id.slice(0, 4).toUpperCase()}`;
    await db.batch([db.prepare('INSERT INTO cutting_orders (id,order_no,recipe_id,target_qty,fabric_roll_id,actual_fabric_yds,status,created_by,created_at,updated_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?,0)').bind(id, no, recipeId, qty, roll, fabric, 'CUTTING', user.id, now, now), ...components.map(c => db.prepare('INSERT INTO verification_items (id,order_id,component_id,expected_qty,actual_qty,status) VALUES (?,?,?,?,NULL,?)').bind(crypto.randomUUID(), id, c.id, qty * c.pieces_per_garment, 'UNCOUNTED'))]);
    return detail(db, user, id);
}
export async function act(db: D1Database, user: User, id: string, action: string, body: any) {
    // Check permissions BEFORE reading a protected batch or accepting client fields.
    requireRole(user, ...(action === 'submit' || action === 'rework' ? ['cutting_supervisor'] as const : action === 'start' ? ['sewing_supervisor'] as const : ['cutting_verifier'] as const));
    const order = await detail(db, user, id);
    const rev = integer(body.revision, 'Batch revision');
    if (order.revision !== rev)
        throw new AppError(409, 'This batch changed. Refresh it before continuing.');
    const now = new Date().toISOString(), token = crypto.randomUUID();
    let statements: D1PreparedStatement[] = [];
    if (action === 'submit') {
        if (order.status !== 'CUTTING')
            throw new AppError(409, 'Only a cutting batch can be submitted.');
        statements = [db.prepare("UPDATE cutting_orders SET status='PENDING_VERIFICATION',revision=revision+1,updated_at=?,mutation_token=? WHERE id=? AND revision=? AND status='CUTTING'").bind(now, token, id, rev)];
    }
    else if (action === 'rework') {
        if (order.status !== 'REJECTED')
            throw new AppError(409, 'Only a rejected batch can be reworked.');
        const fabric = integer(body.actual_fabric_yds, 'Actual fabric used', 1);
        statements = [db.prepare("UPDATE cutting_orders SET status='CUTTING',actual_fabric_yds=?,revision=revision+1,updated_at=?,mutation_token=? WHERE id=? AND revision=? AND status='REJECTED'").bind(fabric, now, token, id, rev), db.prepare("UPDATE verification_items SET actual_qty=NULL,status='UNCOUNTED' WHERE order_id=? AND EXISTS(SELECT 1 FROM cutting_orders WHERE id=? AND mutation_token=?)").bind(id, id, token)];
    }
    else if (action === 'start') {
        if (order.status !== 'VERIFIED')
            throw new AppError(409, 'Only a verified batch can start sewing.');
        statements = [db.prepare("UPDATE cutting_orders SET status='SEWING',sewing_started_at=?,revision=revision+1,updated_at=?,mutation_token=? WHERE id=? AND revision=? AND status='VERIFIED'").bind(now, now, token, id, rev)];
    }
    else {
        if (order.status !== 'PENDING_VERIFICATION')
            throw new AppError(409, 'This batch is not awaiting verification.');
        if (action === 'counts') {
            if (!Array.isArray(body.items) || body.items.length !== order.items.length || body.items.some((i: any) => !i || typeof i !== 'object' || Array.isArray(i) || typeof i.id !== 'string') || new Set(body.items.map((i: any) => i.id)).size !== order.items.length)
                throw new AppError(422, 'Supply exactly one count for every component.');
            const counts = order.items.map((i: any) => { const input = body.items.find((x: any) => x.id === i.id); if (!input)
                throw new AppError(422, 'A required component is missing.'); const count = integer(input.actual_qty, i.component_name); return { ...i, actual_qty: count }; });
            statements = [db.prepare("UPDATE cutting_orders SET revision=revision+1,updated_at=?,mutation_token=? WHERE id=? AND revision=? AND status='PENDING_VERIFICATION'").bind(now, token, id, rev), ...counts.map((i: any) => db.prepare('UPDATE verification_items SET actual_qty=?,status=? WHERE id=? AND order_id=? AND EXISTS(SELECT 1 FROM cutting_orders WHERE id=? AND mutation_token=?)').bind(i.actual_qty, flag(i.actual_qty, i.expected_qty), i.id, id, id, token))];
        }
        else if (action === 'approve' || action === 'reject') {
            if (action === 'approve')
                assertApproval(order.items);
            const note = action === 'reject' ? text(body.note, 'Rejection reason', 2000) : typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
            const decision = action === 'approve' ? 'APPROVED' : 'REJECTED', status = action === 'approve' ? 'VERIFIED' : 'REJECTED';
            const snapshot = order.items.map((i: any) => ({ component_id: i.component_id, component_name: i.component_name, expected_qty: i.expected_qty, actual_qty: i.actual_qty, variance: i.actual_qty === null ? null : i.actual_qty - i.expected_qty, status: flag(i.actual_qty, i.expected_qty) }));
            statements = [db.prepare("INSERT INTO verification_logs (id,order_id,verifier_id,decision,rejection_note,wastage_pct,component_snapshot,timestamp,order_revision) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cutting_orders WHERE id=? AND revision=? AND status='PENDING_VERIFICATION')").bind(token, id, user.id, decision, note || null, wastage(order.actual_fabric_yds, order.std_fabric_yards, order.target_qty), JSON.stringify(snapshot), now, rev, id, rev), db.prepare("UPDATE cutting_orders SET status=?,decision_id=?,revision=revision+1,updated_at=?,mutation_token=? WHERE id=? AND revision=? AND status='PENDING_VERIFICATION' AND EXISTS(SELECT 1 FROM verification_logs WHERE id=?)").bind(status, token, now, token, id, rev, token)];
        }
        else
            throw new AppError(404, 'Unknown action.');
    }
    // D1 batch is atomic. Revision + unique mutation token prevents concurrent edits
    // from reusing a validation decision made against an older component snapshot.
    const results = await db.batch(statements);
    if (!results[0].meta.changes)
        throw new AppError(409, 'Another request changed this batch. Refresh and retry.');
    return detail(db, user, id);
}
