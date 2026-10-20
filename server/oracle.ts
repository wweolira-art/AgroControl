/**
 * =============================================================================
 * CONEXÃO ORACLE
 * =============================================================================
 *
 * CONSULTA (server/.env ORACLE_USER) = SELECT
 * CSCLIENTE (ORDS conexao_banco)     = INSERT/UPDATE
 * =============================================================================
 */

export const ORACLE_CONEXAO = {
  user: 'SEU_USUARIO',
  password: 'SUA_SENHA',
  /**
   * Formato Easy Connect:
   *   HOST:PORTA/SERVICE_NAME
   * Exemplos:
   *   192.168.0.10:1521/ORCL
   *   192.168.0.10:1521/XEPDB1
   *   servidor.empresa.local:1521/agricola
   */
  connectString: '0.tcp.sa.ngrok.io:10057/csorcl',
  instantClientDir:
    'C:\\Users\\rayhiran\\Desktop\\Softwares\\PlanejamentoAgricola\\instantclient-basic-windows.x64-23.26.1.0.0\\instantclient_23_0',
};

/**
 * Ajuste os nomes das colunas se o schema real for diferente.
 */
export const ORACLE_SCHEMA = {
  fazenda: 'agricola.fazenda',
  talhao: 'agricola.talhao',
  colCodigoFazenda: 'codigo',
  colNomeFazenda: 'nome',
  colCodigoTalhao: 'codigo',
  colFkFazendaNoTalhao: 'cd_fazenda',
  colGeometriaTalhao: 'geometria',
};

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

const requireOracle = createRequire(import.meta.url);

let envCarregado = false;

function carregarEnvOracle() {
  if (envCarregado) {
    return;
  }
  envCarregado = true;
  const arquivo = path.join(SERVER_DIR, '.env');
  if (!fs.existsSync(arquivo)) {
    return;
  }
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) {
      continue;
    }
    const separador = texto.indexOf('=');
    if (separador <= 0) {
      continue;
    }
    const chave = texto.slice(0, separador).trim();
    const valor = texto.slice(separador + 1).trim();
    if (!process.env[chave]) {
      process.env[chave] = valor;
    }
  }
}

type OracleConnection = {
  execute: (
    sql: string,
    binds?: Record<string, unknown>,
    options?: { outFormat?: number; fetchArraySize?: number; autoCommit?: boolean },
  ) => Promise<{ rows?: Record<string, unknown>[]; outBinds?: Record<string, unknown> }>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  close: () => Promise<void>;
};

type OracleModule = {
  initOracleClient: (opts: { libDir: string }) => void;
  getConnection: (cfg: { user: string; password: string; connectString: string }) => Promise<OracleConnection>;
  OUT_FORMAT_OBJECT: number;
  BIND_OUT: unknown;
  NUMBER: unknown;
};

let clientInicializado = false;
let oracledb: OracleModule | null = null;

type ConfigOracleRuntime = {
  user: string;
  password: string;
  connectString: string;
  instantClientDir: string;
  useOracle: boolean;
};

let configRuntime: Partial<ConfigOracleRuntime> | null = null;
let configGravacao: Partial<ConfigOracleRuntime> | null = null;

const ORDS_CONEXAO_BANCO_URL = (
  process.env.ORDS_CONEXAO_BANCO_URL ??
  process.env.EXPO_PUBLIC_ORDS_CONEXAO_URL ??
  'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/conexao_banco'
).replace(/\/$/, '');

type ConexaoBancoOrds = {
  id?: number;
  usuario?: string;
  senha?: string;
  host?: string;
  porta?: number | string;
  service_name?: string;
  ativo?: number | string;
};

function usuarioLinha(row: ConexaoBancoOrds): string {
  return String(row.usuario ?? '').trim();
}

function linhaEhCscliente(row: ConexaoBancoOrds): boolean {
  return usuarioLinha(row).toUpperCase() === 'CSCLIENTE';
}

function linhaEhConsulta(row: ConexaoBancoOrds): boolean {
  return usuarioLinha(row).toUpperCase() === 'CONSULTA';
}

function linhaAtiva(row: ConexaoBancoOrds): boolean {
  const ativo = row.ativo;
  if (ativo == null || ativo === '') {
    return true;
  }
  if (typeof ativo === 'string') {
    const t = ativo.trim().toUpperCase();
    return t === '1' || t === 'S' || t === 'Y' || t === 'TRUE';
  }
  return Number(ativo) === 1;
}

