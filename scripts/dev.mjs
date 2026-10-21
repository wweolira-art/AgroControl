import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let expoCli;
try {
  expoCli = require.resolve('expo/bin/cli');
} catch {
  console.error('Dependências ausentes. Execute npm ci antes de npm run dev.');
  process.exit(1);
}

const children = [];

function run(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...extraEnv },
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(`Falha ao iniciar ${command}: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (code && code !== 0) {
      stop(code);
    }
  });
}

function stop(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

run(process.execPath, ['--watch', 'server/index.ts']);
// EXPO_OFFLINE evita o prompt de login da Expo que trava o Expo Go; o Metro continua com reload.
run(process.execPath, [expoCli, 'start', '--lan', '--go'], { EXPO_OFFLINE: '1' });
