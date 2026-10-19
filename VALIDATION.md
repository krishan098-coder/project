# Validation evidence

- `npm test`: 18 production-service/SQLite integration tests passed.
- `npm run test:http` against the local Vinext server with persistent D1: 8 HTTP tests passed.
- `npm run typecheck`: passed.
- Production build through the Sites build helper: passed.
- Local D1 migrations: applied and verified, including all eight guard/audit triggers.
- Browser checks: login, Cutting workspace, authenticated role switching, and Verifier role isolation.

The HTTP suite initially assumed every error body was JSON. Vinext's development cross-origin guard correctly returned a plain-text 403 before the application route ran. The test transport was corrected to accept either response format while retaining the exact 403 assertion; all eight HTTP tests then passed.

The built Worker preview encountered an esbuild parent-directory access restriction in this Windows sandbox. Local browser and HTTP checks therefore used the Vinext development server with the same service code and persistent D1 binding. The production build itself passed. Hosted deployment must be checked separately before claiming the live site works.