function escolherLinhaGravacao(items: ConexaoBancoOrds[]): ConexaoBancoOrds | null {
  const comDados = items.filter((item) => usuarioLinha(item) && String(item.host ?? '').trim());
  const ativas = comDados.filter(linhaAtiva);
  const pool = ativas.length > 0 ? ativas : comDados;
  const cscliente = pool
    .filter(linhaEhCscliente)
    .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0];
  if (cscliente) {
    return cscliente;
  }
  const outra = pool
    .filter((item) => !linhaEhConsulta(item))
    .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0];
  return outra ?? null;
}

let ordsSincronizadoEm = 0;
const ORDS_TTL_MS = 15_000;
let ordsGravacaoStatus: { ok: boolean; httpStatus: number | null; mensagem: string } = {
  ok: false,
  httpStatus: null,
  mensagem: 'Ainda não consultou a ORDS conexao_banco.',
};

let bearerOrdsCache: { token: string; expiraEm: number } | null = null;

function urlOauthOrds(): string {
  const explicito = valorEnv('ORDS_OAUTH_URL', '').replace(/\/$/, '');
  if (explicito) {
    return explicito;
  }
  return ORDS_CONEXAO_BANCO_URL.replace(/\/conexao_banco\/?$/i, '/oauth/token');
}

async function obterBearerOrds(): Promise<string | null> {
  carregarEnvOracle();
  const tokenDireto = (
    process.env.ORDS_TOKEN ??
    process.env.ORDS_BEARER_TOKEN ??
    process.env.EXPO_PUBLIC_ORDS_TOKEN ??
    process.env.EXPO_PUBLIC_API_TOKEN ??
    ''
  ).trim();
  if (tokenDireto) {
    return tokenDireto;
  }
  if (bearerOrdsCache && Date.now() < bearerOrdsCache.expiraEm) {
    return bearerOrdsCache.token;
  }
  const clientId = (process.env.ORDS_CLIENT_ID ?? process.env.ORDS_USER ?? '').trim();
  const clientSecret = process.env.ORDS_CLIENT_SECRET ?? process.env.ORDS_PASSWORD ?? '';
  if (!clientId || !clientSecret) {
    return null;
  }
  try {
    const resposta = await fetch(urlOauthOrds(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });
    if (!resposta.ok) {
      return null;
    }
    const data = (await resposta.json()) as { access_token?: string; expires_in?: number };
    const token = String(data.access_token ?? '').trim();
    if (!token) {
      return null;
    }
    const segundos = Number(data.expires_in);
    bearerOrdsCache = {
      token,
      expiraEm: Date.now() + Math.max(30, Number.isFinite(segundos) ? segundos - 30 : 300) * 1000,
    };
    return token;
  } catch {
    return null;
  }
}

async function cabecalhosOrds(): Promise<Record<string, string>> {
  carregarEnvOracle();
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const bearer = await obterBearerOrds();
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
    return headers;
  }
  const user = (process.env.ORDS_USER ?? '').trim();
  const password = process.env.ORDS_PASSWORD ?? '';
  if (user && password) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }
  return headers;
}

