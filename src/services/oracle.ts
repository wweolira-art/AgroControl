/**
 * O aplicativo Android NÃO conecta no Oracle e NÃO usa Instant Client.
 * O caminho C:\instantclient-... é só do computador que roda a API.
 */
export const ORACLE_PLACEHOLDER = {
  arquivoConexao: 'server/oracle.ts',
  arquivoEnv: 'server/.env',
  schemaFazenda: 'agricola.fazenda',
  schemaTalhao: 'agricola.talhao',
} as const;
