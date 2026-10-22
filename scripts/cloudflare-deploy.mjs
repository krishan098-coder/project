import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
for (const args of [
  ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', 'wrangler.cloudflare.json'],
  ['deploy', '--config', 'dist/server/wrangler.json']
]) {
  const result = spawnSync(process.execPath, [wrangler, ...args], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
