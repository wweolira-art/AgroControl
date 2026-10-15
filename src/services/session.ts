import * as SecureStore from 'expo-secure-store';

import type { UsuarioSessao } from '../types/auth';

const CHAVE = 'agrocontrol.usuario';
let memoria: string | null = null;

function localStorageDisponivel(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

async function armazenamentoDisponivel(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function salvarSessao(usuario: UsuarioSessao): Promise<void> {
  const json = JSON.stringify(usuario);
  if (await armazenamentoDisponivel()) {
    await SecureStore.setItemAsync(CHAVE, json);
  } else {
    memoria = json;
    if (localStorageDisponivel()) {
      window.localStorage.setItem(CHAVE, json);
    }
  }
}

export async function carregarSessao(): Promise<UsuarioSessao | null> {
  const json = (await armazenamentoDisponivel())
    ? await SecureStore.getItemAsync(CHAVE)
    : localStorageDisponivel()
      ? window.localStorage.getItem(CHAVE)
      : memoria;
  if (!json) {
    return null;
  }
  try {
    const dados = JSON.parse(json) as UsuarioSessao;
    if (!dados?.idUsuario || !dados.email || typeof dados.token !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(dados.token) ||
        !Number.isFinite(Date.parse(dados.expiraEm)) || Date.parse(dados.expiraEm) <= Date.now()) {
      return null;
    }
    return dados;
  } catch {
    return null;
  }
}

export async function limparSessao(): Promise<void> {
  memoria = null;
  if (await armazenamentoDisponivel()) {
    await SecureStore.deleteItemAsync(CHAVE);
  } else if (localStorageDisponivel()) {
    window.localStorage.removeItem(CHAVE);
  }
}
