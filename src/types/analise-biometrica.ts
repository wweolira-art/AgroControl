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

export interface MotivoTchAnaliseBiometrica {
  codMotivo: number;
  descricao: string;
}

export interface CadastrosAnaliseBiometrica {
  itens: ItemAnaliseBiometrica[];
  pontos: PontoAnaliseBiometrica[];
  motivosTch: MotivoTchAnaliseBiometrica[];
  importadoEm: string;
}

export interface LancamentoAnaliseBiometrica {
  codigosMotivoTch?: number[];
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
  codigosMotivoTch?: number[];
  data: string;
  codPonto: number;
  codItem: number;
  codFazenda: number;
  codTalhao: number;
  variedade: string;
  valor: number;
  usuario?: string;
}