export async function sincronizarConexaoBancoOrds(): Promise<void> {
  carregarEnvOracle();
  if (Date.now() - ordsSincronizadoEm < ORDS_TTL_MS && configGravacao?.user && configGravacao?.password) {
    return;
  }
  try {
    const resposta = await fetch(`${ORDS_CONEXAO_BANCO_URL}/?limit=100`, {
      headers: await cabecalhosOrds(),
    });
    if (!resposta.ok) {
      ordsGravacaoStatus = {
        ok: false,
        httpStatus: resposta.status,
        mensagem:
          resposta.status === 401 || resposta.status === 403
            ? 'ORDS conexao_banco recusou o acesso (401/403). Confira ORDS_USER/ORDS_PASSWORD no server/.env.'
            : `ORDS conexao_banco HTTP ${resposta.status}.`,
      };
      return;
    }
    const data = (await resposta.json()) as { items?: ConexaoBancoOrds[] };
    const row = escolherLinhaGravacao(data.items ?? []);
    if (!row) {
      ordsGravacaoStatus = {
        ok: false,
        httpStatus: resposta.status,
        mensagem: 'Usuário de gravação (CSCLIENTE) não encontrado na ORDS conexao_banco.',
      };
      return;
    }
    const instantClientDir = resolverInstantClientDir(configRuntime?.instantClientDir);
    const connectString = montarConnectString(String(row.host), String(row.porta ?? 1521), String(row.service_name ?? ''));
    configGravacao = {
      user: String(row.usuario),
      password: String(row.senha ?? ''),
      connectString,
      instantClientDir,
      useOracle: true,
    };
    ordsSincronizadoEm = Date.now();
    ordsGravacaoStatus = {
      ok: true,
      httpStatus: resposta.status,
      mensagem: `Gravação ORDS: ${row.usuario}@${connectString}`,
    };
  } catch (erro) {
    ordsGravacaoStatus = {
      ok: false,
      httpStatus: null,
      mensagem: erro instanceof Error ? erro.message : 'Falha ao ler ORDS conexao_banco.',
    };
    /* mantém CONSULTA do server/.env para SELECT; INSERT só com CSCLIENTE */
  }
}

function valorEnv(chave: string, fallback: string): string {
  return process.env[chave] && process.env[chave] !== '' ? process.env[chave] : fallback;
}

const CANDIDATOS_INSTANT_CLIENT = [
  'C:\\Users\\rayhiran\\Desktop\\Softwares\\PlanejamentoAgricola\\instantclient-basic-windows.x64-23.26.1.0.0\\instantclient_23_0',
  'C:\\Users\\rayhiran\\Desktop\\Softwares\\Grupomaterial\\instantclient-basic-windows.x64-23.26.0.0.0\\instantclient_23_0',
  'C:\\instantclient-basic-windows.x64-23.26.1.0.0\\instantclient_23_0',
  'C:\\instantclient_23_0',
];

function pastaTemOci(dir: string): boolean {
  return Boolean(dir) && fs.existsSync(path.join(dir, 'oci.dll'));
}

function resolverInstantClientDir(preferido?: string): string {
  const tentativas = [
    preferido?.trim() ?? '',
    valorEnv('ORACLE_INSTANT_CLIENT', ''),
    ORACLE_CONEXAO.instantClientDir,
    ...CANDIDATOS_INSTANT_CLIENT,
  ];
  for (const dir of tentativas) {
    if (dir && pastaTemOci(dir)) {
      return dir;
    }
  }
  return preferido?.trim() || valorEnv('ORACLE_INSTANT_CLIENT', ORACLE_CONEXAO.instantClientDir);
}

export function obterConfigOracle() {
  carregarEnvOracle();
  return {
    user: configRuntime?.user ?? valorEnv('ORACLE_USER', ORACLE_CONEXAO.user),
    password: configRuntime?.password ?? valorEnv('ORACLE_PASSWORD', ORACLE_CONEXAO.password),
    connectString: configRuntime?.connectString ?? valorEnv('ORACLE_CONNECT_STRING', ORACLE_CONEXAO.connectString),
    instantClientDir: resolverInstantClientDir(configRuntime?.instantClientDir),
  };
}

/** Leitura: sempre CONSULTA do server/.env. A ORDS (CSCLIENTE) não sobrescreve isto. */
export function obterConfigConsulta() {
  carregarEnvOracle();
  return {
    user: valorEnv('ORACLE_USER', ORACLE_CONEXAO.user),
    password: valorEnv('ORACLE_PASSWORD', ORACLE_CONEXAO.password),
    connectString: valorEnv('ORACLE_CONNECT_STRING', ORACLE_CONEXAO.connectString),
    instantClientDir: resolverInstantClientDir(configRuntime?.instantClientDir),
  };
}

function obterConfigGravacaoDoEnv() {
  const user = valorEnv('ORACLE_GRAVACAO_USER', '').trim();
  const password = valorEnv('ORACLE_GRAVACAO_PASSWORD', '');
  const connectString =
    valorEnv('ORACLE_GRAVACAO_CONNECT_STRING', '') || valorEnv('ORACLE_CONNECT_STRING', ORACLE_CONEXAO.connectString);
  if (!user || !password || user === 'SEU_USUARIO' || password === 'SUA_SENHA') {
    return null;
  }
  return {
    user,
    password,
    connectString,
    instantClientDir: resolverInstantClientDir(),
  };
}

