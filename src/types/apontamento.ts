export interface FazendaCadastro {
  codFazenda: number;
  nome: string;
}

export interface TalhaoCadastro {
  codFazenda: number;
  codTalhao: number;
  zona: number;
  areaHa: number | null;
  descricao: string;
  codSafra: number | null;
}

export interface MaterialCadastro {
  codMaterial: number;
  descricao: string;
  codUnidade: string;
}

export interface OperacaoCadastro {
  codOperacao: number;
  descricao: string;
  codObjetocusto: number;
  codTipofazenda: number;
  codGrupoempresa: number;
  codEmpresa: number;
  codFilial: number;
}

export interface FuncionarioCadastro {
  codFuncionario: number;
  nome: string;
}

export interface MeioAplicacaoCadastro {
  codMeioaplicacao: number;
  descricao: string;
}

export interface TipoOperacaoCadastro {
  tipoOperacao: string;
  descricao: string;
}

/** Valores oficiais de agricola.tipooperacao (C = MANUAL, M = MECANIZADO). */
export const TIPOS_OPERACAO_ERP: TipoOperacaoCadastro[] = [
  { tipoOperacao: 'C', descricao: 'MANUAL' },
  { tipoOperacao: 'M', descricao: 'MECANIZADO' },
];

export interface TurmaCadastro { codAgenciador: number; codGrupoempresa: number }

export interface CadastrosApontamento {
  turmas?: TurmaCadastro[];
  fazendas: FazendaCadastro[];
  talhoes: TalhaoCadastro[];
  materiais: MaterialCadastro[];
  operacoes: OperacaoCadastro[];
  funcionarios: FuncionarioCadastro[];
  meiosAplicacao: MeioAplicacaoCadastro[];
  tiposOperacao: TipoOperacaoCadastro[];
  importadoEm: string;
}

export interface ItemMaterialApontamento {
  codMaterial: number;
  nomeMaterial: string;
  codUnidade: string;
  quantidade: number;
  dose: number;
}

export interface ApontamentoRascunho {
  id: string;
  codFazenda: number;
  nomeFazenda: string;
  codTalhao: number;
  nomeTalhao: string;
  zona: number;
  codSafra: number | null;
  codOperacao: number;
  nomeOperacao: string;
  tipoOperacao: string;
  codFuncionario: number;
  nomeFuncionario: string;
  codMeioaplicacao: number;
  nomeMeioaplicacao: string;
  /** Primeiro material — rascunhos antigos usam só estes campos. */
  codMaterial: number;
  nomeMaterial: string;
  codUnidade: string;
  dose: number;
  areaAplicada: number;
  quantidade: number;
  materiais?: ItemMaterialApontamento[];
  dataApontamento: string;
  criadoEm: string;
  syncStatus: 'pendente' | 'enviado' | 'erro';
  syncErro?: string;
  anoApontamento?: number;
  nrApontamento?: number;
  nrApontamentoGerado?: number;
  itemApontamentoGerado?: number;
}

export function materiaisDoRascunho(rascunho: ApontamentoRascunho): ItemMaterialApontamento[] {
  if (Array.isArray(rascunho.materiais) && rascunho.materiais.length > 0) {
    return rascunho.materiais.filter((item) => item.codMaterial > 0 && item.quantidade > 0);
  }
  if (rascunho.codMaterial > 0 && rascunho.quantidade > 0) {
    return [
      {
        codMaterial: rascunho.codMaterial,
        nomeMaterial: rascunho.nomeMaterial,
        codUnidade: rascunho.codUnidade,
        quantidade: rascunho.quantidade,
        dose: rascunho.dose ?? 0,
      },
    ];
  }
  return [];
}

export interface ItemMaterialEntrada {
  codMaterial: number;
  quantidade: number;
  dose?: number;
}

export interface ApontamentoEntrada {
  codFazenda: number;
  codTalhao: number;
  zona?: number;
  codSafra?: number | null;
  codOperacao: number;
  tipoOperacao?: string;
  codFuncionario: number;
  codMeioaplicacao: number;
  areaAplicada: number;
  codMaterial?: number;
  dose?: number;
  quantidade?: number;
  materiais?: ItemMaterialEntrada[];
  dataApontamento?: string;
  logon?: string;
}

export interface ApontamentoGravado {
  anoApontamento: number;
  nrApontamento: number;
  itemApontamento: number;
  nrApontamentoGerado: number;
  itemApontamentoGerado: number;
  quantidade: number;
}

export function rotuloTipoOperacao(codigo: string, tipos?: TipoOperacaoCadastro[]): string {
  const tipo = tipos?.find((item) => item.tipoOperacao === codigo);
  if (tipo?.descricao) {
    return tipo.descricao;
  }
  if (codigo === 'C') {
    return 'MANUAL';
  }
  if (codigo === 'M') {
    return 'MECANIZADO';
  }
  return codigo;
}
