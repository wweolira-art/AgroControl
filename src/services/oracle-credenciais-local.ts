import axios from 'axios';
import { cabecalhosApiPublica } from './api-url';
import * as SecureStore from 'expo-secure-store';

import { obterUrlApiCustos } from './oracle-conexao';

const CHAVE = 'elejotaagro.oracle.credenciais';

export type CredenciaisOracleLocal = {
  usuario: string;
  senha: string;
};

let memoria: CredenciaisOracleLocal | null = null;

async function persistenciaDisponivel(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function lerCredenciaisOracleLocal(): Promise<CredenciaisOracleLocal | null> {
  if (memoria?.usuario && memoria.senha) {
    return memoria;
  }
  try {
    if (!(await persistenciaDisponivel())) {
      return memoria;
    }
    const json = await SecureStore.getItemAsync(CHAVE);
    if (!json) {
      return null;
    }
    const dados = JSON.parse(json) as CredenciaisOracleLocal;
    if (!dados?.usuario || !dados.senha) {
      return null;
    }
    memoria = { usuario: String(dados.usuario).trim(), senha: String(dados.senha) };
    return memoria;
  } catch {
    return null;
  }
}

export async function salvarCredenciaisOracleLocal(
  usuario: string,
  senha: string,
): Promise<CredenciaisOracleLocal> {
  const atual = await lerCredenciaisOracleLocal();
  const usuarioOk = usuario.trim();
  const senhaOk = senha !== '' ? senha : atual?.senha ?? '';
  if (!usuarioOk) {
    throw new Error('Informe o usuário CSCLIENTE.');
  }
  if (usuarioOk.toUpperCase() === 'CONSULTA') {
    throw new Error('CONSULTA só importa cadastros (SELECT no PC). Para INSERT grave CSCLIENTE.');
  }
  if (!senhaOk) {
    throw new Error('Informe a senha do banco.');
  }
  const gravado = { usuario: usuarioOk, senha: senhaOk };
  memoria = gravado;
  if (await persistenciaDisponivel()) {
    await SecureStore.setItemAsync(CHAVE, JSON.stringify(gravado));
  }
  return gravado;
}

/** Cabeçalhos enviados ao AgroControl-api-public (o PC usa para abrir o Oracle). */
export async function cabecalhosOracleBanco(): Promise<Record<string, string>> {
  const cred = await lerCredenciaisOracleLocal();
  const headers = await cabecalhosApiPublica();
  if (cred) {
    headers['X-Oracle-User'] = encodeURIComponent(cred.usuario);
    headers['X-Oracle-Password'] = encodeURIComponent(cred.senha);
  }
  return headers;
}

export async function testarCredenciaisOracleNoPc(
  usuario: string,
  senha: string,
): Promise<{ ok: boolean; mensagem: string }> {
  const apiBase = await obterUrlApiCustos();
  const { data } = await axios.post<{ ok?: boolean; mensagem?: string }>(
    `${apiBase}/api/oracle-config/test`,
    { usuario, senha },
    { timeout: 25_000, headers: await cabecalhosOracleBanco() },
  );
  return {
    ok: data.ok !== false,
    mensagem: data.mensagem || `AgroControl-api-public conectou como ${usuario}.`,
  };
}
