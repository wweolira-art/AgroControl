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
const V2 = 'https://prd-gestaodeoperacoes.jacto.com/api/v2';
const bu = 53794;
const machine = 113747;

async function probe(label, url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, headers: { ...h, ...opts.headers } });
    const t = await r.text();
    let body;
    try {
      body = JSON.parse(t);
    } catch {
      body = t.slice(0, 120);
    }
    const n = Array.isArray(body)
      ? body.length
      : (body?.content?.length ?? body?.items?.length ?? body?.edges?.length ?? null);
    const sample = Array.isArray(body) ? body[0] : body?.content?.[0] ?? body?.items?.[0] ?? body;
    console.log(
      JSON.stringify({
        label,
        status: r.status,
        count: n,
        keys: sample && typeof sample === 'object' ? Object.keys(sample).slice(0, 15) : null,
      }),
    );
    return body;
  } catch (e) {
    console.log(JSON.stringify({ label, error: e.message }));
    return null;
  }
}

const urls = [
  ['unidades all', `${V2}/businessunits/?enable=false`],
  ['operacoes all', `${V2}/agriculturaloperations/businessunit/${bu}?enable=false`],
  ['atividades all', `${V2}/agriculturalactivities/businessunit/${bu}?enable=false`],
  ['fazendas', `${V2}/farms/businessunit/${bu}`],
  ['talhoes', `${V2}/fields/businessunit/${bu}?enable=false`],
  ['operadores', `${V2}/operators/businessunit/${bu}`],
  ['equipes', `${V2}/teams/businessunit/${bu}`],
  ['implementos', `${V2}/implements/businessunit/${bu}`],
  ['produtos', `${V2}/products/businessunit/${bu}`],
  ['insumos', `${V2}/inputs/businessunit/${bu}`],
  ['alertas', `${V2}/alerts/businessunit/${bu}`],
  ['prescricoes', `${V2}/prescriptions/businessunit/${bu}`],
  ['ordens v2', `${V2}/serviceorders/businessunit/${bu}`],
  ['monitoramento', `${V1}/maps/monitoring?idBusinessUnit=${bu}`],
  ['periodos', `${V1}/maps/filter/historical/period?idBusinessUnit=${bu}`],
  ['prefs unidade', `${V2}/businessunits/${bu}`],
  ['maquina det', `${V2}/machines/${machine}`],
  ['cliente 52078', `${V2}/clients/52078`],
  ['cliente 52079', `${V2}/clients/52079`],
];

for (const [label, url] of urls) {
  await probe(label, url);
}

// historical telemetry POST - try common param names
const period = { initDate: 20682, endDate: 20684 };
const bodies = [
  { idBusinessUnit: bu, idMachine: machine, ...period },
  { idBusinessUnit: bu, idMachineList: [machine], ...period },
  { idBusinessUnit: bu, idMachineList: String(machine), ...period },
  { idBusinessUnit: bu, idMachine: machine, initDateTime: '2026-08-17T00:00:00', endDateTime: '2026-08-19T23:59:59' },
];

for (const body of bodies) {
  const r = await fetch(`${V1}/historical/model/2/`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  console.log(
    JSON.stringify({
      label: 'historical POST',
      bodyKeys: Object.keys(body),
      status: r.status,
      preview: t.slice(0, 200),
    }),
  );
}

// map indicators with timezone from business unit prefs
const unidade = await probe('unidade full', `${V2}/businessunits/${bu}`);
const tz = unidade?.timezoneOffsetBusinessUnit ?? -3;
const init = '2026-08-19T00:00:00';
const end = '2026-08-19T23:59:59';
const q = new URLSearchParams({
  idBusinessUnit: String(bu),
  initDateTime: init,
  endDateTime: end,
  idMachineList: String(machine),
  serviceOrderNumberList: '',
  operatorNumberList: '',
  idFieldList: '',
});
for (const path of [
  'maps/historical/withtime/indicator/operation_type',
  'maps/historical/indicator/operation_type',
  'maps/historical/withtime/popup',
  'maps/historical/popup',
  'maps/historical/withtime/boundingbox',
]) {
  await probe(path, `${V1}/${path}?${q}`);
}

const popupUrl = `${V1}/maps/historical/popup?idBusinessUnit=${bu}&initDate=20684&endDate=20684&idMachine=${machine}`;
const popup = await fetch(popupUrl, { headers: h });
console.log(JSON.stringify({ label: 'popup epoch', status: popup.status, body: (await popup.text()).slice(0, 400) }));

const gql = 'https://prd-gestaodeoperacoes.jacto.com/api/serviceorders/graphql';
const gqlQueries = [
  '{ __schema { queryType { fields { name } } } }',
  'query($id:BigInteger!){ serviceOrderListByBusinessUnit(idBusinessUnit:$id){ edges { node { idServiceOrder number date } } } }',
];
for (const query of gqlQueries) {
  const r = await fetch(gql, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { id: bu } }),
  });
  const t = await r.text();
  console.log(JSON.stringify({ label: 'graphql', query: query.slice(0, 60), status: r.status, preview: t.slice(0, 500) }));
}

const clients = await fetch(`${V2}/clients`, { headers: h }).then((r) => r.json());
for (const c of clients) {
  const unitsRaw = await fetch(`${V2}/businessunits/?idClient=${c.idClient}&enable=false`, { headers: h }).then((r) => r.json());
  const list = Array.isArray(unitsRaw) ? unitsRaw : unitsRaw.content ?? [];
  console.log(JSON.stringify({ label: 'client units', client: c.clientName, id: c.idClient, units: list.length }));
}
