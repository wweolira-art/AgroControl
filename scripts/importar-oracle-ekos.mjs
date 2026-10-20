/**
 * Envia talhões do Oracle (ORDS mapa_talhao) para a API EKOS.
 *
 * Uso:
 *   JACTO_CONNECT_EMAIL=... JACTO_CONNECT_PASSWORD=... npm run import:oracle-ekos
 *   EKOS_BUSINESS_UNIT=53794 npm run import:oracle-ekos
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function carregarEnv() {
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
}

carregarEnv();

const CONNECT_AUTH = 'https://prd-api-connect-elb.jacto.com/users/api/v3/auth';
const CONNECT_EKOS = 'https://prd-api-connect-elb.jacto.com/users/api/v3/me/ekos/token';
const EKOS_V2 = 'https://prd-gestaodeoperacoes.jacto.com/api/v2';
const ORDS_MAPA =
  process.env.EXPO_PUBLIC_ORDS_MAPA_TALHAO_URL ??
  process.env.ORDS_MAPA_TALHAO_URL ??
  'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/mapa_talhao';

const email = process.env.JACTO_CONNECT_EMAIL ?? '';
const senha = process.env.JACTO_CONNECT_PASSWORD ?? '';
const idBu = Number(process.env.EKOS_BUSINESS_UNIT ?? 0);

if (!email || !senha) {
  console.error('Defina JACTO_CONNECT_EMAIL e JACTO_CONNECT_PASSWORD');
  process.exit(1);
}
if (!ORDS_MAPA) {
  console.error('Defina EXPO_PUBLIC_ORDS_MAPA_TALHAO_URL');
  process.exit(1);
}

function ringParaWkt(ring) {
  const fechado =
    ring.length > 0 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const coords = fechado ? ring : [...ring, ring[0]];
  return coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
}

function geometryToWkt(geometry) {
  if (geometry.type === 'Polygon') {
    const partes = geometry.coordinates.map((ring) => `(${ringParaWkt(ring)})`);
    return `POLYGON(${partes.join(', ')})`;
  }
  if (geometry.type === 'MultiPolygon') {
    const poligonos = geometry.coordinates.map(
      (poly) => `(${poly.map((ring) => `(${ringParaWkt(ring)})`).join(', ')})`,
    );
    return `MULTIPOLYGON(${poligonos.join(', ')})`;
  }
  throw new Error(`Geometria ${geometry.type} não suportada`);
}

function parseGeojson(texto) {
  if (!texto?.trim()) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

async function jsonFetch(url, options = {}) {
  const resp = await fetch(url, options);
  const texto = await resp.text();
  let body;
  try {
    body = texto ? JSON.parse(texto) : null;
  } catch {
    body = texto;
  }
  if (!resp.ok) {
    throw new Error(`${resp.status} — ${JSON.stringify(body?.message ?? body).slice(0, 200)}`);
  }
  return body;
}

async function obterTokenEkos() {
  const auth = await jsonFetch(CONNECT_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  const raw = await jsonFetch(CONNECT_EKOS, {
    headers: { Authorization: `Bearer ${auth.access_token}` },
  });
  return String(raw).replace(/^"|"$/g, '');
}

async function listarOrdS(url) {
  const items = [];
  let next = url;
  while (next) {
    const data = await jsonFetch(next, { headers: { Accept: 'application/json' } });
    items.push(...(data.items ?? []));
    next = data.links?.find((l) => l.rel === 'next')?.href ?? null;
  }
  return items;
}

async function listarEkos(token, urlBase) {
  const mapa = new Map();
  for (const enable of ['true', 'false', '']) {
    const url = enable ? `${urlBase}?enable=${enable}` : urlBase;
    try {
      const data = await jsonFetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const lista = Array.isArray(data) ? data : (data.content ?? []);
      for (const item of lista) {
        const id = Number(item.idFarm ?? item.idField ?? item.id);
        if (Number.isFinite(id)) mapa.set(id, item);
      }
    } catch {
      // ignora
    }
  }
  return [...mapa.values()];
}

function nomeTalhao(row) {
  const lote = Number(row.lote ?? 0);
  const campo = String(row.campo ?? '').trim();
  const codigoSetor = /^[A-Za-z]{1,2}$/;
  const campoUtil = campo && !codigoSetor.test(campo) && campo.length >= 3 ? campo : '';
  if (lote > 0) {
    return campoUtil ? `${campoUtil} — Lote ${lote}` : `Talhão ${lote}`;
  }
  if (campoUtil) return campoUtil;
  const sec = String(row.sec_id ?? '').trim();
  if (sec) return sec;
  return `Talhão ${row.id_talhao}`;
}

async function main() {
  const token = await obterTokenEkos();
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  let businessUnit = idBu;
  if (!businessUnit) {
    const unidades = await listarEkos(token, `${EKOS_V2}/businessunits/`);
    businessUnit = Number(unidades[0]?.idBusinessUnit);
  }
  if (!businessUnit) {
    console.error('Nenhuma unidade EKOS. Defina EKOS_BUSINESS_UNIT.');
    process.exit(1);
  }
  console.log('Unidade EKOS:', businessUnit);

  const rows = await listarOrdS(`${ORDS_MAPA.replace(/\/$/, '')}/?limit=1000`);
  const comGeo = rows.filter((r) => r.geojson || r.geometria);
  console.log(`Oracle: ${rows.length} talhões, ${comGeo.length} com geometria`);

  const fazendasEkos = await listarEkos(token, `${EKOS_V2}/farms/businessunit/${businessUnit}`);
  const mapaFazenda = new Map(
    fazendasEkos.map((f) => [String(f.farmName ?? f.name ?? '').trim().toLowerCase(), Number(f.idFarm)]),
  );

  const talhoesEkos = await listarEkos(token, `${EKOS_V2}/fields/businessunit/${businessUnit}`);
  const nomesExistentes = new Set(
    talhoesEkos.map((t) => `${Number(t.idFarm)}:${String(t.fieldName ?? t.name ?? '').trim().toLowerCase()}`),
  );

  let fazendasCriadas = 0;
  let talhoesCriados = 0;
  let ignorados = 0;

  const inicioDia = Math.floor(new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000);

  for (const row of comGeo) {
    const nomeFazenda = String(row.fazenda ?? '').trim() || `Fazenda ${row.cod_fazenda}`;
    let idFarm = mapaFazenda.get(nomeFazenda.toLowerCase());
    if (!idFarm) {
      const criada = await jsonFetch(`${EKOS_V2}/farms`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ idBusinessUnit: businessUnit, farmName: nomeFazenda, farmEnable: true }),
      });
      idFarm = criada.idFarm;
      mapaFazenda.set(nomeFazenda.toLowerCase(), idFarm);
      fazendasCriadas += 1;
      console.log('Fazenda criada:', nomeFazenda, idFarm);
    }

    const nome = nomeTalhao(row);
    const chaveTalhao = `${idFarm}:${nome.toLowerCase()}`;
    if (nomesExistentes.has(chaveTalhao)) {
      ignorados += 1;
      continue;
    }

    const geo = parseGeojson(row.geojson) ?? parseGeojson(row.geometria);
    const geometry = geo?.type === 'Feature' ? geo.geometry : geo;
    if (!geometry) {
      console.warn('Geometria inválida:', nomeFazenda, nome);
      ignorados += 1;
      continue;
    }

    const wkt = geometryToWkt(geometry);
    await jsonFetch(`${EKOS_V2}/fields?load_type=wkt`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        idBusinessUnit: businessUnit,
        idFarm,
        fieldName: nome,
        fieldColor: '#2E7D32',
        fieldGeomWKT: wkt,
        fieldInitValidity: inicioDia,
        fieldEnable: true,
        expirable: false,
      }),
    });
    nomesExistentes.add(chaveTalhao);
    talhoesCriados += 1;
    console.log('Talhão criado:', nomeFazenda, '/', nome);
  }

  console.log('\nResumo:', { fazendasCriadas, talhoesCriados, ignorados });
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
