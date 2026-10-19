export type Role = 'cutting_supervisor' | 'cutting_verifier' | 'sewing_supervisor';
export class AppError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function requireRole(user: {
    role: string;
}, ...roles: Role[]) { if (!roles.includes(user.role as Role))
    throw new AppError(403, 'Your role is not permitted to perform this action.'); }
export function integer(value: unknown, name: string, min = 0) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > 1000000)
    throw new AppError(422, `${name} must be a whole number between ${min} and 1,000,000.`); return value; }
export function text(value: unknown, name: string, max = 100) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new AppError(422, `${name} is required (maximum ${max} characters).`); return value.trim(); }
export function flag(actual: number | null, expected: number) { return actual === null ? 'UNCOUNTED' : actual < expected ? 'RED' : actual > expected ? 'YELLOW' : 'GREEN'; }
export function assertApproval(items: {
    actual_qty: number | null;
    expected_qty: number;
}[]) { if (!items.length || items.some(i => i.actual_qty === null || !Number.isSafeInteger(i.actual_qty) || i.actual_qty < i.expected_qty))
    throw new AppError(422, 'Approval blocked: count every component and resolve every shortage.'); }
export function wastage(actual: number, standard: number, target: number) { const expected = standard * target; return Math.round(((actual - expected) / expected) * 10000) / 100; }
