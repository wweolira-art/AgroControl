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
const base = 'https://prd-gestaodeoperacoes.jacto.com';
const bu = 53794;
const machine = 113747;
const initDate = 20684;
const endDate = 20684;

function dayIso(day) {
  const dt = new Date(Date.UTC(1970, 0, 1));
  dt.setUTCDate(dt.getUTCDate() + Number(day));
  return dt.toISOString().slice(0, 10);
}

const initDateTime = `${dayIso(initDate)}T03:00:00`;
const endDateTime = `${dayIso(endDate)}T02:59:59`;
const q = new URLSearchParams({
  idBusinessUnit: String(bu),
  initDateTime,
  endDateTime,
  idMachineList: String(machine),
  serviceOrderNumberList: '',
  operatorNumberList: '',
});

const tries = [
  ['v1 summary', `${base}/api/v1/indicators/general/withtime/summary?${q}`],
  ['v2 summary', `${base}/api/v2/indicators/general/withtime/summary?${q}`],
  ['v3 summary', `${base}/api/v3/indicators/general/withtime/summary?${q}`],
  ['v3 indicator', `${base}/api/v3/maps/historical/withtime/indicator?${q}`],
  ['v1 indicator', `${base}/api/v1/maps/historical/withtime/indicator?${q}`],
  ['v1 monitoring machine', `${base}/api/v1/monitoring/${bu}/${machine}`],
  ['v3 monitoring machine', `${base}/api/v3/monitoring/${bu}/${machine}`],
  ['v1 timeline GET', `${base}/api/v1/data/history/businessunit/${bu}/timeline?initDate=${initDate}&endDate=${endDate}`],
];

for (const [label, url] of tries) {
  const r = await fetch(url, { headers: h });
  console.log(label, r.status, (await r.text()).slice(0, 400));
}

const timelineBody = { idBusinessUnit: bu, initDate, endDate, idMachineList: [machine] };
for (const ver of ['v1', 'v2', 'v3']) {
  const r = await fetch(`${base}/api/${ver}/data/history/businessunit/${bu}/timeline`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(timelineBody),
  });
  console.log(`${ver} timeline POST`, r.status, (await r.text()).slice(0, 500));
}

// historical model 2 - try idOperatorList, teamIds, agriculturalActivityIds from JS
const bodies = [
  { idBusinessUnit: bu, idMachineList: [machine], initDate, endDate, page: 0, size: 20 },
  { idBusinessUnit: bu, idMachine: machine, initDate, endDate, pageNumber: 0, pageSize: 20 },
  { idBusinessUnit: bu, machineIdList: [machine], initDate, endDate },
  { idBusinessUnit: bu, idMachineList: String(machine), initDate, endDate, language: 'PT' },
];
for (const body of bodies) {
  const r = await fetch(`${base}/api/v1/historical/model/2/`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(body),
  });
  console.log('model2', Object.keys(body).join(','), r.status, (await r.text()).slice(0, 250));
}
