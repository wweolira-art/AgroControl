import axios from 'axios';

import { env } from '../config/env';
import { collectionToPayloads, type MapaTalhaoPayload } from '../maps/geojson-import';
import { rowToTalhaoFeature, type MapaTalhaoRow } from '../maps/ords-feature';
import { parseOrdsGeometry, geometryToGeoJson } from '../maps/ords-geometry';
import { featureAreaHectares } from '../maps/spatial';
import type { FeatureCollection, TalhaoFeature } from '../types/geo';

export const SQL_HABILITAR_ADMIN_MAPA = `BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE MAPA_TALHAO ADD geojson CLOB';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

CREATE OR REPLACE TRIGGER TRG_MAPA_TALHAO_GEOJSON
BEFORE INSERT OR UPDATE ON MAPA_TALHAO
FOR EACH ROW
BEGIN
  IF :NEW.geojson IS NOT NULL THEN
    :NEW.geometria := SDO_UTIL.FROM_GEOJSON(:NEW.geojson, NULL, 4326);
  END IF;
  IF :NEW.geometria IS NULL THEN
    RAISE_APPLICATION_ERROR(-20001, 'Informe o GeoJSON do talhao (campo geojson).');
  END IF;
END;
/`;

export interface MapaTalhaoAdmin {
  idTalhao: number;
  idExterno: number | null;
  codFazenda: number;
  fazenda: string;
  lote: number;
  campo: string;
  produtor: string;
  secId: string;
  geojson: string | null;
  dataCadastro: string | null;
  areaHa: number | null;
}

interface OrdsCollection {
  items?: MapaTalhaoRow[];
  hasMore?: boolean;
  links?: Array<{ rel?: string; href?: string }>;
}

const ords = axios.create({
  baseURL: env.ordsMapaTalhaoUrl.replace(/\/$/, ''),
  timeout: 60_000,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

function proximaPagina(data: OrdsCollection, atual: string): string | null {
  const next = data.links?.find((link) => link.rel === 'next')?.href;
  if (next) {
    return next;
  }
  if (data.hasMore) {
    const url = new URL(atual);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 1000);
    url.searchParams.set('offset', String(offset + limit));
    return url.toString();
  }
  return null;
}

function erroOrds(erro: unknown, fallback: string): Error {
  if (axios.isAxiosError(erro)) {
    const mensagem = erro.response?.data?.message ?? erro.response?.data?.title;
    if (typeof mensagem === 'string' && mensagem) {
      return new Error(mensagem);
    }
  }
  return erro instanceof Error ? erro : new Error(fallback);
}

function geojsonDaLinha(row: MapaTalhaoRow): string | null {
  if (typeof row.geojson === 'string' && row.geojson.trim()) {
    return row.geojson.trim();
  }
  const geometry = parseOrdsGeometry(row.geojson) ?? parseOrdsGeometry(row.geometria);
  if (!geometry) {
    return null;
  }
  return JSON.stringify(geometryToGeoJson(geometry));
}

function mapearAdmin(row: MapaTalhaoRow): MapaTalhaoAdmin | null {
  if (row.id_talhao == null) {
    return null;
  }
  const feature = rowToTalhaoFeature(row);
  return {
    idTalhao: Number(row.id_talhao),
    idExterno: row.id_externo ?? null,
    codFazenda: Number(row.cod_fazenda ?? 0),
    fazenda: String(row.fazenda ?? '').trim(),
    lote: Number(row.lote ?? 0),
    campo: String(row.campo ?? '').trim(),
    produtor: String(row.produtor ?? '').trim(),
    secId: String(row.sec_id ?? '').trim(),
    geojson: geojsonDaLinha(row),
    dataCadastro: row.data_cadastro ?? null,
    areaHa: feature ? featureAreaHectares(feature) : null,
  };
}

async function listarLinhas(): Promise<MapaTalhaoRow[]> {
  const items: MapaTalhaoRow[] = [];
  let url: string | null = `${env.ordsMapaTalhaoUrl.replace(/\/$/, '')}/?limit=1000`;
  while (url) {
    const { data } = await ords.get<OrdsCollection>(url);
    items.push(...(data.items ?? []));
    url = proximaPagina(data, url);
  }
  return items;
}

export async function listarTalhoesMapa(): Promise<FeatureCollection> {
  try {
    const features: TalhaoFeature[] = [];
    for (const row of await listarLinhas()) {
      const feature = rowToTalhaoFeature(row);
      if (feature) {
        features.push(feature);
      }
    }
    return { type: 'FeatureCollection', features };
  } catch (erro) {
    throw erroOrds(erro, 'Não foi possível ler a API mapa_talhao. Confira a internet.');
  }
}

export async function listarTalhoesAdmin(): Promise<MapaTalhaoAdmin[]> {
  try {
    return (await listarLinhas())
      .map(mapearAdmin)
      .filter((item): item is MapaTalhaoAdmin => item != null)
      .sort((a, b) => a.fazenda.localeCompare(b.fazenda, 'pt-BR') || a.lote - b.lote);
  } catch (erro) {
    throw erroOrds(erro, 'Não foi possível listar os talhões.');
  }
}

export async function apiMapaAceitaGeojson(): Promise<boolean> {
  const catalogo = env.ordsMapaTalhaoUrl.replace(/\/mapa_talhao\/?$/i, '/metadata-catalog/mapa_talhao/');
  try {
    const { data } = await ords.get<{ members?: Array<{ name?: string }> }>(catalogo);
    return (data.members ?? []).some((coluna) => String(coluna.name).toLowerCase() === 'geojson');
  } catch {
    return false;
  }
}

function csvField(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

async function batchloadTalhoes(payloads: MapaTalhaoPayload[]): Promise<void> {
  if (payloads.length === 0) {
    return;
  }
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
  ].join(',');
  const agora = new Date().toISOString();
  const linhas = payloads.map((payload) =>
    [
      payload.id_externo ?? '',
      payload.cod_fazenda,
      csvField(payload.fazenda),
      payload.lote,
      csvField(payload.campo),
      csvField(payload.produtor),
      csvField(payload.sec_id),
      csvField(payload.geojson),
      csvField(agora),
    ].join(','),
  );
  const qs = new URLSearchParams({
    batchRows: String(Math.min(25, payloads.length)),
    batchesPerCommit: '1',
    embeddedRightDouble: 'true',
    enclosures: '"',
    timestampFormat: 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"',
    timestampTZFormat: 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"',
  });
  const url = `${env.ordsMapaTalhaoUrl.replace(/\/$/, '')}/batchload?${qs.toString()}`;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: `${header}\n${linhas.join('\n')}\n`,
  });
  const texto = await resposta.text();
  if (!resposta.ok || /#ERROR|SEVERE:|in error: [1-9]/i.test(texto)) {
    throw new Error(texto.slice(0, 280) || 'Falha ao gravar o talhão na API.');
  }
}

