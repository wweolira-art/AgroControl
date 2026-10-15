/**
 * Importação de cadastros via ORDS (funciona no celular sem depender do PC).
 * Rode scripts/habilitar-apontamento-ords.sql no Database Actions.
 */
import axios from 'axios';

import { env } from '../config/env';
import { TIPOS_OPERACAO_ERP, type CadastrosApontamento } from '../types/apontamento';

interface OrdsFeed<T> {
  items?: T[];
  hasMore?: boolean;
  links?: Array<{ rel?: string; href?: string }>;
}

type Row = Record<string, unknown>;

const ords = axios.create({
  baseURL: env.ordsApontamentoUrl.replace(/\/$/, ''),
  timeout: 120_000,
  headers: { Accept: 'application/json' },
});

function rowNum(row: Row, ...keys: string[]): number {
  for (const key of keys) {
    const val = row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()];
    const n = Number(val);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return 0;
}

function rowStr(row: Row, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()];
    if (val != null && String(val).trim()) {
      return String(val).trim();
    }
  }
  return '';
}

function proximaPagina(data: OrdsFeed<Row>, atual: string): string | null {
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

async function listarFeed(caminho: string): Promise<Row[]> {
  const base = env.ordsApontamentoUrl.replace(/\/$/, '');
  const items: Row[] = [];
  let url: string | null = `${base}${caminho}${caminho.includes('?') ? '&' : '?'}limit=1000`;

  while (url) {
    const { data } = await ords.get<OrdsFeed<Row>>(url);
    items.push(...(data.items ?? []));
    url = proximaPagina(data, url);
  }
  return items;
}

function erroOrds(erro: unknown): Error {
  if (axios.isAxiosError(erro)) {
    if (erro.response?.status === 404) {
      return new Error(
        'Módulo ORDS apontamento não encontrado. Rode scripts/habilitar-apontamento-ords.sql no Oracle ADB.',
      );
    }
    const msg = erro.response?.data?.message ?? erro.response?.data?.title;
    if (typeof msg === 'string' && msg.trim()) {
      return new Error(msg);
    }
  }
  return erro instanceof Error ? erro : new Error('Falha ao importar cadastros pela ORDS.');
}

export async function importarCadastrosOrds(): Promise<CadastrosApontamento> {
  try {
    const [fazRows, talRows, matRows, opRows, tipoRows] = await Promise.all([
      listarFeed('/fazendas/'),
      listarFeed('/talhoes/'),
      listarFeed('/materiais/'),
      listarFeed('/operacoes/'),
      listarFeed('/tipos-operacao/').catch(() => []),
    ]);

    return {
      fazendas: fazRows
        .map((row) => ({
          codFazenda: rowNum(row, 'cod_fazenda', 'codFazenda'),
          nome: rowStr(row, 'nome', 'nome_fazenda'),
        }))
        .filter((f) => f.codFazenda > 0),
      talhoes: talRows
        .map((row) => ({
          codFazenda: rowNum(row, 'cod_fazenda', 'codFazenda'),
          codTalhao: rowNum(row, 'cod_talhao', 'codTalhao'),
          zona: rowNum(row, 'zona') || 1,
          areaHa: (() => {
            const n = rowNum(row, 'area_ha', 'areaHa');
            return n > 0 ? n : null;
          })(),
          descricao: rowStr(row, 'descricao'),
          codSafra: (() => {
            const n = rowNum(row, 'cod_safra', 'codSafra');
            return n > 0 ? n : null;
          })(),
        }))
        .filter((t) => t.codFazenda > 0 && t.codTalhao > 0),
      materiais: matRows
        .map((row) => ({
          codMaterial: rowNum(row, 'cod_material', 'codMaterial'),
          descricao: rowStr(row, 'descricao'),
          codUnidade: rowStr(row, 'cod_unidade', 'codUnidade') || 'UN',
        }))
        .filter((m) => m.codMaterial > 0),
      operacoes: opRows
        .map((row) => ({
          codOperacao: rowNum(row, 'cod_operacao', 'codOperacao'),
          descricao: rowStr(row, 'descricao'),
          codObjetocusto: rowNum(row, 'cod_objetocusto', 'codObjetocusto'),
          codTipofazenda: rowNum(row, 'cod_tipofazenda', 'codTipofazenda') || 1,
          codGrupoempresa: rowNum(row, 'cod_grupoempresa', 'codGrupoempresa') || 1,
          codEmpresa: rowNum(row, 'cod_empresa', 'codEmpresa') || 1,
          codFilial: rowNum(row, 'cod_filial', 'codFilial') || 1,
        }))
        .filter((o) => o.codOperacao > 0),
      funcionarios: [],
      meiosAplicacao: [],
      tiposOperacao: (() => {
        const tipos = tipoRows
          .map((row) => ({
            tipoOperacao: rowStr(row, 'tipo_operacao', 'tipoOperacao').toUpperCase().slice(0, 1),
            descricao: rowStr(row, 'descricao'),
          }))
          .filter((t) => t.tipoOperacao && t.descricao);
        return tipos.length > 0 ? tipos : TIPOS_OPERACAO_ERP;
      })(),
      importadoEm: new Date().toISOString(),
    };
  } catch (erro) {
    throw erroOrds(erro);
  }
}
