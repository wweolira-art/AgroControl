import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

import { TIPOS_OPERACAO_ERP, type ApontamentoRascunho, type CadastrosApontamento } from '../types/apontamento';
import type { PerdaRascunho } from '../types/perdas';

const INDICE_CHAVE = 'agrocontrol.rascunhos.ids';
const PREFIXO_ITEM = 'agrocontrol.rascunho.';
const PERDAS_INDICE_CHAVE = 'agrocontrol.perdas.ids';
const PERDAS_PREFIXO_ITEM = 'agrocontrol.perda.';
const CADASTROS_ARQUIVO = `${FileSystem.documentDirectory ?? ''}cadastros-apontamento.json`;
const PERDAS_ARQUIVO = `${FileSystem.documentDirectory ?? ''}cadastros-perdas.json`;
const CADASTROS_WEB_CHAVE = 'agrocontrol.cadastros-apontamento';
const PERDAS_WEB_CHAVE = 'agrocontrol.cadastros-perdas';

let cadastrosMemoria: CadastrosApontamento | null = null;
let rascunhosMemoria: ApontamentoRascunho[] = [];
let rascunhosCarregados = false;
let perdasMemoria: PerdaRascunho[] = [];
let perdasCarregadas = false;
const rascunhosWeb = new Map<string, string>();

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

async function lerChave(chave: string): Promise<string | null> {
  if (await persistenciaDisponivel()) {
    return SecureStore.getItemAsync(chave);
  }
  if (localStorageDisponivel()) {
    return window.localStorage.getItem(chave);
  }
  return rascunhosWeb.get(chave) ?? null;
}

async function gravarChave(chave: string, valor: string): Promise<void> {
  if (await persistenciaDisponivel()) {
    await SecureStore.setItemAsync(chave, valor);
    return;
  }
  if (localStorageDisponivel()) {
    window.localStorage.setItem(chave, valor);
    return;
  }
  rascunhosWeb.set(chave, valor);
}

async function apagarChave(chave: string): Promise<void> {
  if (await persistenciaDisponivel()) {
    await SecureStore.deleteItemAsync(chave);
    return;
  }
  if (localStorageDisponivel()) {
    window.localStorage.removeItem(chave);
    return;
  }
  rascunhosWeb.delete(chave);
}

function chaveItem(id: string): string {
  return `${PREFIXO_ITEM}${id}`;
}

function chavePerda(id: string): string {
  return `${PERDAS_PREFIXO_ITEM}${id}`;
}

function rascunhoValido(valor: unknown): valor is ApontamentoRascunho {
  if (!valor || typeof valor !== 'object') {
    return false;
  }
  const item = valor as ApontamentoRascunho;
  const temMaterial =
    item.codMaterial > 0 ||
    (Array.isArray(item.materiais) && item.materiais.some((linha) => linha.codMaterial > 0));
  return Boolean(item.id && item.codFazenda && item.codTalhao && temMaterial);
}

function perdaValida(valor: unknown): valor is PerdaRascunho {
  if (!valor || typeof valor !== 'object') {
    return false;
  }
  const item = valor as PerdaRascunho;
  return Boolean(
    item.id &&
      item.codFazenda &&
      item.codTalhao &&
      item.codTipocorte &&
      Array.isArray(item.itens) &&
      item.itens.some((linha) => linha.codTipoperda > 0 && linha.quantidade > 0),
  );
}

async function persistirIndice(ids: string[]): Promise<void> {
  await gravarChave(INDICE_CHAVE, JSON.stringify(ids));
}

async function garantirRascunhosCarregados(): Promise<void> {
  if (rascunhosCarregados) {
    return;
  }
  rascunhosCarregados = true;
  const indiceJson = await lerChave(INDICE_CHAVE);
  if (!indiceJson) {
    rascunhosMemoria = [];
    return;
  }
  let ids: string[] = [];
  try {
    const lido = JSON.parse(indiceJson) as unknown;
    ids = Array.isArray(lido) ? lido.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    rascunhosMemoria = [];
    return;
  }
  const carregados: ApontamentoRascunho[] = [];
  for (const id of ids) {
    const json = await lerChave(chaveItem(id));
    if (!json) {
      continue;
    }
    try {
      const item = JSON.parse(json) as unknown;
      if (rascunhoValido(item)) {
        carregados.push(item);
      }
    } catch {
      await apagarChave(chaveItem(id));
    }
  }
  rascunhosMemoria = carregados;
  await persistirIndice(carregados.map((item) => item.id));
}

