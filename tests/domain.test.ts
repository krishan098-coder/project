import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { act, seed, createOrder, listOrders, detail } from '../lib/service.ts';
import { integer, wastage } from '../lib/domain.ts';
import { authenticate, digest, checkOrigin } from '../lib/auth.ts';
// Execute the production service and production SQL against a real SQLite DB.
// Only the D1 transport is adapted; domain code and database predicates are shared.
class LocalD1 {
    sqlite = new DatabaseSync(':memory:');
    prepare(sql: string) { return new Statement(this.sqlite, sql); }
    async batch(statements: Statement[]) { this.sqlite.exec('BEGIN'); try {
        const out = [];
        for (const s of statements)
            out.push(await s.run());
        this.sqlite.exec('COMMIT');
        return out;
    }
    catch (e) {
        this.sqlite.exec('ROLLBACK');
        throw e;
    } }
}
class Statement {
    values: any[] = [];
    constructor(public sqlite: DatabaseSync, public sql: string) { }
    bind(...values: any[]) { this.values = values; return this; }
    async first() { return this.sqlite.prepare(this.sql).get(...this.values) || null; }
    async all() { return { results: this.sqlite.prepare(this.sql).all(...this.values) }; }
    async run() { const result = this.sqlite.prepare(this.sql).run(...this.values); return { meta: { changes: Number(result.changes) } }; }
}
let local: LocalD1, db: D1Database;
const cut = { id: 'u-cut', role: 'cutting_supervisor', full_name: 'Nimal', email: 'cutting@apparelflow.demo' }, qc = { id: 'u-qc', role: 'cutting_verifier', full_name: 'Amaya', email: 'verifier@apparelflow.demo' }, sew = { id: 'u-sew', role: 'sewing_supervisor', full_name: 'Ravi', email: 'sewing@apparelflow.demo' };
beforeEach(async () => { local = new LocalD1(); for (const f of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
    local.sqlite.exec(readFileSync(new URL('../drizzle/' + f, import.meta.url), 'utf8')); db = local as unknown as D1Database; await seed(db); });
async function pending() { let o = await createOrder(db, cut, { recipe_id: 'blouse', target_qty: 50, fabric_roll_id: 'FAB-ROLL-882', actual_fabric_yds: 95 }); return act(db, cut, o.id, 'submit', { revision: o.revision }); }
async function counted(short = false, excess = false) { let o = await pending(); return act(db, qc, o.id, 'counts', { revision: o.revision, items: o.items.map((i: any, n: number) => ({ id: i.id, actual_qty: i.expected_qty + (n === 0 ? (short ? -1 : excess ? 2 : 0) : 0) })) }); }
test('all GREEN: authenticated verifier approves and signs a persistent batch', async () => { const o = await counted(); await db.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(await digest('test-token'), qc.id, Date.now() + 10000).run(); const user = await authenticate(db, new Request('https://example.test/api', { headers: { cookie: 'af_session=test-token' } })); const approved = await act(db, user, o.id, 'approve', { revision: o.revision, verifier_id: cut.id, timestamp: 'forged' }); assert.equal(approved.status, 'VERIFIED'); assert.equal(approved.logs[0].verifier_id, qc.id); assert.notEqual(approved.logs[0].timestamp, 'forged'); assert.equal(approved.logs[0].wastage_pct, 5.56); assert.equal(JSON.parse(approved.logs[0].component_snapshot).length, 5); assert.equal((await listOrders(db, sew, true)).length, 1); });
test('RED shortage blocks approval with 422 and creates no audit or queue entry', async () => { const o = await counted(true); await assert.rejects(act(db, qc, o.id, 'approve', { revision: o.revision }), (e: any) => e.status === 422); assert.equal((await detail(db, qc, o.id)).logs.length, 0); assert.equal((await listOrders(db, sew, true)).length, 0); });
test('missing and uncounted components block approval', async () => { const o = await pending(); await assert.rejects(act(db, qc, o.id, 'approve', { revision: o.revision }), (e: any) => e.status === 422); await assert.rejects(act(db, qc, o.id, 'counts', { revision: o.revision, items: [] }), (e: any) => e.status === 422); });
test('rejection requires a nonblank reason', async () => { const o = await pending(); for (const note of ['', '   ', null])
    await assert.rejects(act(db, qc, o.id, 'reject', { revision: o.revision, note }), (e: any) => e.status === 422); });
test('non-verifier roles get 403 even when the batch ID is unknown', async () => { for (const user of [cut, sew])
    await assert.rejects(act(db, user, 'unknown', 'approve', { revision: 0 }), (e: any) => e.status === 403); });
test('database sewing query isolates cutting, pending, and rejected batches', async () => { await createOrder(db, cut, { recipe_id: 'crop', target_qty: 10, fabric_roll_id: 'ROLL', actual_fabric_yds: 12 }); await pending(); const o = await pending(); await act(db, qc, o.id, 'reject', { revision: o.revision, note: 'Missing cuffs' }); assert.deepEqual(await listOrders(db, sew, true), []); await assert.rejects(detail(db, sew, o.id), (e: any) => e.status === 404); await assert.rejects(listOrders(db, cut, true), (e: any) => e.status === 403); });
test('YELLOW excess is allowed and preserved in signed variances', async () => { const o = await counted(false, true); const approved = await act(db, qc, o.id, 'approve', { revision: o.revision }); assert.equal(JSON.parse(approved.logs[0].component_snapshot)[0].variance, 2); });
test('rework resets counts, keeps rejection history, and supports a fresh sign-off', async () => { let o = await counted(true); o = await act(db, qc, o.id, 'reject', { revision: o.revision, note: 'Recut one front body' }); const original = o.logs[0]; o = await act(db, cut, o.id, 'rework', { revision: o.revision, actual_fabric_yds: 97 }); assert(o.items.every((i: any) => i.actual_qty === null)); o = await act(db, cut, o.id, 'submit', { revision: o.revision }); o = await act(db, qc, o.id, 'counts', { revision: o.revision, items: o.items.map((i: any) => ({ id: i.id, actual_qty: i.expected_qty })) }); o = await act(db, qc, o.id, 'approve', { revision: o.revision }); assert.equal(o.logs.length, 2); assert.equal(o.logs.find((l: any) => l.id === original.id).component_snapshot, original.component_snapshot); });
test('stale revision cannot approve a newly changed batch', async () => { const o = await counted(); await act(db, qc, o.id, 'counts', { revision: o.revision, items: o.items.map((i: any) => ({ id: i.id, actual_qty: i.expected_qty - 1 })) }); await assert.rejects(act(db, qc, o.id, 'approve', { revision: o.revision }), (e: any) => e.status === 409); });
test('duplicate component IDs cannot hide a missing count', async () => { const o = await pending(); await assert.rejects(act(db, qc, o.id, 'counts', { revision: o.revision, items: o.items.map(() => ({ id: o.items[0].id, actual_qty: 100 })) }), (e: any) => e.status === 422); });
test('negative, decimal, null, empty, numeric strings, NaN and unsafe integers fail', () => { for (const value of [-1, 0.5, null, '', '50', NaN, Infinity, 9007199254740992])
    assert.throws(() => integer(value, 'Count'), (e: any) => e.status === 422); assert.equal(integer(0, 'Count'), 0); });
test('role separation also protects create, submit and start', async () => { await assert.rejects(createOrder(db, qc, {}), (e: any) => e.status === 403); const o = await pending(); await assert.rejects(act(db, qc, o.id, 'submit', { revision: o.revision }), (e: any) => e.status === 403); await assert.rejects(act(db, cut, o.id, 'start', { revision: o.revision }), (e: any) => e.status === 403); });
test('verified audit logs and counts reject SQL updates and deletion', async () => { const o = await counted(); const a = await act(db, qc, o.id, 'approve', { revision: o.revision }); assert.throws(() => local.sqlite.prepare('UPDATE verification_logs SET wastage_pct=0 WHERE id=?').run(a.logs[0].id)); assert.throws(() => local.sqlite.prepare('DELETE FROM verification_logs WHERE id=?').run(a.logs[0].id)); assert.throws(() => local.sqlite.prepare('UPDATE verification_items SET actual_qty=0 WHERE order_id=?').run(o.id)); assert.throws(() => local.sqlite.prepare('DELETE FROM verification_items WHERE order_id=?').run(o.id)); });
test('database rejects a direct status override without QC sign-off', async () => { const o = await pending(); assert.throws(() => local.sqlite.prepare("UPDATE cutting_orders SET status='VERIFIED' WHERE id=?").run(o.id)); });
test('assembly can start only once; verified queue remains strict', async () => { let o = await counted(); o = await act(db, qc, o.id, 'approve', { revision: o.revision }); o = await act(db, sew, o.id, 'start', { revision: o.revision }); assert.equal(o.status, 'SEWING'); assert(o.sewing_started_at); assert.equal((await listOrders(db, sew, true)).length, 0); await assert.rejects(act(db, sew, o.id, 'start', { revision: o.revision }), (e: any) => e.status === 409); });
test('authentication requires an unexpired server session', async () => { await assert.rejects(authenticate(db, new Request('https://test/')), (e: any) => e.status === 401); await db.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(await digest('old'), qc.id, 0).run(); await assert.rejects(authenticate(db, new Request('https://test/', { headers: { cookie: 'af_session=old' } })), (e: any) => e.status === 401); });
test('cross-origin writes fail; same origin is allowed', () => { assert.throws(() => checkOrigin(new Request('https://test/api', { headers: { origin: 'https://evil.test' } })), (e: any) => e.status === 403); checkOrigin(new Request('https://test/api', { headers: { origin: 'https://test' } })); });
test('fabric variance formula handles fractional standards and negative variance', () => { assert.equal(wastage(95, 1.8, 50), 5.56); assert.equal(wastage(10, 1.1, 10), -9.09); });
