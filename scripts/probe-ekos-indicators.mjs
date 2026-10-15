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
const h = { Authorization: `Bearer ${token}` };
const V1 = 'https://prd-gestaodeoperacoes.jacto.com/api/v1';
const bu = 53794;
const machine = 113747;

function epochDay(day) {
  const dt = new Date(Date.UTC(1970, 0, 1));
  dt.setUTCDate(dt.getUTCDate() + Number(day));
  return dt.toISOString().slice(0, 10);
}

const initDate = 20684;
const endDate = 20684;
const initDateTime = `${epochDay(initDate)}T03:00:00`;
const endDateTime = `${epochDay(endDate)}T02:59:59`;

const params = new URLSearchParams({
  idBusinessUnit: String(bu),
  initDateTime,
  endDateTime,
  idMachineList: String(machine),
  serviceOrderNumberList: '',
  operatorNumberList: '',
});

async function get(label, url) {
  const r = await fetch(url, { headers: h });
  const t = await r.text();
  console.log('\n===', label, r.status, '===');
  console.log(t.slice(0, 1200));
}

await get('indicators summary', `${V1}/indicators/general/withtime/summary?${params}`);
await get('indicators detail', `${V1}/indicators/general/withtime/detail?${params}`);
await get('timeline', `${V1}/data/history/businessunit/${bu}/timeline?initDate=${initDate}&endDate=${endDate}`);
await get('monitoring machine', `${V1}/monitoring/${bu}/${machine}`);
await get('map indicator', `${V1}/maps/historical/withtime/indicator?${params}`);
await get('map indicator op type', `${V1}/maps/historical/withtime/indicator/operationtype?${params}`);
