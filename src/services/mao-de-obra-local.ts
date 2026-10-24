import * as FileSystem from 'expo-file-system/legacy';

export interface LancamentoMaoDeObraLocal {
  id: string;
  criadoEm: string;
  codAgenciador: number;
  codGrupoempresaTurma: number;
  codFazenda: number;
  codTalhao: number;
  codOperacao: number;
  dataApontamento: string;
  observacao: string;
  funcionarios: number[];
}

const ARQUIVO = `${FileSystem.documentDirectory ?? ''}mao-de-obra-pendente.json`;
const CHAVE_WEB = 'agrocontrol.mao-de-obra-pendente';
let memoria: LancamentoMaoDeObraLocal[] | null = null;

function storageWebDisponivel(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function listaValida(valor: unknown): valor is LancamentoMaoDeObraLocal[] {
  return Array.isArray(valor) && valor.every((item) => Boolean(
    item && typeof item === 'object' && typeof item.id === 'string' &&
    Number.isSafeInteger(item.codAgenciador) && Number.isSafeInteger(item.codFazenda) &&
    Array.isArray(item.funcionarios) && item.funcionarios.length > 0,
  ));
}

async function gravar(lista: LancamentoMaoDeObraLocal[]): Promise<void> {
  memoria = lista;
  const json = JSON.stringify(lista);
  if (FileSystem.documentDirectory) {
    await FileSystem.writeAsStringAsync(ARQUIVO, json);
  } else if (storageWebDisponivel()) {
    window.localStorage.setItem(CHAVE_WEB, json);
  }
}

export async function carregarLancamentosMaoDeObraLocal(): Promise<LancamentoMaoDeObraLocal[]> {
  if (memoria) return [...memoria];
  try {
    const json = FileSystem.documentDirectory
      ? (await FileSystem.getInfoAsync(ARQUIVO)).exists ? await FileSystem.readAsStringAsync(ARQUIVO) : null
      : storageWebDisponivel() ? window.localStorage.getItem(CHAVE_WEB) : null;
    const lido = json ? JSON.parse(json) : [];
    memoria = listaValida(lido) ? lido : [];
  } catch {
    memoria = [];
  }
  return [...memoria];
}

export async function salvarLancamentoMaoDeObraLocal(lancamento: LancamentoMaoDeObraLocal): Promise<void> {
  const atuais = await carregarLancamentosMaoDeObraLocal();
  await gravar([lancamento, ...atuais.filter((item) => item.id !== lancamento.id)]);
}

export async function removerLancamentoMaoDeObraLocal(id: string): Promise<void> {
  const atuais = await carregarLancamentosMaoDeObraLocal();
  await gravar(atuais.filter((item) => item.id !== id));
}
