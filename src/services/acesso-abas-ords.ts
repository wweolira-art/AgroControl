import axios from 'axios';
import { ABAS_DISPOSITIVO, ABAS_OBRIGATORIAS, type AcessoUsuario, type AbaDispositivo } from '../config/device-tabs';

export const URL_ACESSO_ABAS = 'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/app_acesso_aba/';

export async function carregarAbasOrds(emailUsuario: string): Promise<AcessoUsuario> {
  const email = emailUsuario.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('E-mail da sessão inválido. Entre novamente.');
  const abas = new Set<AbaDispositivo>(ABAS_OBRIGATORIAS);
  let url = `${URL_ACESSO_ABAS}?limit=500&q=${encodeURIComponent(JSON.stringify({ email: { $eq: email } }))}`;
  const visitadas = new Set<string>();
  try {
    while (url) {
      const pagina = new URL(url);
      const base = new URL(URL_ACESSO_ABAS);
      if (pagina.origin !== base.origin || pagina.pathname !== base.pathname || visitadas.has(url)) {
        throw new Error('Paginação inválida nas permissões da API Oracle.');
      }
      visitadas.add(url);
      const { data } = await axios.get(url, { timeout: 20000 });
      if (!Array.isArray(data?.items)) throw new Error('Resposta inválida nas permissões da API Oracle.');
      for (const row of data.items) {
        if (String(row.email ?? row.EMAIL ?? '').trim().toLowerCase() !== email) continue;
        const aba = String(row.aba ?? row.ABA ?? '').trim();
        if (ABAS_DISPOSITIVO.some(item => item.id === aba)) abas.add(aba as AbaDispositivo);
      }
      const next = Array.isArray(data.links) ? data.links.find((link: { rel?: string }) => link.rel === 'next') : undefined;
      if (data.hasMore && !next?.href) throw new Error('Paginação incompleta nas permissões da API Oracle.');
      url = next?.href ? new URL(next.href, URL_ACESSO_ABAS).href : '';
    }
    return { email, abas: [...abas] };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw Object.assign(new Error('Falha ao consultar as permissões diretamente na API Oracle.'), { status: error.response?.status });
    }
    throw error;
  }
}
