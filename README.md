# ApparelFlow — Production Gate

A full-stack garment cutting checkpoint built with React, Next.js App Router conventions via Vinext, TypeScript, and Cloudflare D1 (persistent relational SQLite). The server controls role permissions and the transition into the sewing queue.

## Demo accounts

Password for all three: `ApparelFlow!2026`.

| Role | Email | Capabilities |
| --- | --- | --- |
| Cutting Supervisor | cutting@apparelflow.demo | Create, submit, rework cutting orders |
| Cutting Verifier | verifier@apparelflow.demo | Save counts, approve, reject with reason |
| Sewing Supervisor | sewing@apparelflow.demo | See verified/assembly batches, start assembly |

The login page exposes these demo personas. The account switcher performs real server sign-in; it does not change a client-side permission flag. Demo users and the eight recipes seed on first login, after schema migrations.

## Run locally

Requires Node.js 24 and npm. No external database account is needed for local use.

```sh
npm ci
npm run db:generate # only when modifying the Drizzle schema; migrations are already committed
npm run build
node scripts/migrate-local.mjs
npm run dev
```

Open the printed local address (normally http://localhost:5173). D1 local data persists in `.wrangler/state`. Local data and hosted data are separate. To preview the production Worker, use `npm start` after building and migrating. Build and start retain the Sites starter's Cloudflare integration.

```sh
npm test
npm run typecheck
npm run test:http # against a running local server; default http://localhost:5173
```

`npm test` executes the actual production service against real SQLite with the production migrations. The D1 transport is adapted to Node's SQLite API; core business logic and queries are not mocked. HTTP tests check authentication and status-code contracts against a running server and create their own evaluation batches.

## Five-minute walkthrough

1. Sign in as Cutting Supervisor. Create a 50-garment Casual Blouse batch, roll `FAB-ROLL-882`, using 95 yards. Expected components are 50 fronts, 50 backs, 100 sleeves, 50 collars, and 100 cuffs.
2. Submit it to verification. Switch to Cutting Verifier and open the batch.
3. Enter a shortage (for example 99 cuffs), save counts, and observe disabled approval. A direct approval API call also returns 422.
4. Reject with a reason. Switch to Cutting, begin rework, update actual fabric yards, and resubmit. Prior decisions stay in history.
5. Switch to Verification, enter complete counts, save, and approve. Switch to Sewing to inspect the signed counts and start assembly. Refresh to confirm persistence.

## Architecture and state machine

`CUTTING → PENDING_VERIFICATION → VERIFIED → SEWING`

`PENDING_VERIFICATION → REJECTED → CUTTING` supports correction and resubmission. Creation first saves the preparation state; the explicit Submit to verification action sends bundles to QC. API requests cannot set arbitrary statuses. GREEN matches expected quantity; YELLOW exceeds it and may proceed; RED is below it and blocks approval. Missing counts also block approval.

`lib/service.ts` owns state transitions, expected-count multiplication, immutable snapshots, atomic D1 batches, and optimistic concurrency. `lib/auth.ts` owns passwords and sessions. `app/api/[...path]/route.ts` exposes authenticated HTTP endpoints. The React UI uses those same APIs and contains no alternative persistence or permission system.

Fabric variance is `(actual yards − recipe standard × target garments) / (recipe standard × target garments) × 100`, rounded to two decimal places on the server. Above-cap variance is a warning. Negative variance is retained honestly. No component shortages can pass regardless of fabric variance.

## Relational schema

| Table | Purpose and relationships |
| --- | --- |
| users | Unique email, salted password hash, full name, factory role |
| sessions | Hashed opaque token, user foreign key, expiry |
| recipes | Code, category, standard fabric, wastage cap |
| recipe_components | Recipe foreign key and pieces per garment |
| cutting_orders | Recipe and creator foreign keys, target, fabric, state, revision, current decision |
| verification_items | Unique order/component pair, expected/actual counts, traffic-light status |
| verification_logs | Order/verifier foreign keys, decision, note, fabric variance, immutable JSON component snapshot, timestamp, revision |
| login_attempts | Hashed email, ten-minute window, attempt count |

Drizzle migrations create the schema. A schema-only custom migration adds indexes and triggers for numeric validity, allowed transitions, verification prerequisites, and immutable records. Seeds are separate from migrations. Old logs survive rework; verified live counts cannot change.

## API contract

All mutation requests use JSON. Protected endpoints require the HttpOnly `af_session` cookie. Errors return `{ "error": "..." }`.

| Method | Route | Permission |
| --- | --- | --- |
| POST | /api/login | Email + password; per-email rate limit |
| POST | /api/logout | Signed-in user |
| GET | /api/me | Signed-in user |
| GET | /api/recipes | Cutting / verifier |
| GET, POST | /api/orders | List: cutting / verifier; create: cutting only |
| GET | /api/orders/:id | Sewing only sees VERIFIED or SEWING |
| POST | /api/orders/:id/submit | Cutting; `{revision}` |
| POST | /api/orders/:id/rework | Cutting; `{revision,actual_fabric_yds}` |
| POST | /api/orders/:id/counts | Verifier; `{revision,items:[{id,actual_qty}]}` |
| POST | /api/orders/:id/approve | Verifier; `{revision,note?}` |
| POST | /api/orders/:id/reject | Verifier; `{revision,note}` |
| POST | /api/orders/:id/start | Sewing; `{revision}` |
| GET | /api/sewing/queue | Sewing only, fixed VERIFIED predicate |
| GET | /api/sewing/active | Sewing only, fixed SEWING predicate |

Missing/expired session: 401. Wrong role: 403. Hidden/nonexistent batch: 404. Wrong state or stale revision: 409. Missing counts, shortage, invalid numbers or empty rejection: 422. Excess login attempts: 429. Creation fields: `{recipe_id,target_qty,fabric_roll_id,actual_fabric_yds}`. Actual inputs are bounded integers: target 1–500,000; fabric 1–1,000,000; component counts 0–1,000,000. Recipe standards may be decimal.

## Deployment and submission

`.openai/hosting.json` declares the persistent `DB` binding. Sites provisions hosted D1 and applies migrations during publication. The provided build is for Cloudflare Workers; it cannot be uploaded as a static-only site. A conventional Vercel/PostgreSQL deployment would require replacing the D1 adapter.

The source includes everything needed for review. Before submitting, ensure the live URL is publicly accessible to your evaluator and create the required public GitHub repository with your own account. See `AI_OPTIMIZATION_REPORT.md` for an honest account of AI assistance and limitations. Do not claim personal refactoring or tests you have not reviewed or run.

## Workspace pages

- **Home:** role-specific production overview, next batches, and quick actions. This is the default page after sign-in.
- **Product collection:** eight searchable/filterable styles, illustrated product cards, and complete recipe details. Includes Casual Blouse, Crop Top, Essential T-Shirt, Signature Polo, Oxford Shirt, Everyday Hoodie, Tailored Trousers, and Track Jacket.
- **Batch tracking:** live production stage boards with searchable batch cards; Sewing sees only verified and active assembly batches.
- **Quality reports:** server-aggregated verification decisions, average approved fabric variance, immutable decision ledger, and CSV export of the latest 200 decisions. Available to Cutting and Verification roles only; GET /api/reports enforces this permission.

New built-in catalogue entries seed idempotently for both new and existing installations. Existing user credentials, recipes, batches, and audit records are retained.

## Inventory, planning, and production insights

- Fabric inventory records opening stock, receipts and usage in whole yards. Atomic updates prevent negative balances and stale edits; movement history is immutable and records the signed-in user.
- Stock movements are recorded explicitly. Creating a cutting order does not automatically deduct stock; reference the batch in the stock issue note.
- Production planning saves recipe targets, due dates, priorities and notes. Plans can be scheduled, cancelled and restored; they never approve or release a batch. The cutting-order shortcut preselects the recipe.
- Alerts show stock at or below its reorder level and active plans due today or earlier, using the Sri Lanka calendar date.
- Home includes production-stage bars, the current proportion of released batches, and garment mix from the signed-in role's visible batches.
- Cutting Supervisors manage inventory/plans; Cutting Verifiers can read them; Sewing is blocked from both APIs and pages.

Public demo: https://apparelflow-production-gate.krishanking098.workers.dev
Direct deployment instructions: CLOUDFLARE_DEPLOYMENT.md.
