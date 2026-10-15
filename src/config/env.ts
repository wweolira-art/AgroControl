/**
 * Configuração de ambiente do aplicativo.
 *
 * Oracle de insumos: ORDS `conexao_banco` (credenciais SQL*Net).
 * API REST (apontamento/perdas): AgroControl-api-public no outro PC (ngrok HTTPS).
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';

/** URL pública reservada do AgroControl-api-public (`npm run public` nesse PC). */
export const API_AGROCONTROL_PUBLIC =
  'https://hyperkeratotic-nondenunciative-matthias.ngrok-free.dev';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export function ehApk(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.Standalone;
}

export function urlEhRedeLocal(url: string): boolean {
  return /localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[0-1])\./i.test(url);
}

/** API do PC na mesma Wi-Fi do Expo Go (`host:3001`). */
export function urlApiLanDoExpo(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;
  if (!hostUri) {
    return null;
  }
  const host = hostUri.replace(/^https?:\/\//, '').split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return null;
  }
  return `http://${host}:3001`;
}

function resolverApiUrl(): string {
  return (
    process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? API_AGROCONTROL_PUBLIC
  ).replace(/\/$/, '');
}

const ORDS_APONTAMENTO =
  'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/apontamento';

const ORDS_CONEXAO_BANCO =
  'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/conexao_banco';

function resolverOrdsConexaoUrl(): string {
  const bruto =
    process.env.EXPO_PUBLIC_ORDS_CONEXAO_URL ?? extra.ordsConexaoUrl ?? ORDS_CONEXAO_BANCO;
  if (/erp_conexao/i.test(bruto)) {
    return ORDS_CONEXAO_BANCO;
  }
  return bruto.replace(/\/$/, '');
}

export const env = {
  appName: 'Elejotaagro',
  /** AgroControl-api-public no outro PC (ngrok). Pode ser sobrescrita em Cadastros. */
  apiUrl: resolverApiUrl(),
  ordsUsuarioUrl:
    process.env.EXPO_PUBLIC_ORDS_USUARIO_URL ??
    'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/usuario',
  ordsMapaTalhaoUrl:
    process.env.EXPO_PUBLIC_ORDS_MAPA_TALHAO_URL ??
    'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/mapa_talhao',
  ordsInsumosUrl:
    process.env.EXPO_PUBLIC_ORDS_INSUMOS_URL ??
    extra.ordsInsumosUrl ??
    'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/insumos',
  ordsConexaoUrl: resolverOrdsConexaoUrl(),
  ordsApontamentoUrl:
    process.env.EXPO_PUBLIC_ORDS_APONTAMENTO_URL ??
    extra.ordsApontamentoUrl ??
    ORDS_APONTAMENTO,
  oracleConnectString:
    process.env.EXPO_PUBLIC_ORACLE_CONNECT_STRING ?? extra.oracleConnectString ?? '0.tcp.sa.ngrok.io:15786/CSORCL',
  oracleUser: process.env.EXPO_PUBLIC_ORACLE_USER ?? extra.oracleUser ?? 'CONSULTA',
  /**
   * Bearer da ORDS conexao_banco (mesmo header do curl Authorization: Bearer).
   */
  ordsToken: process.env.EXPO_PUBLIC_ORDS_TOKEN ?? process.env.EXPO_PUBLIC_API_TOKEN ?? extra.ordsToken ?? '',
  /**
   * true  → identificação GPS no aparelho, com os polígonos da API mapa_talhao
   * false → chama GET /api/localizacao no backend
   */
  useMockApi: (process.env.EXPO_PUBLIC_USE_MOCK_API ?? 'true') !== 'false',
  authToken: process.env.EXPO_PUBLIC_API_TOKEN ?? '',
} as const;
