import { AppError } from './domain.ts';
const encoder = new TextEncoder();
export async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))).map(v => v.toString(16).padStart(2, '0')).join(''); }
export async function passwordHash(password: string, salt: string) { const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256); return Array.from(new Uint8Array(bits)).map(v => v.toString(16).padStart(2, '0')).join(''); }
export async function authenticate(db: D1Database, request: Request) { const token = request.headers.get('cookie')?.match(/(?:^|;\s*)af_session=([^;]+)/)?.[1]; if (!token)
    throw new AppError(401, 'Please sign in to continue.'); const user = await db.prepare('SELECT u.id,u.email,u.role,u.full_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?').bind(await digest(token), Date.now()).first<any>(); if (!user)
    throw new AppError(401, 'Your session has expired. Please sign in again.'); return user; }
export function checkOrigin(request: Request) { const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin)
    throw new AppError(403, 'Cross-origin writes are blocked.'); }
export function cookie(request: Request, token: string, age = 28800) { return `af_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`; }
