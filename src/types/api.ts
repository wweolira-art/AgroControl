export interface FazendaDto {
  codigo: number;
  nome: string;
}

export interface TalhaoDto {
  codigo: number;
}

/**
 * Contrato REST da API de localização.
 * GET /api/localizacao?latitude=-21.123456&longitude=-48.123456
 */
export interface LocalizacaoResponse {
  encontrado: boolean;
  mensagem?: string;
  fazenda?: FazendaDto;
  talhao?: TalhaoDto;
  latitude: number;
  longitude: number;
  extras?: {
    campo?: string;
    produtor?: string;
    secId?: string;
    propriedades?: Record<string, unknown>;
  };
  origem?: 'api' | 'offline' | 'mock';
}

export interface LocalizacaoContextoGpt {
  latitude: number;
  longitude: number;
  fazenda?: string;
  codigoFazenda?: number;
  talhao?: number;
}

export interface AssistenteRequest {
  pergunta: string;
  contexto: LocalizacaoContextoGpt;
}

export interface AssistenteResponse {
  resposta: string;
}

/** Linha da AutoREST ORDS `conexao_banco`. */
export interface ConexaoBancoOrds {
  id?: number;
  usuario: string;
  senha?: string;
  host: string;
  porta?: number | string;
  service_name?: string;
  descricao?: string;
  ativo?: number;
  data_cadastro?: string | null;
}

/** Configuração pública da conexão Oracle. A senha nunca vai para a tela do operador. */
export interface OracleConfigPublica {
  id?: number;
  usuario: string;
  host: string;
  porta: string;
  servico: string;
  connectString: string;
  descricao: string;
  instantClientDir: string;
  useOracle: boolean;
  senhaDefinida: boolean;
  credenciaisPreenchidas: boolean;
  configurado: boolean;
}

export interface OracleConfigEntrada {
  usuario: string;
  senha?: string;
  host: string;
  porta: string;
  servico: string;
  connectString?: string;
  descricao?: string;
  instantClientDir?: string;
  useOracle?: boolean;
}

export interface OracleConfigTeste {
  ok: boolean;
  mensagem: string;
  usuario?: string;
}
