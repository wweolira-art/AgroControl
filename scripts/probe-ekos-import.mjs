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
const V2 = 'https://prd-gestaodeoperacoes.jacto.com/api/v2';
const bu = 53794;
const idFarm = 29239;
const wkt = 'SRID=4326;POLYGON((-36.072 -9.804,-36.071 -9.804,-36.071 -9.803,-36.072 -9.803,-36.072 -9.804))';
const wktPlain = 'POLYGON((-36.072 -9.804,-36.071 -9.804,-36.071 -9.803,-36.072 -9.803,-36.072 -9.804))';
const unix = Math.floor(Date.now() / 1000);
const epochDay = Math.floor(unix / 86400);

const variants = [
  { idBusinessUnit: bu, idFarm, fieldName: 'T1', fieldColor: '#2E7D32', fieldGeom: wktPlain, fieldInitValidity: unix, fieldInitDateTime: unix },
  { idBusinessUnit: bu, idFarm, fieldName: 'T2', fieldColor: '#2E7D32', fieldGeom: wkt, fieldInitValidity: unix },
  { idBusinessUnit: bu, idFarm, fieldName: 'T3', fieldColor: '#2E7D32', fieldGeom: wktPlain, fieldInitValidity: epochDay },
  { idBusinessUnit: bu, idFarm, fieldName: 'T4', fieldColor: '#2E7D32', fieldGeomWKT: wktPlain, fieldInitValidity: unix, fieldEnable: true, expirable: false },
  { idBusinessUnit: bu, idFarm, fieldName: 'T5', fieldColor: '#2E7D32', fieldGeom: wktPlain, fieldInitValidity: unix, fieldNumber: 1 },
  { idBusinessUnit: bu, idFarm, fieldName: 'T6', fieldColor: '#2E7D32', fieldGeom: wktPlain, fieldInitValidity: unix, fieldERPCode: '1' },
];

for (const body of variants) {
  const r = await fetch(`${V2}/fields?load_type=wkt`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(body.fieldName, r.status, t.slice(0, 300));
}
