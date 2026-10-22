# Direct Cloudflare deployment

This project supports the Workers Free plan and the persistent D1 database created for this assessment. No R2 or paid services are required. Free quotas still apply.

Cloudflare Workers Builds settings:

- Repository: `krishan098-coder/project`, branch `main`, root `/`.
- Worker name: `apparelflow-production-gate`.
- Build command: `node scripts/cloudflare-build.mjs`.
- Deploy command: `node scripts/cloudflare-deploy.mjs`.
- Node version: 24.

The build selects `wrangler.cloudflare.json` and emits `dist/server/wrangler.json` containing the real `DB` binding. The deploy script applies both committed schema migrations to remote D1 before uploading the Worker and its assets. It stops on any failure. Demo accounts and eight recipes seed on first login; local test batches are not uploaded.

Cloudflare's build token needs permission to deploy this Worker and apply D1 migrations in the selected account. Grant repository access only to this project when connecting GitHub. Keep all tokens out of source control.

After deployment, verify all three demo accounts, shortage blocking, approval and sewing handoff, and refresh persistence using the public `workers.dev` URL returned by Cloudflare. A created database and a passing local build do not establish that deployment succeeded.

The existing `.openai/hosting.json` identity remains available for Sites hosting. Direct Cloudflare deployment is selected only by the dedicated build script.
