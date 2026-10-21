/** Seleciona somente um túnel HTTP encaminhado à porta local da API. */
export function urlHttpsDaApi(tunnels, port) {
  for (const tunnel of tunnels) {
    try {
      const publicUrl = new URL(tunnel.public_url);
      const addr = String(tunnel.config?.addr ?? '');
      const target = new URL(/^https?:\/\//i.test(addr) ? addr : `http://${addr}`);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
      const targetPort = target.port || (target.protocol === 'https:' ? '443' : '80');
      if (publicUrl.protocol === 'https:' && local && targetPort === String(port)) {
        return publicUrl.href.replace(/\/$/, '');
      }
    } catch {
      // Ignora túneis TCP e configurações incompletas.
    }
  }
  return null;
}
