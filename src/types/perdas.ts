export interface TipoCorteCadastro {
  codTipocorte: number;
  descricao: string;
}

export interface TipoPerdaCadastro {
  codTipoperda: number;
  descricao: string;
  codTipocorte: number;
}

export interface FrenteCadastro {
  codFrente: number;
  descricao: string;
}

export interface EquipamentoCadastro {
  codEquipamento: number;
  descricao: string;
}

export interface OperadorCadastro {
  codOperador: number;
  nome: string;
}

export interface TalhaoPerdaCadastro {
  codFazenda: number;
  codTalhao: number;
  zona: number;
  areaHa: number | null;
  descricao: string;
  codSafra: number;
  codSafradetalhe: number;
}

export interface FazendaPerdaCadastro {
  codFazenda: number;
  nome: string;
}

export interface ParametrosPerdaCadastro {
  areaAmostraMecanizada: number;
  areaAmostraManual: number;
  metaMecanizada: number;
  metaManual: number;
  codGrupoempresa: number;
  codEmpresa: number;
  codFilial: number;
}

export interface CadastrosPerda {
  fazendas: FazendaPerdaCadastro[];
  talhoes: TalhaoPerdaCadastro[];
  tiposCorte: TipoCorteCadastro[];
  tiposPerda: TipoPerdaCadastro[];
  frentes: FrenteCadastro[];
  equipamentos: EquipamentoCadastro[];
  operadores: OperadorCadastro[];
  parametros: ParametrosPerdaCadastro;
}

export interface PerdaItemEntrada {
  codTipoperda: number;
  quantidade: number;
}

export interface PerdaEntrada {
  codTipocorte: number;
  codFazenda: number;
  codTalhao: number;
  zona?: number;
  codSafra?: number;
  codSafradetalhe?: number;
  dataAmostra?: string;
  turno?: string;
  codFrente?: number | null;
  codEquipamento?: number | null;
  codOperador?: number | null;
  tipoOperador?: string;
  bituca?: string;
  latitude?: string | null;
  longitude?: string | null;
  itens: PerdaItemEntrada[];
}

export interface PerdaGravada {
  numeroAmostra: number;
  codSafra: number;
  itens: number;
}

export interface PerdaItemRascunho extends PerdaItemEntrada {
  descricao: string;
}

export interface PerdaRascunho {
  id: string;
  codTipocorte: number;
  nomeTipocorte: string;
  codFazenda: number;
  nomeFazenda: string;
  codTalhao: number;
  nomeTalhao: string;
  zona: number;
  codSafra: number;
  codSafradetalhe: number;
  dataAmostra: string;
  turno: string;
  codFrente?: number | null;
  nomeFrente?: string;
  codEquipamento?: number | null;
  nomeEquipamento?: string;
  codOperador?: number | null;
  nomeOperador?: string;
  tipoOperador?: string;
  bituca: string;
  latitude?: string | null;
  longitude?: string | null;
  itens: PerdaItemRascunho[];
  criadoEm: string;
  syncStatus: 'pendente' | 'enviado' | 'erro';
  syncErro?: string;
  numeroAmostra?: number;
}

export function entradaOracleDaPerdaRascunho(rascunho: PerdaRascunho): PerdaEntrada {
  return {
    codTipocorte: rascunho.codTipocorte,
    codFazenda: rascunho.codFazenda,
    codTalhao: rascunho.codTalhao,
    zona: rascunho.zona,
    codSafra: rascunho.codSafra,
    codSafradetalhe: rascunho.codSafradetalhe,
    dataAmostra: rascunho.dataAmostra,
    turno: rascunho.turno,
    codFrente: rascunho.codFrente ?? null,
    codEquipamento: rascunho.codEquipamento ?? null,
    codOperador: rascunho.codOperador ?? null,
    tipoOperador: rascunho.tipoOperador,
    bituca: rascunho.bituca,
    latitude: rascunho.latitude ?? null,
    longitude: rascunho.longitude ?? null,
    itens: rascunho.itens.map((item) => ({
      codTipoperda: item.codTipoperda,
      quantidade: item.quantidade,
    })),
  };
}
