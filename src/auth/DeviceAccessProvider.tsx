import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthProvider';
import { carregarAcessoUsuario, cacheAcessoUsuario, lerCacheAcessoUsuario } from '../services/device-access';
import type { AbaDispositivo, AcessoUsuario } from '../config/device-tabs';
import { ABAS_OBRIGATORIAS } from '../config/device-tabs';

interface DeviceContext {
  acesso: AcessoUsuario | null; email: string; pronto: boolean; erro: string;
  pode: (aba: AbaDispositivo) => boolean; atualizar: () => Promise<void>;
}
const Context = createContext<DeviceContext | null>(null);
export function DeviceAccessProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [acesso, setAcesso] = useState<AcessoUsuario | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');
  const generation = useRef(0);
  const atualizar = useCallback(async () => {
    if (!usuario) return;
    const version = generation.current;
    try {
      const value = await carregarAcessoUsuario(usuario.email);
      if (version !== generation.current) return;
      setAcesso(value); setErro('');
      await cacheAcessoUsuario(usuario.email, value).catch(() => undefined);
    } catch (error) {
      if (version === generation.current) {
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403 || status === 404) {
          setAcesso(null); await cacheAcessoUsuario(usuario.email, null).catch(() => undefined);
        }
        setErro(error instanceof Error ? error.message : 'Falha ao carregar acesso.');
      }
    } finally { if (version === generation.current) setPronto(true); }
  }, [usuario]);
  useEffect(() => {
    generation.current++;
    setAcesso(null); setPronto(!usuario); setErro('');
    if (!usuario) return;
    const version = generation.current;
    void lerCacheAcessoUsuario(usuario.email).then(cache => {
      if (version !== generation.current) return;
      if (cache) { setAcesso(cache); setPronto(true); }
      void atualizar();
    });
    const state = AppState.addEventListener('change', value => { if (value === 'active') void atualizar(); });
    const interval = setInterval(() => { if (AppState.currentState === 'active') void atualizar(); }, 30000);
    return () => { generation.current++; state.remove(); clearInterval(interval); };
  }, [usuario, atualizar]);
  return <Context.Provider value={{ acesso, email: usuario?.email ?? '', pronto, erro,
    pode: aba => !!usuario && (ABAS_OBRIGATORIAS.includes(aba) || (acesso?.email === usuario.email.trim().toLowerCase() && acesso.abas.includes(aba))), atualizar }}>{children}</Context.Provider>;
}
export function useDeviceAccess() {
  const value = useContext(Context);
  if (!value) throw new Error('DeviceAccessProvider ausente.');
  return value;
}
