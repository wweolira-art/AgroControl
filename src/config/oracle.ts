/**
 * Conexão Easy Connect do Oracle de insumos (já na nuvem).
 * O APK usa esta string via ORDS; o celular não instala Instant Client.
 */
export const ORACLE_NUVEM = {
  connectString: '0.tcp.sa.ngrok.io:10057/csorcl',
  usuario: 'CONSULTA',
  host: '0.tcp.sa.ngrok.io',
  porta: '10057',
  servico: 'csorcl',
} as const;

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
  return `${host.trim()}:${porta.trim() || '1521'}/${servico.trim()}`;
}
