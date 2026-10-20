import axios from 'axios';
import { cabecalhosApiPublica } from './api-url';

import { env, urlEhRedeLocal } from '../config/env';
import { lerUrlApiSalva, mensagemSemUrlApi, obterUrlApiResolvida, salvarUrlApiPublica } from './api-url';
import { montarConnectString, ORACLE_NUVEM, parseConnectString } from '../config/oracle';

import type {

  ConexaoBancoOrds,

  OracleConfigEntrada,

  OracleConfigPublica,

  OracleConfigTeste,

} from '../types/api';



type CfgSalva = OracleConfigPublica & { senha: string };



export interface VerificacaoConexaoBanco {

  ok: boolean;

  mensagem: string;

  totalRegistros: number;

  conexaoAtiva: ConexaoBancoOrds | null;

}



const BASE = env.ordsConexaoUrl.replace(/\/$/, '');



const ords = axios.create({
  baseURL: BASE,
  timeout: 20_000,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

ords.interceptors.request.use((config) => {
  const token = env.ordsToken || env.authToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});



/** Remove marca legada #API=… de descrições antigas. */

export function limparDescricaoConexao(descricao: string): string {

  return descricao.replace(/\s*#API=\S+/gi, '').trim();

}



function padrao(): OracleConfigPublica {

  const partes = parseConnectString(env.oracleConnectString || ORACLE_NUVEM.connectString);

  return {

    usuario: env.oracleUser || ORACLE_NUVEM.usuario,

    host: partes.host,

    porta: partes.porta,

    servico: partes.servico,

    connectString: env.oracleConnectString || ORACLE_NUVEM.connectString,

    descricao: '',

    instantClientDir: '',

    useOracle: true,

    senhaDefinida: false,

    credenciaisPreenchidas: true,

    configurado: false,

  };

}



function erroOrds(erro: unknown, fallback: string): Error {

  if (axios.isAxiosError(erro)) {

    const data = erro.response?.data;

    if (data && typeof data === 'object') {

      const rec = data as Record<string, unknown>;

      const mensagem = rec.message ?? rec.title ?? rec.mensagem;

      if (typeof mensagem === 'string' && mensagem.trim() && !/^not found$/i.test(mensagem)) {

        return new Error(mensagem);

      }

    }

    if (erro.response?.status === 401 || erro.response?.status === 403) {
      return new Error(
        'A ORDS conexao_banco pediu Bearer. Defina EXPO_PUBLIC_ORDS_TOKEN (mesmo valor do curl Authorization: Bearer).',
      );
    }

    if (erro.response?.status === 404) {
      return new Error(
        `Não foi possível acessar conexao_banco (404). Verifique EXPO_PUBLIC_ORDS_CONEXAO_URL: ${BASE}/`,
      );
    }

  }

  return erro instanceof Error && !/status code 404/i.test(erro.message)

    ? erro

    : new Error(fallback);

}



function daLinha(row: ConexaoBancoOrds): CfgSalva {

  const host = String(row.host ?? '').trim();

  const porta = String(row.porta ?? 1521).trim() || '1521';

  const servico = String(row.service_name ?? '').trim();

  const usuario = String(row.usuario ?? '').trim();

  const senha = row.senha != null ? String(row.senha) : '';

  const connectString = montarConnectString(host, porta, servico);

  return {

    id: row.id != null ? Number(row.id) : undefined,

    usuario,

    host,

    porta,

    servico,

    connectString,

    descricao: limparDescricaoConexao(String(row.descricao ?? '')),

    instantClientDir: '',

    useOracle: true,

    senhaDefinida: Boolean(senha),

    credenciaisPreenchidas: Boolean(usuario && host),

    configurado: true,

    senha,

  };

}



function semSenha(cfg: CfgSalva): OracleConfigPublica {

  const { senha: _senha, ...publico } = cfg;

  return publico;

}



async function listarConexoes(): Promise<ConexaoBancoOrds[]> {

  const { data } = await ords.get<{ items?: ConexaoBancoOrds[] }>('/', { params: { limit: 50 } });

  return data.items ?? [];

}



async function buscarConexaoAtiva(): Promise<ConexaoBancoOrds | null> {
  const todas = await listarConexoes();
  const cscliente = todas
    .filter((item) => String(item.usuario ?? '').trim().toUpperCase() === 'CSCLIENTE')
    .filter((item) => Number(item.ativo ?? 1) === 1 || String(item.ativo).toUpperCase() === 'S')
    .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0];
  if (cscliente) {
    return cscliente;
  }
  try {
    const q = JSON.stringify({ ativo: { $eq: 1 } });
    const { data } = await ords.get<{ items?: ConexaoBancoOrds[] }>('/', {
      params: { q, limit: 50 },
    });
    const filtradas = (data.items ?? []).filter((item) => Number(item.ativo ?? 1) === 1);
    const semConsulta = filtradas.filter(
      (item) => String(item.usuario ?? '').trim().toUpperCase() !== 'CONSULTA',
    );
    const pool = semConsulta.length > 0 ? semConsulta : filtradas;
    if (pool.length > 0) {
      return pool.sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0];
    }
  } catch {
    /* filtro q pode falhar em alguns ORDS; lista tudo */
  }
  const ativas = todas.filter((item) => Number(item.ativo ?? 1) === 1);
  const gravacao = ativas.filter((item) => String(item.usuario ?? '').trim().toUpperCase() !== 'CONSULTA');
  const pool = gravacao.length > 0 ? gravacao : ativas;
  if (pool.length === 0) {
    return null;
  }
  return pool.sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0];
}



