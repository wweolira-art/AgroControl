import * as SecureStore from 'expo-secure-store';

import { env, urlEhRedeLocal } from '../config/env';
import { carregarSessao } from './session';

const CHAVE_API_URL = 'elejotaagro.api.public.url';

const MSG_SEM_URL =
  'Configure a URL da API em Cadastros. No PC servidor, execute npm run api:public na raiz do AgroControl ou npm run public dentro da pasta server e copie a URL pública exibida.';

function urlValida(url: string): boolean {
  const limpa = url.replace(/\/$/, '');
  return /^https?:\/\//i.test(limpa);
}

export function normalizarUrlApi(url: string): string {
  return url.trim().replace(/\/$/, '');
}

let urlMemoria = '';

function localStorageDisponivel(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

async function persistenciaDisponivel(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function lerUrlApiSalva(): Promise<string> {
  if (urlMemoria && urlValida(urlMemoria)) {
    return urlMemoria;
  }
  try {
    if (await persistenciaDisponivel()) {
      const salva = (await SecureStore.getItemAsync(CHAVE_API_URL)) ?? '';
      const limpa = normalizarUrlApi(salva);
      if (urlValida(limpa)) {
        urlMemoria = limpa;
        return limpa;
      }
    } else if (localStorageDisponivel()) {
      const limpa = normalizarUrlApi(window.localStorage.getItem(CHAVE_API_URL) ?? '');
      if (urlValida(limpa)) {
        urlMemoria = limpa;
        return limpa;
      }
    }
  } catch {
    /* sem SecureStore */
  }
  return '';
}

export async function salvarUrlApiPublica(url: string): Promise<string> {
  const limpa = normalizarUrlApi(url);
  if (!urlValida(limpa)) {
    throw new Error('Informe a URL da API (https://….ngrok-free.dev ou http://IP:3001).');
  }
  urlMemoria = limpa;
  if (await persistenciaDisponivel()) {
    await SecureStore.setItemAsync(CHAVE_API_URL, limpa);
  } else if (localStorageDisponivel()) {
    window.localStorage.setItem(CHAVE_API_URL, limpa);
  }
  return limpa;
}

/**
 * URL da API REST. Prioridade: URL gravada no celular, depois #API= na ORDS, depois configuração do app.
 */
export async function listarUrlsApiCandidatas(): Promise<string[]> {
  const { obterUrlApiCustos } = await import('./oracle-conexao');
  try {
    const url = await obterUrlApiCustos();
    return [url];
  } catch {
    return [];
  }
}

export function obterUrlApiResolvida(): string {
  const url = env.apiUrl.replace(/\/$/, '');
  if (urlValida(url)) {
    return url;
  }
  throw new Error(MSG_SEM_URL);
}

export function mensagemSemUrlApi(): string {
  return MSG_SEM_URL;
}

export async function cabecalhosApiPublica(): Promise<Record<string, string>> {
  const sessao = await carregarSessao();
  return {
    ...(sessao ? { Authorization: `Bearer ${sessao.token}` } : {}),
    Accept: 'application/json',
    'ngrok-skip-browser-warning': 'true',
    'User-Agent': 'Elejotaagro/1.0',
  };
}

export function mensagemErroApi(erro: unknown, apiBase: string, fallback: string): Error {
  const axios = erro as { isAxiosError?: boolean; response?: { status?: number; data?: unknown }; code?: string; message?: string };
  const status = axios.response?.status;
  if (status === 403) {
    const mensagem = (axios.response?.data as { mensagem?: string } | undefined)?.mensagem;
    return new Error(mensagem || 'Acesso não permitido.');
  }
  if (status === 404) {
    return new Error(
      `O endereço ${apiBase} respondeu 404. No PC servidor, execute npm run api:public na raiz do AgroControl (ou npm run public na pasta server). Confirme que a URL exibida abre /health e cole essa URL em Cadastros. Se /health funcionar, atualize a pasta server: a rota solicitada pode estar ausente nessa versão da API.`,
    );
  }
  if (status === 401) {
    const mensagem = (axios.response?.data as { mensagem?: string } | undefined)?.mensagem;
    return new Error(mensagem || 'Sessão expirada. Entre novamente.');
  }
  const data = axios.response?.data;
  if (data && typeof data === 'object') {
    const mensagem = (data as Record<string, unknown>).mensagem ?? (data as Record<string, unknown>).message;
    if (typeof mensagem === 'string' && mensagem.trim()) {
      return new Error(mensagem);
    }
  }
  if (axios.code === 'ECONNABORTED') {
    return new Error(`A API demorou demais (${apiBase}). Verifique o ngrok e o AgroControl-api-public.`);
  }
  if (String(axios.message ?? '').includes('Network Error')) {
    return new Error(`Sem conexão com ${apiBase}. Use internet e a URL HTTPS do ngrok.`);
  }
  return erro instanceof Error ? erro : new Error(fallback);
}
