import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const arquivo of [path.join(ROOT, '.env'), path.join(ROOT, 'server', '.env')]) {
  if (!fs.existsSync(arquivo)) continue;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) continue;
    const sep = texto.indexOf('=');
    if (sep <= 0) continue;
    const chave = texto.slice(0, sep).trim();
    if (!process.env[chave]) process.env[chave] = texto.slice(sep + 1).trim();
  }
}

const email = process.env.JACTO_CONNECT_EMAIL ?? '';
const senha = process.env.JACTO_CONNECT_PASSWORD ?? '';

if (!email || !senha) throw new Error('Defina JACTO_CONNECT_EMAIL e JACTO_CONNECT_PASSWORD no ambiente.');
const auth = await fetch('https://prd-api-connect-elb.jacto.com/users/api/v3/auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: senha }),
}).then((r) => r.json());
const raw = await fetch('https://prd-api-connect-elb.jacto.com/users/api/v3/me/ekos/token', {
  headers: { Authorization: `Bearer ${auth.access_token}` },
}).then((r) => r.text());
const token = raw.replace(/^"|"$/g, '');
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const V1 = 'https://prd-gestaodeoperacoes.jacto.com/api/v1';
const bu = 53794;
const machine = 113747;

async function tryGet(label, url) {
  const r = await fetch(url, { headers: h });
  const t = await r.text();
  console.log(label, r.status, t.slice(0, 600));
}

await tryGet('indicators grouped', `${V1}/indicators/grouped/businessunit/${bu}`);
await tryGet('indicators grouped period', `${V1}/indicators/grouped/businessunit/${bu}?initDate=20684&endDate=20684`);
await tryGet('subtitle', `${V1}/maps/historical/subtitle?idBusinessUnit=${bu}&initDate=20684&endDate=20684&idMachineList=${machine}`);
await tryGet('layer list', `${V1}/maps/historical/layer?idBusinessUnit=${bu}&initDate=20684&endDate=20684&idMachineList=${machine}`);

for (const model of [2, 3, 4]) {
  const body = JSON.stringify({ idBusinessUnit: bu, idMachineList: [machine], initDate: 20682, endDate: 20684 });
  const r = await fetch(`${V1}/historical/model/${model}/`, { method: 'POST', headers: h, body });
  console.log(`model/${model} POST`, r.status, (await r.text()).slice(0, 400));
}
