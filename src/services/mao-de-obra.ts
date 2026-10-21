import axios from 'axios';
import { cabecalhosApiPublica, mensagemErroApi } from './api-url';
import { obterUrlApiCustos } from './oracle-conexao';

export interface ServicoMaoDeObra { codAtividade: number; descricao: string; codTabelaPreco: number; valorUnitario: number | null }
export type { TurmaCadastro as TurmaMaoDeObra } from '../types/apontamento';
import type { TurmaCadastro as TurmaMaoDeObra } from '../types/apontamento';
export interface LancamentoMaoDeObra {
  codAgenciador: number; codGrupoempresaTurma: number;
  codFuncionario: number; codFazenda: number; codTalhao: number;
  codOperacao: number; quantidade: 1; dataApontamento: string; observacao: string;
}

export async function listarTurmasMaoDeObra(): Promise<TurmaMaoDeObra[]> {
  const base = await obterUrlApiCustos();
  try {
    const { data } = await axios.get<TurmaMaoDeObra[]>(`${base}/api/apontamento/mao-de-obra/turmas`, {
      headers: await cabecalhosApiPublica(), timeout: 60000,
    });
    return data;
  } catch (error) { throw mensagemErroApi(error, base, 'Falha ao carregar turmas.'); }
}

export async function listarServicosMaoDeObra(codFazenda: number, dataApontamento: string): Promise<ServicoMaoDeObra[]> {
  const base = await obterUrlApiCustos();
  try {
    const { data } = await axios.get<ServicoMaoDeObra[]>(`${base}/api/apontamento/mao-de-obra/servicos`, {
      headers: await cabecalhosApiPublica(), timeout: 60000,
      params: { codFazenda, data: dataApontamento },
    });
    return data;
  } catch (error) { throw mensagemErroApi(error, base, 'Falha ao carregar serviços.'); }
}

export async function gravarMaoDeObra(entrada: LancamentoMaoDeObra): Promise<{ mensagem: string }> {
  const base = await obterUrlApiCustos();
  try {
    const { data } = await axios.post<{ mensagem: string }>(`${base}/api/apontamento/mao-de-obra`, entrada, {
      headers: await cabecalhosApiPublica(), timeout: 60000,
    });
    return data;
  } catch (error) { throw mensagemErroApi(error, base, 'Falha ao gravar lançamento.'); }
}

export async function gravarMaoDeObraParaFuncionarios(
  dados: Omit<LancamentoMaoDeObra, 'codFuncionario'>,
  funcionarios: number[],
  aoConfirmar: (codigo: number) => void,
): Promise<number> {
  const codigos = [...new Set(funcionarios)];
  if (!codigos.length || codigos.some(codigo => !Number.isSafeInteger(codigo) || codigo <= 0)) {
    throw new Error('Adicione funcionários válidos ao apontamento.');
  }
  let confirmados = 0;
  for (const codigo of codigos) {
    try {
      await gravarMaoDeObra({ ...dados, codFuncionario: codigo, quantidade: 1 });
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : 'Falha ao gravar.';
      throw new Error(`${confirmados} lançamento(s) confirmado(s). Falha no funcionário ${codigo}: ${detalhe} Confira no sistema se ele foi gravado antes de tentar novamente. Os demais funcionários ainda não foram enviados.`);
    }
    confirmados++;
    aoConfirmar(codigo);
  }
  return confirmados;
}
