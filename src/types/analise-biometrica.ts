export interface RegistroAnaliseBiometrica {
  [campo: string]: unknown;
}

export interface ItemAnaliseBiometrica {
  codItem: number;
  descricao: string;
}

export interface PontoAnaliseBiometrica {
  codPonto: number;
  descricao: string;
}

export interface CadastrosAnaliseBiometrica {
  itens: ItemAnaliseBiometrica[];
  pontos: PontoAnaliseBiometrica[];
  importadoEm: string;
}

export interface LancamentoAnaliseBiometrica {
  selfUrl: string;
  data: string;
  codPonto: number;
  codItem: number;
  codFazenda: number;
  codTalhao: number;
  variedade: string;
  valor: number;
  usuario: string;
}

export interface LancamentoAnaliseBiometricaEntrada {
  data: string;
  codPonto: number;
  codItem: number;
  codFazenda: number;
  codTalhao: number;
  variedade: string;
  valor: number;
  usuario?: string;
}