/** Gravação: .env primeiro; ORDS se autenticar (ORDS_USER/PASSWORD). */
export function obterConfigGravacao() {
  carregarEnvOracle();
  const doEnv = obterConfigGravacaoDoEnv();
  if (doEnv) {
    return doEnv;
  }
  if (configGravacao?.user && configGravacao?.password && configGravacao.connectString) {
    return {
      user: configGravacao.user,
      password: configGravacao.password,
      connectString: configGravacao.connectString,
      instantClientDir: resolverInstantClientDir(configGravacao.instantClientDir),
    };
  }
  return null;
}

export function oracleUseOracle(): boolean {
  carregarEnvOracle();
  if (configRuntime?.useOracle != null) {
    return configRuntime.useOracle;
  }
  return process.env.USE_ORACLE === 'true';
}

export function oracleCredenciaisPreenchidas(): boolean {
  carregarEnvOracle();
  const cfg = obterConfigOracle();
  return (
    cfg.user !== 'SEU_USUARIO' &&
    cfg.password !== 'SUA_SENHA' &&
    cfg.password !== '' &&
    !cfg.connectString.includes('HOST:1521') &&
    cfg.connectString.trim() !== ''
  );
}

export function oracleConfigurado(): boolean {
  return oracleCredenciaisPreenchidas() && oracleUseOracle();
}