function montarCfg(payload: OracleConfigEntrada, anterior?: CfgSalva | null): CfgSalva {

  const connectString = (

    payload.connectString?.trim() ||

    (payload.host && payload.servico

      ? montarConnectString(payload.host, payload.porta || '1521', payload.servico)

      : '')

  ).trim();

  if (!connectString) {

    throw new Error('Informe a string de conexão (HOST:PORTA/SERVICO).');

  }

  const partes = parseConnectString(connectString);

  if (!partes.host) {

    throw new Error('Informe o host do Oracle.');

  }

  const senha = payload.senha && payload.senha.trim() !== '' ? payload.senha : anterior?.senha;

  if (!senha) {

    throw new Error('Informe a senha do Oracle.');

  }

  const usuario = payload.usuario.trim();

  if (!usuario) {

    throw new Error('Informe o usuário do Oracle.');

  }

  return {

    id: anterior?.id,

    usuario,

    host: partes.host,

    porta: partes.porta,

    servico: partes.servico,

    connectString,

    descricao: limparDescricaoConexao(payload.descricao ?? anterior?.descricao ?? 'Conexão de insumos'),

    instantClientDir: '',

    useOracle: true,

    senhaDefinida: true,

    credenciaisPreenchidas: true,

    configurado: true,

    senha,

  };

}



async function inserirConexao(cfg: CfgSalva): Promise<number> {

  const { data } = await ords.post<ConexaoBancoOrds>('/', {

    usuario: cfg.usuario,

    senha: cfg.senha,

    host: cfg.host,

    porta: Number(cfg.porta) || 1521,

    service_name: cfg.servico,

    descricao: cfg.descricao || 'Conexão de insumos',

    ativo: 1,

    data_cadastro: new Date().toISOString(),

  });

  if (data?.id != null) {

    return Number(data.id);

  }

  const gravada = await buscarConexaoAtiva();

  if (gravada?.id == null) {

    throw new Error('A API gravou a conexão, mas não devolveu o ID.');

  }

  return Number(gravada.id);

}



async function gravarOrds(cfg: CfgSalva): Promise<number> {

  const id = await inserirConexao(cfg);

  const todas = await listarConexoes();

  await Promise.all(

    todas

      .filter((row) => row.id != null && Number(row.id) !== id)

      .map((row) => ords.delete(`/${row.id}`).catch(() => undefined)),

  );

  return id;

}



async function enviarParaApiLocal(cfg: CfgSalva): Promise<void> {

  const apiBase = env.apiUrl.replace(/\/$/, '');

  if (!apiBase) {

    return;

  }

  try {

    await axios.put(

      `${apiBase}/api/oracle-config`,

      {

        usuario: cfg.usuario,

        senha: cfg.senha,

        host: cfg.host,

        porta: cfg.porta,

        servico: cfg.servico,

        connectString: cfg.connectString,

      },

      { timeout: 8_000, headers: await cabecalhosApiPublica() },

    );

  } catch {

    /* API no PC é opcional; a fonte da verdade é a ORDS conexao_banco */

  }

}



/** Confere leitura/gravação na ORDS conexao_banco (mesma URL do curl). */

export async function verificarArmazenamentoConexaoBanco(): Promise<VerificacaoConexaoBanco> {

  try {

    const todas = await listarConexoes();

    const ativa = await buscarConexaoAtiva();

    if (!ativa) {

      return {

        ok: true,

        mensagem: `ORDS OK (${BASE}/). Nenhuma conexão ativa cadastrada ainda.`,

        totalRegistros: todas.length,

        conexaoAtiva: null,

      };

    }

    const cfg = daLinha(ativa);

    return {

      ok: true,

      mensagem: `Conexão ativa id ${ativa.id}: ${cfg.usuario}@${cfg.connectString}`,

      totalRegistros: todas.length,

      conexaoAtiva: ativa,

    };

  } catch (erro) {

    throw erroOrds(erro, `Não foi possível ler ${BASE}/`);

  }

}



export async function obterConfigOracleInsumos(): Promise<OracleConfigPublica> {

  try {

    const row = await buscarConexaoAtiva();

    if (!row) {

      return padrao();

    }

    return semSenha(daLinha(row));

  } catch (erro) {

    throw erroOrds(erro, 'Não foi possível ler a API conexao_banco.');

  }

}



/** Credenciais internas para consulta. Não usar na tela do operador. */

