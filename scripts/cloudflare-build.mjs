import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.env.APPARELFLOW_DIRECT_CLOUDFLARE = '1';
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/vinext/dist/cli.js', import.meta.url)), 'build'], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
