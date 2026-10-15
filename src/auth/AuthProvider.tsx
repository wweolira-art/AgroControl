import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { carregarSessao, limparSessao, salvarSessao } from '../services/session';
import { autenticarUsuario, encerrarSessao } from '../services/usuario';
import type { UsuarioSessao } from '../types/auth';

interface AuthContextValue {
  usuario: UsuarioSessao | null;
  pronto: boolean;
  isAdmin: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let ativo = true;
    void carregarSessao()
      .then((sessao) => {
        if (ativo) {
          setUsuario(sessao);
        }
      })
      .catch(() => { if (ativo) setUsuario(null); })
      .finally(() => {
        if (ativo) {
          setPronto(true);
        }
      });
    return () => {
      ativo = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      usuario,
      pronto,
      isAdmin: usuario?.perfil === 'admin',
      entrar: async (email: string, senha: string) => {
        const sessao = await autenticarUsuario(email, senha);
        await salvarSessao(sessao);
        setUsuario(sessao);
      },
      sair: async () => {
        await encerrarSessao().catch(() => undefined);
        await limparSessao();
        setUsuario(null);
      },
    }),
    [usuario, pronto],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth precisa estar dentro de AuthProvider.');
  }
  return ctx;
}
