// Copies the node's codex JSON and icons next to the compiled JavaScript, the
// part of `n8n-node build` that tsc does not do. Build-time only; not shipped.
import { cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'nodes/Strale';
for (const name of readdirSync(dir)) {
	if (name.endsWith('.json') || name.endsWith('.svg')) {
		cpSync(join(dir, name), join('dist', dir, name));
	}
}