async function garantirPerdasCarregadas(): Promise<void> {
  if (perdasCarregadas) {
    return;
  }
  perdasCarregadas = true;
  const indiceJson = await lerChave(PERDAS_INDICE_CHAVE);
  if (!indiceJson) {
    perdasMemoria = [];
    return;
  }
  let ids: string[] = [];
  try {
    const lido = JSON.parse(indiceJson) as unknown;
    ids = Array.isArray(lido) ? lido.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    perdasMemoria = [];
    return;
  }
  const carregadas: PerdaRascunho[] = [];
  for (const id of ids) {
    const json = await lerChave(chavePerda(id));
    if (!json) {
      continue;
    }
    try {
      const item = JSON.parse(json) as unknown;
      if (perdaValida(item)) {
        carregadas.push(item);
      }
    } catch {
      await apagarChave(chavePerda(id));
    }
  }
  perdasMemoria = carregadas;
  await gravarChave(PERDAS_INDICE_CHAVE, JSON.stringify(carregadas.map((item) => item.id)));
}

export async function salvarCadastrosLocal(cadastros: CadastrosApontamento): Promise<void> {
  cadastrosMemoria = {
    ...cadastros,
    tiposOperacao:
      Array.isArray(cadastros.tiposOperacao) && cadastros.tiposOperacao.length > 0
        ? cadastros.tiposOperacao
        : TIPOS_OPERACAO_ERP,
    importadoEm: cadastros.importadoEm || new Date().toISOString(),
  };
  if (!FileSystem.documentDirectory) {
    if (localStorageDisponivel()) {
      window.localStorage.setItem(CADASTROS_WEB_CHAVE, JSON.stringify(cadastrosMemoria));
    }
    return;
  }
  await FileSystem.writeAsStringAsync(CADASTROS_ARQUIVO, JSON.stringify(cadastrosMemoria));
}

export async function carregarCadastrosLocal(): Promise<CadastrosApontamento | null> {
  if (cadastrosMemoria) {
    return cadastrosMemoria;
  }
  if (!FileSystem.documentDirectory) {
    if (!localStorageDisponivel()) {
      return null;
    }
    const json = window.localStorage.getItem(CADASTROS_WEB_CHAVE);
    if (!json) {
      return null;
    }
    try {
      const lido = JSON.parse(json) as CadastrosApontamento;
      cadastrosMemoria = {
        fazendas: Array.isArray(lido.fazendas) ? lido.fazendas : [],
        talhoes: Array.isArray(lido.talhoes) ? lido.talhoes : [],
        materiais: Array.isArray(lido.materiais) ? lido.materiais : [],
        operacoes: Array.isArray(lido.operacoes) ? lido.operacoes : [],
        funcionarios: Array.isArray(lido.funcionarios) ? lido.funcionarios : [],
        turmas: Array.isArray(lido.turmas) ? lido.turmas : undefined,
      meiosAplicacao: Array.isArray(lido.meiosAplicacao) ? lido.meiosAplicacao : [],
        tiposOperacao:
          Array.isArray(lido.tiposOperacao) && lido.tiposOperacao.length > 0
            ? lido.tiposOperacao
            : TIPOS_OPERACAO_ERP,
        importadoEm: lido.importadoEm || '',
      };
      return cadastrosMemoria;
    } catch {
      return null;
    }
  }
  try {
    const info = await FileSystem.getInfoAsync(CADASTROS_ARQUIVO);
    if (!info.exists) {
      return null;
    }
    const json = await FileSystem.readAsStringAsync(CADASTROS_ARQUIVO);
    const lido = JSON.parse(json) as CadastrosApontamento;
    if (!lido || typeof lido !== 'object') {
      return null;
    }
    cadastrosMemoria = {
      fazendas: Array.isArray(lido.fazendas) ? lido.fazendas : [],
      talhoes: Array.isArray(lido.talhoes) ? lido.talhoes : [],
      materiais: Array.isArray(lido.materiais) ? lido.materiais : [],
      operacoes: Array.isArray(lido.operacoes) ? lido.operacoes : [],
      funcionarios: Array.isArray(lido.funcionarios) ? lido.funcionarios : [],
      turmas: Array.isArray(lido.turmas) ? lido.turmas : undefined,
      meiosAplicacao: Array.isArray(lido.meiosAplicacao) ? lido.meiosAplicacao : [],
      tiposOperacao:
        Array.isArray(lido.tiposOperacao) && lido.tiposOperacao.length > 0
          ? lido.tiposOperacao
          : TIPOS_OPERACAO_ERP,
      importadoEm: lido.importadoEm || '',
    };
    return cadastrosMemoria;
  } catch {
    return null;
  }
}

export async function limparCadastrosLocal(): Promise<void> {
  cadastrosMemoria = null;
  if (!FileSystem.documentDirectory) {
    if (localStorageDisponivel()) {
      window.localStorage.removeItem(CADASTROS_WEB_CHAVE);
    }
    return;
  }
  await FileSystem.deleteAsync(CADASTROS_ARQUIVO, { idempotent: true });
}

export async function salvarCadastrosPerdaLocal(cadastros: unknown): Promise<void> {
  if (!FileSystem.documentDirectory) {
    if (localStorageDisponivel()) {
      window.localStorage.setItem(PERDAS_WEB_CHAVE, JSON.stringify(cadastros));
    }
    return;
  }
  await FileSystem.writeAsStringAsync(PERDAS_ARQUIVO, JSON.stringify(cadastros));
}

