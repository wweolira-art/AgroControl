/**
 * Renomeia talhões EKOS gravados como C/A/B usando o lote do Oracle.
 * Uso: EKOS_BUSINESS_UNIT=53794 npm run corrigir:nomes-ekos
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
  'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/mapa_talhao';

const email = process.env.JACTO_CONNECT_EMAIL ?? '';
const senha = process.env.JACTO_CONNECT_PASSWORD ?? '';
const idBu = Number(process.env.EKOS_BUSINESS_UNIT ?? 53794);
const CODIGO_SETOR = /^[A-Za-z]{1,2}$/;

if (!email || !senha) {
  console.error('Defina JACTO_CONNECT_EMAIL e JACTO_CONNECT_PASSWORD');
  process.exit(1);
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
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  for (const enable of ['true', 'false']) {
    try {
      const data = await jsonFetch(`${urlBase}?enable=${enable}`, { headers });
      const lista = Array.isArray(data) ? data : (data.content ?? []);
      for (const item of lista) {
        const id = Number(item.idField ?? item.idFarm ?? item.id);
        if (Number.isFinite(id)) mapa.set(id, { ...mapa.get(id), ...item });
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
  const campoUtil = campo && !CODIGO_SETOR.test(campo) && campo.length >= 3 ? campo : '';
  if (lote > 0) return campoUtil ? `${campoUtil} — Lote ${lote}` : `Talhão ${lote}`;
  if (campoUtil) return campoUtil;
  const sec = String(row.sec_id ?? '').trim();
  if (sec) return sec;
  return `Talhão ${row.id_talhao}`;
}

function centroidGeojson(texto) {
  if (!texto?.trim()) return null;
  let geo;
  try {
    geo = JSON.parse(texto);
  } catch {
    return null;
  }
  const geometry = geo?.type === 'Feature' ? geo.geometry : geo;
  const ring =
    geometry?.type === 'Polygon'
      ? geometry.coordinates?.[0]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates?.[0]?.[0]
        : null;
  if (!ring?.length) return null;
  let lng = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return { lng: lng / ring.length, lat: lat / ring.length };
}

function dist(a, b) {
  return (a.lng - b.lng) ** 2 + (a.lat - b.lat) ** 2;
}

async function main() {
  const token = await obterTokenEkos();
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const rows = await listarOrdS(`${ORDS_MAPA.replace(/\/$/, '')}/?limit=1000`);
  const comGeo = rows.filter((r) => r.geojson || r.geometria);

  const fazendas = await listarEkos(token, `${EKOS_V2}/farms/businessunit/${idBu}`);
  const farmPorId = new Map(
    fazendas.map((f) => [Number(f.idFarm), String(f.farmName ?? f.name ?? '').trim().toLowerCase()]),
  );

  const oraclePorFazenda = new Map();
  for (const row of comGeo) {
    const centro = centroidGeojson(row.geojson ?? row.geometria);
    if (!centro) continue;
    const chave = (String(row.fazenda ?? '').trim() || `Fazenda ${row.cod_fazenda}`).toLowerCase();
    const lista = oraclePorFazenda.get(chave) ?? [];
    lista.push({ row, centro });
    oraclePorFazenda.set(chave, lista);
  }

  const fields = await listarEkos(token, `${EKOS_V2}/fields/businessunit/${idBu}`);
  const ruins = fields.filter((f) => CODIGO_SETOR.test(String(f.fieldName ?? '').trim()));
  const limite = 0.002 ** 2;
  const oracleUsados = new Set();
  let renomeados = 0;
  let ignorados = 0;

  console.log(`Talhões EKOS com nome A/B/C: ${ruins.length}`);

  for (const field of ruins) {
    const c = field.fieldAreaCentroid;
    if (c?.longitude == null || c?.latitude == null) {
      ignorados += 1;
      continue;
    }
    const centroField = { lng: Number(c.longitude), lat: Number(c.latitude) };
    const farmKey = farmPorId.get(Number(field.idFarm));
    const candidatos = farmKey ? (oraclePorFazenda.get(farmKey) ?? []) : [];
    if (candidatos.length === 0) {
      ignorados += 1;
      console.warn('Sem Oracle para fazenda', farmKey, field.fieldName);
      continue;
    }

    let melhor = null;
    for (const item of candidatos) {
      const chave = String(item.row.id_talhao);
      if (oracleUsados.has(chave)) continue;
      const d = dist(centroField, item.centro);
      if (d <= limite && (!melhor || d < melhor.d)) {
        melhor = { item, d };
      }
    }

    if (!melhor) {
      ignorados += 1;
      continue;
    }

    const nomeCorreto = nomeTalhao(melhor.item.row);
    const atual = String(field.fieldName ?? '').trim();
    if (atual === nomeCorreto) {
      ignorados += 1;
      continue;
    }

    await jsonFetch(`${EKOS_V2}/fields`, {
      method: 'PUT',
      headers: h,
      body: JSON.stringify({
        idField: field.idField,
        idFarm: field.idFarm,
        idBusinessUnit: idBu,
        fieldName: nomeCorreto,
        fieldColor: '#2E7D32',
        fieldInitValidity: field.fieldInitDateTime ?? Math.floor(Date.now() / 1000),
        fieldEnable: true,
        expirable: false,
      }),
    });
    console.log('Renomeado:', farmKey, atual, '→', nomeCorreto);
    oracleUsados.add(String(melhor.item.row.id_talhao));
    renomeados += 1;
  }

  console.log('\nResumo:', { renomeados, ignorados });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
