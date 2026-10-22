# Validation evidence

- `npm test`: 26 production-service/SQLite integration tests passed.
- `npm run test:http` against the local Vinext server with persistent D1: 10 HTTP tests passed.
- `npm run typecheck`: passed.
- Production build through the Sites build helper: passed.
- Local D1 migrations: applied and verified, including all eight guard/audit triggers.
- Browser checks: login, Cutting workspace, authenticated role switching, and Verifier role isolation.

The HTTP suite initially assumed every error body was JSON. Vinext's development cross-origin guard correctly returned a plain-text 403 before the application route ran. The test transport was corrected to accept either response format while retaining the exact 403 assertion; all eight HTTP tests then passed.

The built Worker preview encountered an esbuild parent-directory access restriction in this Windows sandbox. Local browser and HTTP checks therefore used the Vinext development server with the same service code and persistent D1 binding. The production build itself passed. Hosted deployment must be checked separately before claiming the live site works.

Workspace expansion: catalogue upgrade/idempotency, new garment multipliers, quality report aggregation, and report access isolation are covered by the additional tests. Home navigation, catalogue search, recipe details, batch tracking, and the quality ledger were checked in the browser.


Operations expansion validation: 26 SQLite domain/database tests and 10 HTTP integration tests passed locally. TypeScript and the direct Cloudflare production build passed. Browser checks confirmed the inventory ledger, low-stock status and new navigation. New tests cover atomic stock movements, overdraft and stale revision blocking, immutable movement history, planning validation and separation of duties. Live integration results are recorded separately in the submission status deliverable after deployment.