export async function carregarCadastrosPerdaLocal<T>(): Promise<T | null> {
  if (!FileSystem.documentDirectory) {
    if (!localStorageDisponivel()) {
      return null;
    }
    const json = window.localStorage.getItem(PERDAS_WEB_CHAVE);
    if (!json) {
      return null;
    }
    try {
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  }
  try {
    const info = await FileSystem.getInfoAsync(PERDAS_ARQUIVO);
    if (!info.exists) {
      return null;
    }
    return JSON.parse(await FileSystem.readAsStringAsync(PERDAS_ARQUIVO)) as T;
  } catch {
    return null;
  }
}

export async function carregarRascunhosLocal(): Promise<ApontamentoRascunho[]> {
  await garantirRascunhosCarregados();
  return [...rascunhosMemoria];
}

export async function contarRascunhosPendentes(): Promise<number> {
  const lista = await carregarRascunhosLocal();
  return lista.filter((item) => item.syncStatus !== 'enviado').length;
}

export async function salvarRascunhoLocal(rascunho: ApontamentoRascunho): Promise<void> {
  await garantirRascunhosCarregados();
  const gravar: ApontamentoRascunho = {
    ...rascunho,
    syncStatus: rascunho.syncStatus === 'enviado' ? 'enviado' : rascunho.syncStatus,
  };
  const idx = rascunhosMemoria.findIndex((item) => item.id === gravar.id);
  if (idx >= 0) {
    rascunhosMemoria[idx] = gravar;
  } else {
    rascunhosMemoria = [gravar, ...rascunhosMemoria];
  }
  await gravarChave(chaveItem(gravar.id), JSON.stringify(gravar));
  await persistirIndice(rascunhosMemoria.map((item) => item.id));
}

export async function atualizarRascunhoLocal(
  id: string,
  patch: Partial<ApontamentoRascunho>,
): Promise<ApontamentoRascunho | null> {
  await garantirRascunhosCarregados();
  const idx = rascunhosMemoria.findIndex((item) => item.id === id);
  if (idx < 0) {
    return null;
  }
  const atualizado = { ...rascunhosMemoria[idx], ...patch };
  rascunhosMemoria[idx] = atualizado;
  await gravarChave(chaveItem(id), JSON.stringify(atualizado));
  return atualizado;
}

export async function removerRascunhoLocal(id: string): Promise<void> {
  await garantirRascunhosCarregados();
  rascunhosMemoria = rascunhosMemoria.filter((item) => item.id !== id);
  await apagarChave(chaveItem(id));
  await persistirIndice(rascunhosMemoria.map((item) => item.id));
}

export async function carregarPerdasLocal(): Promise<PerdaRascunho[]> {
  await garantirPerdasCarregadas();
  return [...perdasMemoria];
}

export async function salvarPerdaLocal(rascunho: PerdaRascunho): Promise<void> {
  await garantirPerdasCarregadas();
  const gravar: PerdaRascunho = {
    ...rascunho,
    syncStatus: rascunho.syncStatus === 'enviado' ? 'enviado' : rascunho.syncStatus,
  };
  const idx = perdasMemoria.findIndex((item) => item.id === gravar.id);
  if (idx >= 0) {
    perdasMemoria[idx] = gravar;
  } else {
    perdasMemoria = [gravar, ...perdasMemoria];
  }
  await gravarChave(chavePerda(gravar.id), JSON.stringify(gravar));
  await gravarChave(PERDAS_INDICE_CHAVE, JSON.stringify(perdasMemoria.map((item) => item.id)));
}

export async function atualizarPerdaLocal(id: string, patch: Partial<PerdaRascunho>): Promise<PerdaRascunho | null> {
  await garantirPerdasCarregadas();
  const idx = perdasMemoria.findIndex((item) => item.id === id);
  if (idx < 0) {
    return null;
  }
  const atualizado = { ...perdasMemoria[idx], ...patch };
  perdasMemoria[idx] = atualizado;
  await gravarChave(chavePerda(id), JSON.stringify(atualizado));
  return atualizado;
}

export async function removerPerdaLocal(id: string): Promise<void> {
  await garantirPerdasCarregadas();
  perdasMemoria = perdasMemoria.filter((item) => item.id !== id);
  await apagarChave(chavePerda(id));
  await gravarChave(PERDAS_INDICE_CHAVE, JSON.stringify(perdasMemoria.map((item) => item.id)));
}

export function resumoCadastros(cadastros: CadastrosApontamento | null): string {
  if (!cadastros) {
    return 'Nenhum cadastro importado';
  }
  return `${cadastros.fazendas.length} fazendas · ${cadastros.talhoes.length} talhões · ${cadastros.materiais.length} materiais · ${cadastros.operacoes.length} operações · ${cadastros.funcionarios?.length ?? 0} funcionários · ${cadastros.meiosAplicacao?.length ?? 0} meios`;
}
