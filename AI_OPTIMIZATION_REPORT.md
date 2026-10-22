# AI assistance and engineering review

## 1. Tools and prompting
OpenAI Codex assisted with extracting the challenge, relational schema design, server APIs, React UI, integration tests, documentation, and deployment preparation. The Sites plugin supplied the Vinext/Cloudflare starter and publishing workflow. My personal contribution was testing and reviewing the application. AI generated and revised the implementation; I contributed to evaluating the result rather than independently writing all of the code.

## 2. Flawed or suboptimal generated code
Concrete issues caught during generation and review:

- The initial JSON route read request bodies without checking that the value was an object. JSON `null` or an array could reach the service and return an internal error instead of a validation error. A shared `bodyObject` parser now returns 422 for these payloads.
- Initial numeric guards allowed one million garments but capped physical component counts at one million. Two-piece components would require two million pieces, making the largest allowed batches impossible to verify. Batch quantity is now capped at 500,000, keeping all recipe-derived component totals within the count limit.
- The first dependency installation assumed a globally available npm and a writable default npm cache. This Windows environment had neither. Build tooling was obtained in the working directory and the installer cache redirected to ignored project-local state. No global runtime or user settings were changed.

## 3. Human contribution: testing, review, and refactoring attribution
The assistant revised the generated code to address the issues above. It also used a real SQLite database for service integration tests rather than mocking the component rules. Revision checks and unique mutation tokens protect concurrent decisions. Database triggers supplement API checks to stop invalid transitions and protect approved counts and verification records.

I personally performed testing and review of the application. This was my contribution to checking the delivered result. The automated test code and the implementation fixes described above were generated and executed by the assistant; they are not presented as code I independently authored or refactored.

This division of work credits my testing and review separately from AI-assisted implementation. I do not assign an unsupported percentage to either contribution or claim that I personally discovered every issue listed in this report.

## 4. Defensive architecture
- Demo personas use separate database users with salted PBKDF2 password hashes. Sign-in creates random, expiring sessions; only a SHA-256 digest of the session token is stored. Cookies are HttpOnly, SameSite Strict, and Secure on HTTPS.
- The server derives identity from the session. Client role, verifier ID, timestamps, expected counts, statuses, and wastage fields are never accepted as authority.
- Every mutation enforces role, current state, and revision. Count saves require exactly the recipe's component set, without duplicates, and actual whole-number quantities.
- Approval reads persisted counts, rejects missing or short components, and atomically inserts an immutable audit snapshot and updates the order. An excess is recorded and allowed.
- The sewing queue uses a fixed database `WHERE status='VERIFIED'` predicate. A separate sewing-only endpoint lists batches already in assembly. Sewing detail requests return 404 for unapproved IDs.
- Audit snapshots contain per-component expected and actual counts, variance, authenticated verifier, server timestamp, and computed fabric variance. Rework resets live counts but retains previous audit snapshots.
- Automated tests exercise the production service and SQL, including direct SQL attempts to bypass audit immutability.

## Limits to understand
Demo credentials are intentionally public to support evaluation. The app has per-email sign-in throttling, but an internet-facing production deployment should add edge/IP rate limits, account management, password rotation, database backups, and monitoring. The challenge's whole-number input rule is applied to actual fabric yards as well as garment and component quantities; recipe fabric standards retain decimal precision. Fabric variance above a recipe cap is displayed as a warning, not an approval hard stop: the stated hard stop applies to component shortages.
