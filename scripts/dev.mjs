import { spawn } from 'node:child_process';

const children = [];

function run(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  children.push(child);
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

run('node', ['--watch', 'server/index.ts']);
// EXPO_OFFLINE evita o prompt de login da Expo que trava o Expo Go; o Metro continua com reload.
run('npx', ['expo', 'start', '--lan', '--go'], { EXPO_OFFLINE: '1' });
