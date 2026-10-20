// Gera apenas o hash para cadastro inicial/reset via cliente SQL seguro.
// A senha é lida sem eco e não é aceita como argumento de linha de comando.
import { hashPassword } from '../server/auth.ts';

if (!process.stdin.isTTY) {
  console.error('Execute em um terminal interativo: node scripts/hash-password.mjs');
  process.exit(1);
}
process.stderr.write('Senha (mínimo 12 caracteres; entrada oculta): ');
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.resume();
let password = '';
process.stdin.on('data', async chunk => {
  for (const char of chunk) {
    if (char === '\u0003') {
      process.stdin.setRawMode(false);
      process.stderr.write('\n');
      process.exit(1);
    }
    if (char === '\r' || char === '\n') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeAllListeners('data');
      process.stderr.write('\n');
      if (password.length < 12 || password.length > 1024) {
        console.error('Use entre 12 e 1024 caracteres.');
        process.exitCode = 1;
        return;
      }
      console.log(await hashPassword(password));
      password = '';
      return;
    }
    if (char === '\u007f' || char === '\b') password = Array.from(password).slice(0, -1).join('');
    else if (char >= ' ') password += char;
  }
});
