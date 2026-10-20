import type { AssistenteRequest, LocalizacaoContextoGpt, LocalizacaoResponse } from '../types/api';
import { perguntarAssistente } from './api';

/**
 * Integração futura com OpenAI/GPT.
 *
 * Regras:
 * - O GPT NÃO obtém GPS e NÃO identifica fazenda/talhão.
 * - GPS vem do celular; fazenda/talhão vêm da API/Oracle (ou GeoJSON offline).
 * - Nenhuma chave da OpenAI deve existir neste aplicativo.
 *   TODO GPT: configurar OPENAI_API_KEY apenas no servidor da API.
 */
export function montarContextoGpt(localizacao: LocalizacaoResponse): LocalizacaoContextoGpt {
  return {
    latitude: localizacao.latitude,
    longitude: localizacao.longitude,
    fazenda: localizacao.fazenda?.nome,
    codigoFazenda: localizacao.fazenda?.codigo,
    talhao: localizacao.talhao?.codigo,
  };
}

export async function consultarAssistente(pergunta: string, localizacao: LocalizacaoResponse) {
  const payload: AssistenteRequest = {
    pergunta,
    contexto: montarContextoGpt(localizacao),
  };
  return perguntarAssistente(payload);
}
