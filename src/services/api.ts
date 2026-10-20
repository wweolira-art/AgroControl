import axios, { type AxiosInstance } from 'axios';
import { cabecalhosApiPublica } from './api-url';
import * as Network from 'expo-network';

import { env } from '../config/env';
import type { AssistenteRequest, AssistenteResponse, LocalizacaoResponse } from '../types/api';
import { identificarLocalmente } from './offline';

/**
 * Camada HTTP do aplicativo.
 *
 * TODO API: EXPO_PUBLIC_API_URL aponta para o backend REST.
 * TODO ORACLE: o endpoint /api/localizacao fará a consulta espacial.
 * A sessão emitida pela API é enviada no interceptor abaixo.
 * TODO GPT: a chave da OpenAI deve existir SOMENTE no backend.
 */
function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: env.apiUrl,
    timeout: 12_000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  client.interceptors.request.use(async (config) => {
    const headers = await cabecalhosApiPublica();
    if (headers.Authorization) config.headers.Authorization = headers.Authorization;
    config.headers['ngrok-skip-browser-warning'] = 'true';
    return config;
  });

  return client;
}

const http = createClient();

async function consultarApiRemota(latitude: number, longitude: number): Promise<LocalizacaoResponse> {
  const { data } = await http.get<LocalizacaoResponse>('/api/localizacao', {
    params: { latitude, longitude },
  });
  return { ...data, origem: data.origem ?? 'api' };
}

/**
 * GET /api/localizacao?latitude=&longitude=
 *
 * Com mock ligado (padrão), a resposta usa os polígonos da API mapa_talhao
 * já carregados no aparelho.
 */
export async function consultarLocalizacao(latitude: number, longitude: number): Promise<LocalizacaoResponse> {
  if (env.useMockApi) {
    return { ...identificarLocalmente(latitude, longitude), origem: 'mock' };
  }

  const network = await Network.getNetworkStateAsync();
  const online = Boolean(network.isConnected && network.isInternetReachable !== false);

  if (!online) {
    return identificarLocalmente(latitude, longitude);
  }

  try {
    return await consultarApiRemota(latitude, longitude);
  } catch {
    return identificarLocalmente(latitude, longitude);
  }
}

/**
 * TODO GPT: encaminha pergunta + contexto GPS/fazenda/talhão ao backend.
 * O GPT NÃO descobre a localização — apenas interpreta o contexto já resolvido.
 */
export async function perguntarAssistente(payload: AssistenteRequest): Promise<AssistenteResponse> {
  if (env.useMockApi) {
    return {
      resposta:
        'Assistente de IA ainda não está conectado. O contexto de fazenda/talhão já está pronto para ser enviado ao backend.',
    };
  }

  const { data } = await http.post<AssistenteResponse>('/api/assistente', payload);
  return data;
}

export {
  obterConfigOracleInsumos,
  salvarConfigOracleInsumos,
  testarConfigOracleInsumos,
} from './oracle-conexao';

export { http };
