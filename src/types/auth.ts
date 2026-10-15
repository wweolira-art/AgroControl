export type PerfilUsuario = 'admin' | 'operador';

export interface UsuarioSessao {
  idUsuario: number;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  token: string;
  expiraEm: string;
}

export interface UsuarioLista {
  idUsuario: number;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  dataCadastro: string | null;
  dataUltimoLogin: string | null;
}
