import axios from 'axios';

import type { CadastrosPerda, PerdaEntrada, PerdaGravada } from '../types/perdas';
import {
  carregarCadastrosPerdaLocal,
  salvarCadastrosPerdaLocal,
} from './apontamento-local';
import { cabecalhosApiPublica, mensagemErroApi } from './api-url';
import { cabecalhosOracleBanco, lerCredenciaisOracleLocal } from './oracle-credenciais-local';
import { obterUrlApiCustos } from './oracle-conexao';

function erroApi(erro: unknown, apiBase: string, fallback: string): Error {
  return mensagemErroApi(erro, apiBase, fallback);
}

export async function obterCadastrosPerda(): Promise<CadastrosPerda> {
  const local = await carregarCadastrosPerdaLocal<CadastrosPerda>();
  const temLocal = Boolean(local && Array.isArray(local.fazendas) && local.fazendas.length > 0);
  if (temLocal) {
    return local as CadastrosPerda;
  }
  try {
    const apiBase = await obterUrlApiCustos();
    const { data } = await axios.get<CadastrosPerda>(`${apiBase}/api/perdas/cadastros`, {
      timeout: 180_000,
      headers: await cabecalhosApiPublica(),
    });
    await salvarCadastrosPerdaLocal(data);
    return data;
  } catch (erro) {
    if (local && Array.isArray(local.fazendas) && local.fazendas.length > 0) {
      return local;
    }
    throw erroApi(erro, '', 'Importe os cadastros com internet. Depois as perdas funcionam offline.');
  }
}

export async function enviarPerdaOracle(entrada: PerdaEntrada): Promise<PerdaGravada> {
  const apiBase = await obterUrlApiCustos();
  try {
    const cred = await lerCredenciaisOracleLocal();
    const payload = cred
      ? { ...entrada, oracleUsuario: cred.usuario, oracleSenha: cred.senha }
      : entrada;
    const { data } = await axios.post<PerdaGravada>(`${apiBase}/api/perdas`, payload, {
      timeout: 60_000,
      headers: await cabecalhosOracleBanco(),
    });
    return data;
  } catch (erro) {
    throw erroApi(erro, apiBase, 'Falha ao gravar a perda de colheita.');
  }
}
