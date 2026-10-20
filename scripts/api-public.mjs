import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server/api-public.mjs');
const child = spawn(process.execPath, [script], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
