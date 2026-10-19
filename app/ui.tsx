'use client';
import { Layers3, CheckCircle2 } from 'lucide-react';
export type Any = Record<string, any>;
export const roles = [{ id: 'cutting_supervisor', name: 'Cutting Supervisor', short: 'Cutting', email: 'cutting@apparelflow.demo', description: 'Plan batches and prepare the cutting floor.' }, { id: 'cutting_verifier', name: 'Cutting Verifier', short: 'Verification', email: 'verifier@apparelflow.demo', description: 'Count every component. Release with confidence.' }, { id: 'sewing_supervisor', name: 'Sewing Supervisor', short: 'Sewing', email: 'sewing@apparelflow.demo', description: 'Receive verified batches and start assembly.' }];
export const demoPassword = 'ApparelFlow!2026';
export const statusNames: Any = { CUTTING: 'In cutting', PENDING_VERIFICATION: 'Awaiting QC', REJECTED: 'Needs rework', VERIFIED: 'Verified', SEWING: 'In assembly' };
export async function api(path: string, body?: Any): Promise<any> { const r = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const data: any = await r.json(); if (!r.ok)
    throw new Error(data.error || 'Something went wrong.'); return data; }
export function Badge({ status }: {
    status: string;
}) { return <span className={'badge ' + status.toLowerCase()}><span />{statusNames[status] || status}</span>; }
export function Garment({ crop = false, small = false }: {
    crop?: boolean;
    small?: boolean;
}) { return <svg viewBox="0 0 160 160" aria-hidden="true" className={small ? 'garment small' : 'garment'}><path d={crop ? 'M54 28 L38 40 18 68 39 83 48 70 47 121 113 121 112 70 121 83 142 68 122 40 106 28 Q80 48 54 28Z' : 'M54 22 L35 33 12 65 35 84 47 67 44 140 116 140 113 67 125 84 148 65 125 33 106 22 Q80 46 54 22Z'} fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M54 25 Q80 64 106 25 M80 48V137" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="3 4"/>{!crop && [67, 84, 101, 118].map(y => <circle key={y} cx="80" cy={y} r="1.5" fill="currentColor"/>)}</svg>; }
export function Brand() { return <div className="brand"><span className="brand-icon"><Layers3 size={21}/></span><span>apparel<span className="brand-light">flow</span><small>PRODUCTION WORKSPACE</small></span></div>; }
export function formatDate(v: string) { return new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
export function whole(s: string, min = 0) { return /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) >= min && Number(s) <= 1000000; }
