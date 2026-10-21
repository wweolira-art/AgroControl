import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { env } from '../config/env';
import type { AcessoUsuario, AbaDispositivo } from '../config/device-tabs';
import { cabecalhosApiPublica, lerUrlApiSalva, mensagemErroApi } from './api-url';
import { ABAS_DISPOSITIVO } from '../config/device-tabs';
import { carregarAbasOrds, URL_ACESSO_ABAS } from './acesso-abas-ords';

async function request<T>(path: string, body?: unknown): Promise<T> {
  const base = (await lerUrlApiSalva()) || env.apiUrl;
  try {
    const { data } = await axios.request<T>({ baseURL: base, url: path, method: body ? 'PUT' : 'GET',
      data: body, headers: await cabecalhosApiPublica(), timeout: 20000 });
    return data;
  } catch (error) {
    throw Object.assign(mensagemErroApi(error, base, 'Falha ao consultar liberações por e-mail.'), { status: axios.isAxiosError(error) ? error.response?.status : undefined });
  }
}
export const carregarAcessoUsuario = (email: string) => carregarAbasOrds(email);
export const listarAcessosUsuario = () => request<AcessoUsuario[]>('/api/acessos/abas');
export const consultarAcessoUsuario = (email: string) => request<AcessoUsuario>(`/api/acessos/abas/${encodeURIComponent(email.trim().toLowerCase())}`);
export const salvarAcessoUsuario = (email: string, abas: AbaDispositivo[]) =>
  request<AcessoUsuario>(`/api/acessos/abas/${encodeURIComponent(email)}`, { abas });

async function cacheKey(email: string) {
  const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify([URL_ACESSO_ABAS, email.trim().toLowerCase()]));
  return `agrocontrol.email.access.${hash}`;
}
export async function cacheAcessoUsuario(email: string, value: AcessoUsuario | null) {
  const key = await cacheKey(email);
  if (await SecureStore.isAvailableAsync()) {
    if (value) await SecureStore.setItemAsync(key, JSON.stringify(value));
    else await SecureStore.deleteItemAsync(key);
  } else if (typeof localStorage !== 'undefined') {
    if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key);
  }
}
export async function lerCacheAcessoUsuario(email: string): Promise<AcessoUsuario | null> {
  try {
    const key = await cacheKey(email);
    const text = await SecureStore.isAvailableAsync() ? await SecureStore.getItemAsync(key) : typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (!text) return null;
    const value = JSON.parse(text) as AcessoUsuario;
    if (value.email !== email.trim().toLowerCase() || !Array.isArray(value.abas) || value.abas.some(tab => !ABAS_DISPOSITIVO.some(item => item.id === tab))) return null;
    return value;
  } catch { return null; }
}