export function parseConnectString(connectString: string): { host: string; porta: string; servico: string } {
  const limpo = connectString.trim().replace(/^\/\//, '');
  const slash = limpo.indexOf('/');
  const servico = slash >= 0 ? limpo.slice(slash + 1).trim() : '';
  const hostPort = (slash >= 0 ? limpo.slice(0, slash) : limpo).trim();
  const ultimoDoisPontos = hostPort.lastIndexOf(':');
  if (ultimoDoisPontos > 0) {
    return {
      host: hostPort.slice(0, ultimoDoisPontos).trim(),
      porta: hostPort.slice(ultimoDoisPontos + 1).trim() || '1521',
      servico,
    };
  }
  return { host: hostPort, porta: '1521', servico };
}

export function montarConnectString(host: string, porta: string, servico: string): string {
  const portaOk = porta.trim() || '1521';
  return `${host.trim()}:${portaOk}/${servico.trim()}`;
}

export type OracleConfigPublica = {
  usuario: string;
  host: string;
  porta: string;
  servico: string;
  connectString: string;
  instantClientDir: string;
  useOracle: boolean;
  senhaDefinida: boolean;
  credenciaisPreenchidas: boolean;
  configurado: boolean;
  consulta: { usuario: string; connectString: string };
  gravacao: { usuario: string; connectString: string; origem: 'env' | 'ords' } | null;
  ords: { ok: boolean; httpStatus: number | null; mensagem: string };
};

export function obterConfigPublicaOracle(): OracleConfigPublica {
  const consulta = obterConfigConsulta();
  const doEnv = obterConfigGravacaoDoEnv();
  const gravacao = obterConfigGravacao();
  const partes = parseConnectString(consulta.connectString);
  return {
    usuario: consulta.user === 'SEU_USUARIO' ? '' : consulta.user,
    host: partes.host.includes('HOST') ? '' : partes.host,
    porta: partes.porta,
    servico: partes.servico === 'SERVICE_NAME' ? '' : partes.servico,
    connectString: consulta.connectString.includes('HOST:1521') ? '' : consulta.connectString,
    instantClientDir: consulta.instantClientDir,
    useOracle: oracleUseOracle(),
    senhaDefinida: consulta.password !== '' && consulta.password !== 'SUA_SENHA',
    credenciaisPreenchidas: oracleCredenciaisPreenchidas(),
    configurado: oracleConfigurado(),
    consulta: {
      usuario: consulta.user === 'SEU_USUARIO' ? '' : consulta.user,
      connectString: consulta.connectString.includes('HOST:1521') ? '' : consulta.connectString,
    },
    gravacao: gravacao
      ? {
          usuario: gravacao.user,
          connectString: gravacao.connectString,
          origem: doEnv ? 'env' : 'ords',
        }
      : null,
    ords: ordsGravacaoStatus,
  };
}

function arquivoEnvOracle(): string {
  return path.join(SERVER_DIR, '.env');
}

function gravarEnvOracle(valores: Record<string, string>) {
  const arquivo = arquivoEnvOracle();
  let linhas: string[] = [];
  if (fs.existsSync(arquivo)) {
    linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/);
  } else {
    linhas = [
      '# Ligar consulta espacial no Oracle on-prem (false = usa polígonos do mapa ORDS)',
      'USE_ORACLE=false',
      '',
      '# Conexão do Oracle — gravada pela tela admin do app',
      'ORACLE_USER=',
      'ORACLE_PASSWORD=',
      'ORACLE_CONNECT_STRING=',
      '',
      '# Instant Client = biblioteca do SERVIDOR (este computador), não do celular',
      'ORACLE_INSTANT_CLIENT=',
    ];
  }

  const atualizados = new Set<string>();
  const novas = linhas.map((linha) => {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) {
      return linha;
    }
    const separador = texto.indexOf('=');
    if (separador <= 0) {
      return linha;
    }
    const chave = texto.slice(0, separador).trim();
    if (chave in valores) {
      atualizados.add(chave);
      return `${chave}=${valores[chave]}`;
    }
    return linha;
  });

  for (const [chave, valor] of Object.entries(valores)) {
    if (!atualizados.has(chave)) {
      novas.push(`${chave}=${valor}`);
    }
  }

  fs.writeFileSync(arquivo, `${novas.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}

export type OracleConfigEntrada = {
  usuario: string;
  senha?: string;
  host?: string;
  porta?: string;
  servico?: string;
  connectString?: string;
  instantClientDir?: string;
  useOracle?: boolean;
};

function textoSeguro(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

export function salvarConfigOracle(entrada: OracleConfigEntrada): OracleConfigPublica {
  const atual = obterConfigOracle();
  const usuario = textoSeguro(entrada.usuario);
  const senhaNova = entrada.senha != null ? String(entrada.senha) : '';
  const senha = senhaNova !== '' ? senhaNova : atual.password;

  let connectString = textoSeguro(entrada.connectString);
  if (!connectString) {
    const host = textoSeguro(entrada.host);
    const porta = textoSeguro(entrada.porta) || '1521';
    const servico = textoSeguro(entrada.servico);
    if (!host || !servico) {
      throw new Error('Informe host, porta e serviço do Oracle, ou a string Easy Connect completa.');
    }
    connectString = montarConnectString(host, porta, servico);
  }

  if (!usuario) {
    throw new Error('Informe o usuário do Oracle.');
  }
  if (!senha || senha === 'SUA_SENHA') {
    throw new Error('Informe a senha do Oracle.');
  }
  if (senha.includes('\n') || senha.includes('\r')) {
    throw new Error('A senha do Oracle não pode conter quebra de linha.');
  }

  const instantClientDir = textoSeguro(entrada.instantClientDir) || atual.instantClientDir;
  const useOracle = entrada.useOracle ?? oracleUseOracle();

  configRuntime = {
    user: usuario,
    password: senha,
    connectString,
    instantClientDir,
    useOracle,
  };

  process.env.ORACLE_USER = usuario;
  process.env.ORACLE_PASSWORD = senha;
  process.env.ORACLE_CONNECT_STRING = connectString;
  process.env.ORACLE_INSTANT_CLIENT = instantClientDir;
  process.env.USE_ORACLE = useOracle ? 'true' : 'false';
  ordsSincronizadoEm = Date.now();

  gravarEnvOracle({
    USE_ORACLE: useOracle ? 'true' : 'false',
    ORACLE_USER: usuario,
    ORACLE_PASSWORD: senha,
    ORACLE_CONNECT_STRING: connectString,
    ORACLE_INSTANT_CLIENT: instantClientDir,
  });

  return obterConfigPublicaOracle();
}

export function mensagemErroOracle(erro: unknown): string {
  const raw = erro instanceof Error ? erro.message : String(erro);
  if (/ORA-01017/i.test(raw)) {
    return 'Usuário ou senha inválidos.';
  }
  if (/ORA-01031|insufficient privileges/i.test(raw)) {
    const gravacao = obterConfigGravacao();
    const usuario = gravacao?.user ?? 'nenhum usuário de gravação';
    return `Sem permissão de INSERT no Oracle (usuário ${usuario}). No SQL Developer, conecte como AGRICOLA e rode AgroBi/scripts/grant-apontamento-cscliente.sql (GRANT nas tmp_os* e EXECUTE em agricola.pkg_mobile para CSCLIENTE).`;
  }
  if (/ORA-12154|NJS-125|NJS-503|ENOTFOUND|ECONNREFUSED/i.test(raw)) {
    return 'Host, porta ou serviço não encontrados. Confira a conexão.';
  }
  if (/DPI-1047|DPI-1072/i.test(raw)) {
    return 'Instant Client não encontrado neste computador. Confira ORACLE_INSTANT_CLIENT no server/.env.';
  }
  if (/NJS-116|0x939/i.test(raw)) {
    return 'Este Oracle exige Instant Client (modo Thick). Confira ORACLE_INSTANT_CLIENT no server/.env e reinicie a API (npm run api:mock).';
  }
  if (/timeout|Tempo esgotado/i.test(raw)) {
    return 'Tempo esgotado ao conectar no Oracle.';
  }
  return raw;
}

export async function testarConexaoOracle(entrada?: Partial<OracleConfigEntrada>): Promise<{
  ok: boolean;
  mensagem: string;
  usuario?: string;
}> {
  const atual = obterConfigOracle();
  const usuario = textoSeguro(entrada?.usuario) || atual.user;
  const senhaInformada = entrada?.senha != null ? String(entrada.senha) : '';
  const senha = senhaInformada !== '' ? senhaInformada : atual.password;
  let connectString = textoSeguro(entrada?.connectString);
  if (!connectString && entrada?.host) {
    connectString = montarConnectString(
      textoSeguro(entrada.host),
      textoSeguro(entrada.porta) || '1521',
      textoSeguro(entrada.servico),
    );
  }
  if (!connectString) {
    connectString = atual.connectString;
  }

  if (!usuario || !senha || !connectString || connectString.includes('HOST:1521')) {
    throw new Error('Preencha usuário, senha e conexão do Oracle antes de testar.');
  }

  const driver = await carregarDriver();
  const connection = await Promise.race([
    driver.getConnection({ user: usuario, password: senha, connectString }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Tempo esgotado ao conectar no Oracle (15s).')), 15_000);
    }),
  ]);

  try {
    const result = await connection.execute('SELECT USER AS USUARIO FROM DUAL', {}, { outFormat: driver.OUT_FORMAT_OBJECT });
    const row = result.rows?.[0];
    const usuarioBanco = row ? String(row.USUARIO ?? row.usuario ?? usuario) : usuario;
    return {
      ok: true,
      mensagem: `Conectou em ${connectString} como ${usuarioBanco}.`,
      usuario: usuarioBanco,
    };
  } finally {
    await connection.close();
  }
}

async function carregarDriver(): Promise<OracleModule> {
  if (oracledb) {
    return oracledb;
  }

  try {
    const loaded = requireOracle('oracledb') as OracleModule & { default?: OracleModule };
    oracledb = loaded.default ?? loaded;
  } catch {
    throw new Error(
      'Driver oracledb não instalado. Na pasta do projeto execute: npm install oracledb',
    );
  }

  if (typeof oracledb.getConnection !== 'function') {
    throw new Error('Driver Oracle inválido. Reinstale com: npm install oracledb');
  }

  if (!clientInicializado) {
    carregarEnvOracle();
    const dir = resolverInstantClientDir(obterConfigOracle().instantClientDir);
    if (!pastaTemOci(dir)) {
      throw new Error(
        `Instant Client (oci.dll) não encontrado. Ajuste ORACLE_INSTANT_CLIENT no server/.env. Tentou: ${dir}`,
      );
    }
    if (typeof oracledb.initOracleClient !== 'function') {
      throw new Error('Driver oracledb sem suporte a Instant Client. Reinstale: npm install oracledb');
    }
    if (!process.env.PATH?.toLowerCase().includes(dir.toLowerCase())) {
      process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ''}`;
    }
    try {
      oracledb.initOracleClient({ libDir: dir });
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      if (!/already been initialized|DPI-1050|NJS-002/i.test(msg)) {
        throw new Error(`Falha ao iniciar Instant Client em ${dir}: ${msg}`);
      }
    }
    clientInicializado = true;
  }

  return oracledb;
}