export async function criarTalhao(payload: MapaTalhaoPayload): Promise<void> {
  try {
    await batchloadTalhoes([payload]);
  } catch (erro) {
    throw erroOrds(erro, 'Não foi possível gravar o talhão.');
  }
}

export async function atualizarTalhao(
  idTalhao: number,
  dados: {
    idExterno: number | null;
    codFazenda: number;
    fazenda: string;
    lote: number;
    campo: string;
    produtor: string;
    secId: string;
    geojson: string | null;
    dataCadastro: string | null;
  },
): Promise<void> {
  if (!dados.geojson) {
    throw new Error('Este lote não tem polígono. Desenhe a área ou importe o GeoJSON para salvar.');
  }
  const payload: MapaTalhaoPayload = {
    id_externo: dados.idExterno,
    cod_fazenda: dados.codFazenda,
    fazenda: dados.fazenda.trim(),
    lote: dados.lote,
    campo: dados.campo.trim(),
    produtor: dados.produtor.trim(),
    sec_id: dados.secId.trim() || `${dados.codFazenda}_${dados.lote}`,
    geojson: dados.geojson,
  };
  try {
    await ords.put(`/${idTalhao}`, {
      id_talhao: idTalhao,
      id_externo: payload.id_externo,
      cod_fazenda: payload.cod_fazenda,
      fazenda: payload.fazenda,
      lote: payload.lote,
      campo: payload.campo,
      produtor: payload.produtor,
      sec_id: payload.sec_id,
      geojson: payload.geojson,
      data_cadastro: dados.dataCadastro ?? new Date().toISOString(),
    });
  } catch (erro) {
    const dadosErro = axios.isAxiosError(erro) ? erro.response?.data : null;
    const codigo =
      dadosErro && typeof dadosErro === 'object'
        ? String((dadosErro as Record<string, unknown>)['o:errorCode'] ?? '')
        : '';
    if (codigo !== 'ORDS-25002') {
      throw erroOrds(erro, 'Não foi possível atualizar o talhão.');
    }
    await excluirTalhao(idTalhao);
    await batchloadTalhoes([payload]);
  }
}

export async function excluirTalhao(idTalhao: number): Promise<void> {
  try {
    await ords.delete(`/${idTalhao}`);
  } catch (erro) {
    throw erroOrds(erro, 'Não foi possível excluir o lote.');
  }
}

async function emLotes<T>(itens: T[], tamanho: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < itens.length; i += tamanho) {
    await Promise.all(itens.slice(i, i + tamanho).map(fn));
  }
}

export async function excluirTodosTalhoes(onProgresso?: (feitos: number, total: number) => void): Promise<number> {
  const linhas = await listarTalhoesAdmin();
  let feitos = 0;
  await emLotes(linhas, 4, async (item) => {
    await excluirTalhao(item.idTalhao);
    feitos += 1;
    onProgresso?.(feitos, linhas.length);
  });
  return linhas.length;
}

export async function importarTalhoes(
  features: TalhaoFeature[],
  opcoes?: { substituir?: boolean; onProgresso?: (feitos: number, total: number) => void },
): Promise<{ gravados: number; total: number }> {
  const payloads = collectionToPayloads(features);
  if (payloads.length === 0) {
    throw new Error('O GeoJSON não tem polígonos de talhão com Cod_fazend e Lote.');
  }
  const habilitada = await apiMapaAceitaGeojson();
  if (!habilitada) {
    throw new Error(
      'A API mapa_talhao ainda não tem a coluna geojson. Rode uma vez o SQL de habilitação no Database Actions e tente de novo.',
    );
  }
  if (opcoes?.substituir) {
    await excluirTodosTalhoes(opcoes.onProgresso);
  }
  let gravados = 0;
  const total = payloads.length;
  try {
    for (let i = 0; i < payloads.length; i += 20) {
      const lote = payloads.slice(i, i + 20);
      await batchloadTalhoes(lote);
      gravados += lote.length;
      opcoes?.onProgresso?.(gravados, total);
    }
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : '';
    throw new Error(`Parou em ${gravados}/${total}. ${mensagem || 'Falha ao gravar na API.'}`);
  }
  return { gravados, total };
}
