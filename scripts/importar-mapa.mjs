import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin';
const MAPA = `${BASE}/mapa_talhao/`;
const filePath = fileURLToPath(new URL('../assets/maps/talhoes.json', import.meta.url));

function csvField(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function listarTodos() {
  const items = [];
  let url = `${MAPA}?limit=1000`;
  while (url) {
    const data = await (await fetch(url, { headers: { Accept: 'application/json' } })).json();
    items.push(...(data.items ?? []));
    const next = (data.links ?? []).find((link) => link.rel === 'next');
    url = next?.href ?? null;
  }
  return items;
}

async function apagarExistentes() {
  const atuais = await listarTodos();
  console.log('registros atuais:', atuais.length);
  for (const row of atuais) {
    const res = await fetch(`${MAPA}${row.id_talhao}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Falha ao apagar ${row.id_talhao}: HTTP ${res.status}`);
    }
  }
  if (atuais.length) console.log('teste/anteriores apagados');
}

function payload(feature) {
  const p = feature.properties ?? {};
  const cod = Number(p.Cod_fazend ?? p.codigo_fazenda ?? 0);
  const lote = Number(p.Lote ?? p.talhao ?? 0);
  if (!cod || !lote || !feature.geometry) return null;
  return {
    id_externo: Number.isFinite(Number(p.id)) ? Number(p.id) : '',
    cod_fazenda: cod,
    fazenda: String(p.Fazenda ?? '').trim(),
    lote,
    campo: String(p.Campo ?? '').trim(),
    produtor: String(p.Produtor ?? '').trim(),
    sec_id: String(p.sec_Id ?? p.secId ?? `${cod}_${lote}`).trim(),
    geojson: JSON.stringify({
      type: feature.geometry.type,
      coordinates: feature.geometry.coordinates,
    }),
    data_cadastro: new Date().toISOString(),
  };
}

function toCsv(batch) {
  const header = [
    'id_externo',
    'cod_fazenda',
    'fazenda',
    'lote',
    'campo',
    'produtor',
    'sec_id',
    'geojson',
    'data_cadastro',
  ];
  const lines = [header.join(',')];
  for (const row of batch) {
    lines.push(
      [
        row.id_externo,
        row.cod_fazenda,
        csvField(row.fazenda),
        row.lote,
        csvField(row.campo),
        csvField(row.produtor),
        csvField(row.sec_id),
        csvField(row.geojson),
        csvField(row.data_cadastro),
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

async function batchload(csv) {
  const qs = new URLSearchParams({
    batchRows: '25',
    batchesPerCommit: '1',
    embeddedRightDouble: 'true',
    enclosures: '"',
    timestampFormat: 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"',
    timestampTZFormat: 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"',
  });
  const res = await fetch(`${MAPA}batchload?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csv,
  });
  const text = await res.text();
  if (!res.ok || /#ERROR|SEVERE:|in error: [1-9]/i.test(text)) {
    throw new Error(text.slice(0, 800));
  }
  return text;
}

await apagarExistentes();

const collection = JSON.parse(await readFile(filePath, 'utf8'));
const rows = (collection.features ?? []).map(payload).filter(Boolean);
console.log('linhas válidas:', rows.length);

const CHUNK = 20;
for (let i = 0; i < rows.length; i += CHUNK) {
  const lote = rows.slice(i, i + CHUNK);
  await batchload(toCsv(lote));
  const gravados = Math.min(i + lote.length, rows.length);
  if (gravados % 40 === 0 || gravados === rows.length) {
    console.log(`gravados ${gravados}/${rows.length}`);
  }
}

const depois = await listarTodos();
console.log('OK. total na API:', depois.length);