export async function conectarOracle(): Promise<OracleConnection> {
  const driver = await carregarDriver();
  const cfg = obterConfigConsulta();
  return driver.getConnection({
    user: cfg.user,
    password: cfg.password,
    connectString: cfg.connectString,
  });
}

export async function conectarOracleGravacao(): Promise<OracleConnection> {
  await sincronizarConexaoBancoOrds();
  const cfg = obterConfigGravacao();
  if (!cfg) {
    throw new Error(
      `INSERT recusado: não há CSCLIENTE. ${ordsGravacaoStatus.mensagem} As credenciais de INSERT vêm da ORDS conexao_banco com Authorization: Bearer. Defina ORDS_TOKEN (ou ORDS_CLIENT_ID/ORDS_CLIENT_SECRET).`,
    );
  }
  const driver = await carregarDriver();
  return driver.getConnection({
    user: cfg.user,
    password: cfg.password,
    connectString: cfg.connectString,
  });
}

export async function withOracleConnection<T>(
  fn: (connection: OracleConnection, driver: OracleModule) => Promise<T>,
): Promise<T> {
  const driver = await carregarDriver();
  const connection = await conectarOracle();
  try {
    return await fn(connection, driver);
  } finally {
    await connection.close();
  }
}

export async function withOracleGravacao<T>(
  fn: (connection: OracleConnection, driver: OracleModule) => Promise<T>,
): Promise<T> {
  const driver = await carregarDriver();
  const connection = await conectarOracleGravacao();
  try {
    return await fn(connection, driver);
  } finally {
    await connection.close();
  }
}

