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
const V2 = 'https://prd-gestaodeoperacoes.jacto.com/api/v2';
const bu = 53794;

const intro = await fetch('https://prd-gestaodeoperacoes.jacto.com/api/serviceorders/graphql', {
  method: 'POST',
  headers: { ...h, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `{ __type(name: "ServiceOrderModel") { fields { name type { name kind ofType { name } } } } }`,
  }),
});
console.log('ServiceOrderModel fields:', (await intro.json()).data?.__type?.fields?.map((f) => f.name).join(', '));

for (const url of [
  `${V2}/serviceorders/businessunit/${bu}`,
  `${V2}/serviceorders/businessunit/${bu}?enable=false`,
  `${V2}/fields/businessunit/${bu}`,
  `${V2}/fields/businessunit/${bu}?enable=false`,
]) {
  const resp = await fetch(url, { headers: h });
  const t = await resp.text();
  console.log('\n', url.split('.com')[1], resp.status, t.slice(0, 800));
}

const introField = await fetch('https://prd-gestaodeoperacoes.jacto.com/api/serviceorders/graphql', {
  method: 'POST',
  headers: { ...h, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `{ __type(name: "FieldModel") { fields { name } } __type2: __type(name: "AgriculturalOperationModel") { fields { name } } }`,
  }),
});
const introData = await introField.json();
console.log('\nFieldModel:', introData.data?.__type?.fields?.map((f) => f.name).join(', '));
console.log('OperationModel:', introData.data?.__type2?.fields?.map((f) => f.name).join(', '));
