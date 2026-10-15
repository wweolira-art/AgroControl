import axios from 'axios';

import {
  TIPOS_OPERACAO_ERP,
  materiaisDoRascunho,
  type ApontamentoEntrada,
  type ApontamentoGravado,
  type ApontamentoRascunho,
  type CadastrosApontamento,
} from '../types/apontamento';
import {
  carregarCadastrosLocal,
  salvarCadastrosLocal,
} from './apontamento-local';
import { cabecalhosApiPublica, mensagemErroApi } from './api-url';
import { cabecalhosOracleBanco, lerCredenciaisOracleLocal } from './oracle-credenciais-local';
import { obterUrlApiCustos } from './oracle-conexao';

function normalizarCadastros(data: Partial<CadastrosApontamento>): CadastrosApontamento {
  return {
    fazendas: Array.isArray(data.fazendas) ? data.fazendas : [],
    talhoes: Array.isArray(data.talhoes) ? data.talhoes : [],
    materiais: Array.isArray(data.materiais) ? data.materiais : [],
    operacoes: Array.isArray(data.operacoes) ? data.operacoes : [],
    funcionarios: Array.isArray(data.funcionarios) ? data.funcionarios : [],
    meiosAplicacao: Array.isArray(data.meiosAplicacao) ? data.meiosAplicacao : [],
    tiposOperacao:
      Array.isArray(data.tiposOperacao) && data.tiposOperacao.length > 0
        ? data.tiposOperacao
        : TIPOS_OPERACAO_ERP,
    importadoEm: data.importadoEm ?? new Date().toISOString(),
  };
}

function erroApi(erro: unknown, apiBase: string, fallback: string): Error {
  return mensagemErroApi(erro, apiBase, fallback);
}

async function baixarCadastrosApi(apiBase: string): Promise<CadastrosApontamento> {
  try {
    const { data } = await axios.get<Partial<CadastrosApontamento>>(`${apiBase}/api/apontamento/cadastros`, {
      timeout: 180_000,
      headers: await cabecalhosApiPublica(),
    });
    return normalizarCadastros(data);
  } catch (erro) {
    throw erroApi(erro, apiBase, 'Falha ao consultar a API.');
  }
}

async function importarCadastrosViaApi(): Promise<{ dados: CadastrosApontamento; origem: string }> {
  const apiBase = await obterUrlApiCustos();
  const dados = await baixarCadastrosApi(apiBase);
  if (dados.fazendas.length === 0 && dados.materiais.length === 0) {
    throw new Error('A API respondeu, mas veio sem cadastros.');
  }
  return { dados, origem: apiBase };
}

export interface ResultadoImportacaoCadastros {
  cadastros: CadastrosApontamento;
  origem: 'api';
  detalhe: string;
}

export async function importarCadastrosOracle(): Promise<ResultadoImportacaoCadastros> {
  const viaApi = await importarCadastrosViaApi();
  await salvarCadastrosLocal(viaApi.dados);
  return {
    cadastros: viaApi.dados,
    origem: 'api',
    detalhe: viaApi.origem,
  };
}

export async function obterCadastrosApontamento(): Promise<CadastrosApontamento | null> {
  return carregarCadastrosLocal();
}

function cadastrosOfflineUtilizaveis(dados: CadastrosApontamento | null): dados is CadastrosApontamento {
  return Boolean(
    dados &&
      (dados.fazendas.length > 0 ||
        dados.talhoes.length > 0 ||
        dados.materiais.length > 0 ||
        dados.operacoes.length > 0 ||
        (dados.funcionarios?.length ?? 0) > 0),
  );
}

/** Usa o arquivo local. Só baixa da API se ainda não houver cadastro importado. */
export async function garantirCadastrosApontamento(): Promise<CadastrosApontamento> {
  const local = await carregarCadastrosLocal();
  if (cadastrosOfflineUtilizaveis(local)) {
    return local;
  }
  try {
    const resultado = await importarCadastrosOracle();
    if (!cadastrosOfflineUtilizaveis(resultado.cadastros)) {
      throw new Error('O Oracle respondeu sem fazendas, operações ou funcionários.');
    }
    return resultado.cadastros;
  } catch (falha) {
    if (cadastrosOfflineUtilizaveis(local)) {
      return local;
    }
    const detalhe = falha instanceof Error ? falha.message : 'sem conexão';
    throw new Error(
      `Importe os cadastros com internet (tela Cadastros). Depois o lançamento funciona offline. ${detalhe}`,
    );
  }
}

async function postJson<T>(caminho: string, corpo: unknown, timeoutMs: number): Promise<T> {
  const apiBase = await obterUrlApiCustos();
  const cred = await lerCredenciaisOracleLocal();
  const payload =
    cred && corpo && typeof corpo === 'object'
      ? { ...(corpo as Record<string, unknown>), oracleUsuario: cred.usuario, oracleSenha: cred.senha }
      : corpo;
  try {
    const { data } = await axios.post<T>(`${apiBase}${caminho}`, payload, {
      timeout: timeoutMs,
      headers: { ...(await cabecalhosApiPublica()), ...(await cabecalhosOracleBanco()) },
    });
    return data;
  } catch (erro) {
    throw erroApi(erro, apiBase, 'Falha ao gravar na API.');
  }
}

export async function enviarApontamentoOracle(entrada: ApontamentoEntrada): Promise<ApontamentoGravado> {
  return postJson<ApontamentoGravado>('/api/apontamento', entrada, 60_000);
}

export function entradaOracleDoRascunho(rascunho: ApontamentoRascunho, logon?: string): ApontamentoEntrada {
  const materiais = materiaisDoRascunho(rascunho).map((item) => ({
    codMaterial: item.codMaterial,
    quantidade: item.quantidade,
    dose: item.dose,
  }));
  const primeiro = materiais[0];
  return {
    codFazenda: rascunho.codFazenda,
    codTalhao: rascunho.codTalhao,
    zona: rascunho.zona,
    codSafra: rascunho.codSafra,
    codOperacao: rascunho.codOperacao,
    tipoOperacao: rascunho.tipoOperacao,
    codFuncionario: rascunho.codFuncionario,
    codMeioaplicacao: rascunho.codMeioaplicacao,
    areaAplicada: rascunho.areaAplicada,
    codMaterial: primeiro?.codMaterial,
    dose: primeiro?.dose ?? 0,
    quantidade: primeiro?.quantidade,
    materiais,
    dataApontamento: rascunho.dataApontamento,
    logon: logon ?? 'ELEJOTAGRO',
  };
}

export { listarUrlsApiCandidatas } from './api-url';
export { carregarCadastrosLocal, salvarCadastrosLocal, resumoCadastros } from './apontamento-local';
