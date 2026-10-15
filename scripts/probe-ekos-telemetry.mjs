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
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
const base = 'https://prd-gestaodeoperacoes.jacto.com';
const bu = 53794;
const machine = 113747;

function dayIso(day) {
  const dt = new Date(Date.UTC(1970, 0, 1));
  dt.setUTCDate(dt.getUTCDate() + Number(day));
  return dt.toISOString().slice(0, 10);
}

const initDateTime = `${dayIso(20684)}T03:00:00`;
const endDateTime = `${dayIso(20684)}T02:59:59`;

async function post(label, url, body, extra = {}) {
  const r = await fetch(url, { method: 'POST', headers: { ...h, ...extra.headers }, body: JSON.stringify(body), ...extra });
  const t = await r.text();
  console.log('\n===', label, r.status, '===');
  console.log(t.slice(0, 1500));
}

for (const dateTime of [20684, 20682, 20656, 20547, 20329]) {
  await post(`telemetry day ${dateTime}`, `${base}/api/v1/historical/model/2/`, {
    idBusinessUnit: bu,
    idMachine: machine,
    serviceOrderNumberList: [],
    dateTime,
  });
}

await post('reports general', `${base}/api/v3/reports/general/businessunit/${bu}`, { initDate: 20682, endDate: 20684 });
await post('reports general withtime', `${base}/api/v3/reports/general/withtime/businessunit/${bu}`, {
  idBusinessUnit: bu,
  initDateTime,
  endDateTime,
  idMachineList: [machine],
  serviceOrderNumberList: [],
  operatorNumberList: [],
});
await post('alert administrative', `${base}/api/v3/alert/administrative`, {
  idBusinessUnit: bu,
  initDateTime,
  endDateTime,
  serviceOrderNumberList: [],
});
await post('alarm', `${base}/api/v3/alarm`, {
  idBusinessUnit: bu,
  initDateTime,
  endDateTime,
  serviceOrderNumberList: [],
}, { headers: { ...h },  });

await fetch(`${base}/api/v1/tasks/businessunit/${bu}`, { headers: h }).then(async (r) => {
  console.log('\n=== tasks GET', r.status, '===');
  console.log((await r.text()).slice(0, 800));
});

await fetch(`${base}/api/v1/export/data/processed/businessunit/${bu}`, { headers: h }).then(async (r) => {
  console.log('\n=== export processed GET', r.status, '===');
  console.log((await r.text()).slice(0, 800));
});

const q = new URLSearchParams({
  idBusinessUnit: String(bu),
  initDateTime,
  endDateTime,
  idMachineList: String(machine),
  serviceOrderNumberList: '',
  operatorNumberList: '',
});
await fetch(`${base}/api/v1/indicators/general/withtime/summary?${q}`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
}).then(async (r) => {
  console.log('\n=== indicators summary Accept json', r.status, '===');
  console.log((await r.text()).slice(0, 800));
});
