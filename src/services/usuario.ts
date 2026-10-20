import axios from 'axios';

import { env, urlEhRedeLocal } from '../config/env';
import { lerUrlApiSalva, cabecalhosApiPublica, mensagemErroApi } from './api-url';
import type { UsuarioLista, UsuarioSessao } from '../types/auth';

async function api<T>(path: string, body?: unknown): Promise<T> {
  const baseURL = (await lerUrlApiSalva()) || env.apiUrl;
  if (!/^https:\/\//i.test(baseURL) && !(__DEV__ && /^http:\/\//i.test(baseURL) && urlEhRedeLocal(baseURL))) {
    throw new Error('Configure uma URL HTTPS da API em EXPO_PUBLIC_API_URL.');
  }
  try {
    const { data } = await axios.request<T>({
      baseURL, url: path, method: body === undefined ? 'GET' : 'POST', data: body,
      headers: await cabecalhosApiPublica(), timeout: 25_000,
    });
    return data;
  } catch (error) { throw mensagemErroApi(error, baseURL, 'Falha ao acessar o cadastro de usuários.'); }
}

export function listarUsuarios(): Promise<UsuarioLista[]> {
  return api('/api/usuarios');
}

/** A senha é validada pela API; hashes e credenciais ORDS não chegam ao aplicativo. */
export function autenticarUsuario(email: string, senha: string): Promise<UsuarioSessao> {
  return api('/api/auth/login', { email, senha });
}

export function encerrarSessao(): Promise<unknown> {
  return api('/api/auth/logout', {});
}

export function criarUsuario(dados: { nome: string; email: string; senha: string; admin: boolean }): Promise<UsuarioLista> {
  return api('/api/usuarios', dados);
}
