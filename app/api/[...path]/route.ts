import { env } from 'cloudflare:workers';
import { AppError, text } from '../../../lib/domain';
import { authenticate, checkOrigin, cookie, digest, passwordHash } from '../../../lib/auth';
import { seed, listRecipes, listOrders, detail, createOrder, act, qualityReport } from '../../../lib/service';
export const dynamic = 'force-dynamic';
async function bodyObject(request: Request): Promise<Record<string, any>> { const value = await request.json(); if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError(422, 'A JSON object is required.'); return value as Record<string, any>; }
async function handle(request: Request) {
    try {
        const db = env.DB;
        if (!db)
            throw new AppError(503, 'Database is not configured.');
        const path = new URL(request.url).pathname.replace(/^\/api\//, '').split('/');
        const method = request.method;
        if (method !== 'GET')
            checkOrigin(request);
        if (path[0] === 'login' && method === 'POST') {
            await seed(db);
            const body = await bodyObject(request);
            const email = text(body.email, 'Email').toLowerCase(), password = text(body.password, 'Password', 200);
            // Bounded per-email login attempts stored in the database (survives isolates).
            const key = await digest(email), window = Math.floor(Date.now() / 600000);
            await db.prepare('INSERT INTO login_attempts (id,window,attempts) VALUES (?,?,1) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN window=excluded.window THEN attempts+1 ELSE 1 END,window=excluded.window').bind(key, window).run();
            const attempts = await db.prepare('SELECT attempts FROM login_attempts WHERE id=?').bind(key).first<any>();
            if (attempts.attempts > 40)
                throw new AppError(429, 'Too many sign-in attempts. Try again in ten minutes.');
            const user = await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first<any>();
            const [salt, hash] = (user?.password_hash || 'missing:missing').split(':');
            const candidate = await passwordHash(password, salt);
            let diff = candidate.length ^ hash.length;
            for (let i = 0; i < candidate.length; i++)
                diff |= candidate.charCodeAt(i) ^ (hash.charCodeAt(i) || 0);
            if (!user || diff)
                throw new AppError(401, 'Email or password is incorrect.');
            const token = crypto.randomUUID() + crypto.randomUUID();
            await db.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(await digest(token), user.id, Date.now() + 28800000).run();
            return Response.json({ user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } }, { headers: { 'Set-Cookie': cookie(request, token), 'Cache-Control': 'no-store' } });
        }
        const user = await authenticate(db, request);
        if (path[0] === 'logout' && method === 'POST') {
            const token = request.headers.get('cookie')?.match(/af_session=([^;]+)/)?.[1];
            if (token)
                await db.prepare('DELETE FROM sessions WHERE id=?').bind(await digest(token)).run();
            return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie(request, '', 0) } });
        }
        let result: any;
        if(path[0]==='reports' && path.length===1 && method==='GET') result=await qualityReport(db,user);
        else if (path[0] === 'me' && method === 'GET')
            result = { user };
        else if (path[0] === 'recipes' && method === 'GET') {
            if (user.role === 'sewing_supervisor')
                throw new AppError(403, 'Recipes are restricted to cutting roles.');
            result = await listRecipes(db);
        }
        else if (path.join('/') === 'sewing/queue' && method === 'GET')
            result = await listOrders(db, user, true);
        else if (path.join('/') === 'sewing/active' && method === 'GET') {
            if (user.role !== 'sewing_supervisor')
                throw new AppError(403, 'Sewing access required.');
            result = (await db.prepare("SELECT o.*,r.name AS recipe_name,r.recipe_code FROM cutting_orders o JOIN recipes r ON r.id=o.recipe_id WHERE o.status='SEWING' ORDER BY o.sewing_started_at DESC").all()).results;
        }
        else if (path[0] === 'orders' && path.length === 1 && method === 'GET')
            result = await listOrders(db, user);
        else if (path[0] === 'orders' && path.length === 1 && method === 'POST')
            result = await createOrder(db, user, await bodyObject(request));
        else if (path[0] === 'orders' && path.length === 2 && method === 'GET')
            result = await detail(db, user, path[1]);
        else if (path[0] === 'orders' && path.length === 3 && method === 'POST')
            result = await act(db, user, path[1], path[2], await bodyObject(request));
        else
            throw new AppError(404, 'Endpoint not found.');
        return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (error) {
        if (error instanceof AppError)
            return Response.json({ error: error.message }, { status: error.status });
        if (error instanceof SyntaxError)
            return Response.json({ error: 'Invalid JSON request.' }, { status: 422 });
        console.error('API request failed', error);
        return Response.json({ error: 'The request could not be completed. Please try again.' }, { status: 500 });
    }
}
export const GET = handle;
export const POST = handle;