export async function obterConexaoInterna(): Promise<CfgSalva | null> {

  const row = await buscarConexaoAtiva();

  return row ? daLinha(row) : null;

}



function urlApiDeLinhas(items: ConexaoBancoOrds[]): string | null {
  for (const item of items) {
    const url = extrairUrlApi(String(item.descricao ?? ''));
    if (url && /^https:\/\//i.test(url) && !urlEhRedeLocal(url)) {
      return url;
    }
  }
  return null;
}

/** URL da API REST: gravada no celular, .env, ou #API= em qualquer linha da conexao_banco. */
export async function obterUrlApiCustos(): Promise<string> {
  const salva = await lerUrlApiSalva();
  if (salva) {
    return salva;
  }
  try {
    const doEnv = obterUrlApiResolvida();
    if (doEnv && /^https:\/\//i.test(doEnv) && !urlEhRedeLocal(doEnv)) {
      return doEnv;
    }
  } catch {
    /* .env sem URL — tenta #API= na ORDS */
  }
  try {
    const url = urlApiDeLinhas(await listarConexoes());
    if (url) {
      await salvarUrlApiPublica(url).catch(() => undefined);
      return url;
    }
  } catch {
    /* ORDS 401 no APK (sem token) ou indisponível */
  }
  throw new Error(mensagemSemUrlApi());
}

export async function obterStatusOracleApiPc(): Promise<{
  url: string;
  consulta: { usuario: string; connectString: string };
  gravacao: { usuario: string; connectString: string; origem?: string } | null;
  ords: { ok: boolean; mensagem: string } | null;
} | null> {
  const { urlApiLanDoExpo } = await import('../config/env');
  const candidatas: string[] = [];
  try {
    candidatas.push(await obterUrlApiCustos());
  } catch {
    /* sem URL pública */
  }
  if (env.apiUrl) {
    candidatas.push(env.apiUrl.replace(/\/$/, ''));
  }
  const lan = urlApiLanDoExpo();
  if (lan) {
    candidatas.push(lan);
  }
  const vistas = new Set<string>();
  for (const url of candidatas) {
    const base = url.replace(/\/$/, '');
    if (!base || vistas.has(base)) {
      continue;
    }
    vistas.add(base);
    try {
      const { data } = await axios.get(`${base}/api/oracle-config`, {
        timeout: 8_000,
        headers: await cabecalhosApiPublica(),
      });
      return {
        url: base,
        consulta: data.consulta ?? { usuario: data.usuario ?? '', connectString: data.connectString ?? '' },
        gravacao: data.gravacao ?? null,
        ords: data.ords ?? null,
      };
    } catch {
      /* tenta a próxima URL */
    }
  }
  return null;
}



export async function salvarConfigOracleInsumos(payload: OracleConfigEntrada): Promise<OracleConfigPublica> {

  const anterior = await buscarConexaoAtiva();

  const cfg = montarCfg(payload, anterior ? daLinha(anterior) : null);

  const id = await gravarOrds(cfg);

  const salvo = { ...cfg, id, configurado: true };

  void enviarParaApiLocal(salvo);

  return semSenha(salvo);

}



export async function testarConfigOracleInsumos(payload: OracleConfigEntrada): Promise<OracleConfigTeste> {

  const cfg = await salvarConfigOracleInsumos(payload);

  const interna = await obterConexaoInterna();

  const apiBase = await obterUrlApiCustos();

  try {

    const { data } = await axios.post<OracleConfigTeste>(

      `${apiBase}/api/oracle-config/test`,

      {

        usuario: cfg.usuario,

        senha: interna?.senha,

        host: cfg.host,

        porta: cfg.porta,

        servico: cfg.servico,

        connectString: cfg.connectString,

      },

      { timeout: 25_000, headers: await cabecalhosApiPublica() },

    );

    return {

      ok: data.ok !== false,

      mensagem: data.mensagem || `Conectou em ${cfg.connectString} como ${cfg.usuario}.`,

      usuario: data.usuario ?? cfg.usuario,

    };

  } catch (erro) {

    if (axios.isAxiosError(erro) && typeof erro.response?.data?.mensagem === 'string') {

      throw new Error(String(erro.response.data.mensagem));

    }

    return {

      ok: true,

      mensagem: `Conexão gravada na ORDS conexao_banco (id ${cfg.id ?? 'novo'}): ${cfg.connectString}. API em ${apiBase}.`,

      usuario: cfg.usuario,

    };

  }

}



export async function restaurarPadraoOracle(): Promise<OracleConfigPublica> {

  return padrao();

}



/** Extrai #API=https://… da descrição gravada por npm run api:public. */

export function extrairUrlApi(descricao: string): string | null {

  const match = descricao.match(/#API=(\S+)/i);

  if (!match?.[1]) {

    return null;

  }

  const url = match[1].replace(/\/$/, '');

  return /^https?:\/\//i.test(url) ? url : null;

}



/** @deprecated Use limparDescricaoConexao. */

export function descricaoSemApi(descricao: string): string {

  return limparDescricaoConexao(descricao);

}