function bindsUsados(sql: string, binds: Record<string, unknown>): Record<string, unknown> {
  const usados: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(binds)) {
    if (new RegExp(`:${chave}\\b`).test(sql)) {
      usados[chave] = valor;
    }
  }
  return usados;
}

export async function executarSql(
  connection: OracleConnection,
  driver: OracleModule,
  sql: string,
  binds: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const result = await connection.execute(sql, bindsUsados(sql, binds), {
    outFormat: driver.OUT_FORMAT_OBJECT,
    fetchArraySize: 200,
  });
  return result.rows ?? [];
}

export async function consultarSql(sql: string, binds: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
  return withOracleConnection((connection, driver) => executarSql(connection, driver, sql, binds));
}

export async function consultarSqlGravacao(
  sql: string,
  binds: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  return withOracleGravacao((connection, driver) => executarSql(connection, driver, sql, binds));
}

export async function consultarTalhaoPorPonto(latitude: number, longitude: number) {
  const driver = await carregarDriver();
  const connection = await conectarOracle();

  const sql = `
    SELECT
      f.${ORACLE_SCHEMA.colCodigoFazenda} AS codigo_fazenda,
      f.${ORACLE_SCHEMA.colNomeFazenda}   AS nome_fazenda,
      t.${ORACLE_SCHEMA.colCodigoTalhao}  AS codigo_talhao
    FROM ${ORACLE_SCHEMA.talhao} t
    INNER JOIN ${ORACLE_SCHEMA.fazenda} f
      ON f.${ORACLE_SCHEMA.colCodigoFazenda} = t.${ORACLE_SCHEMA.colFkFazendaNoTalhao}
    WHERE SDO_CONTAINS(
      t.${ORACLE_SCHEMA.colGeometriaTalhao},
      SDO_GEOMETRY(
        2001,
        4326,
        SDO_POINT_TYPE(:longitude, :latitude, NULL),
        NULL,
        NULL
      )
    ) = 'TRUE'
    AND ROWNUM = 1
  `;

  try {
    const result = await connection.execute(
      sql,
      { latitude, longitude },
      { outFormat: driver.OUT_FORMAT_OBJECT },
    );

    const row = result.rows?.[0];
    if (!row) {
      return {
        encontrado: false,
        mensagem: 'Localização fora dos talhões cadastrados',
        latitude,
        longitude,
        origem: 'api' as const,
      };
    }

    return {
      encontrado: true,
      fazenda: {
        codigo: Number(row.CODIGO_FAZENDA ?? row.codigo_fazenda),
        nome: String(row.NOME_FAZENDA ?? row.nome_fazenda),
      },
      talhao: {
        codigo: Number(row.CODIGO_TALHAO ?? row.codigo_talhao),
      },
      latitude,
      longitude,
      origem: 'api' as const,
    };
  } finally {
    await connection.close();
  }
}
