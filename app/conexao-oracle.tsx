import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../src/auth/AuthProvider';
import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import { env } from '../src/config/env';
import { obterUrlApiCustos } from '../src/services/oracle-conexao';
import {
  lerCredenciaisOracleLocal,
  salvarCredenciaisOracleLocal,
  testarCredenciaisOracleNoPc,
} from '../src/services/oracle-credenciais-local';
import { colors } from '../src/theme/colors';

export default function ConexaoOracleScreen() {
  const router = useRouter();
  const { isAdmin, pronto } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaDefinida, setSenhaDefinida] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [urlApi, setUrlApi] = useState('');

  useEffect(() => {
    void obterUrlApiCustos()
      .then(setUrlApi)
      .catch(() => setUrlApi(env.apiUrl || ''));
  }, []);

  useEffect(() => {
    if (pronto && !isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, pronto, router]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    let ativo = true;
    setCarregando(true);
    void lerCredenciaisOracleLocal()
      .then((cred) => {
        if (!ativo) {
          return;
        }
        if (cred) {
          setUsuario(cred.usuario);
          setSenhaDefinida(true);
        } else {
          setUsuario('CSCLIENTE');
        }
      })
      .finally(() => {
        if (ativo) {
          setCarregando(false);
        }
      });
    return () => {
      ativo = false;
    };
  }, [isAdmin]);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    setStatus(null);
    try {
      const gravado = await salvarCredenciaisOracleLocal(usuario, senha);
      setUsuario(gravado.usuario);
      setSenha('');
      setSenhaDefinida(true);
      setStatus(
        'CSCLIENTE gravado neste celular. Importação de cadastros continua com CONSULTA no PC. INSERT usa CSCLIENTE.',
      );
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const testar = async () => {
    setTestando(true);
    setErro(null);
    setStatus(null);
    try {
      const senhaUso = senha || (await lerCredenciaisOracleLocal())?.senha || '';
      if (!usuario.trim() || !senhaUso) {
        throw new Error('Informe usuário e senha do banco.');
      }
      await salvarCredenciaisOracleLocal(usuario, senhaUso);
      const resultado = await testarCredenciaisOracleNoPc(usuario.trim(), senhaUso);
      setSenha('');
      setSenhaDefinida(true);
      setStatus(resultado.mensagem);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha ao testar no AgroControl-api-public.');
    } finally {
      setTestando(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header subtitle="Oracle · usuário e senha no celular" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable onPress={() => router.replace('/')} style={styles.back}>
          <Text style={styles.backText}>← Início</Text>
        </Pressable>

        <Text style={styles.section}>CSCLIENTE · INSERT (somente admin)</Text>
        <Text style={styles.ajuda}>
          CONSULTA importa cadastros no AgroControl-api-public do outro PC (SELECT). CSCLIENTE fica neste celular e
          só o admin altera; é o usuário do INSERT. Operadores não vêem esta tela. API: {urlApi || env.apiUrl || '—'}.
        </Text>

        <View style={styles.card}>
          {carregando ? <Text style={styles.meta}>Lendo credenciais locais…</Text> : null}

          <Text style={[styles.badge, senhaDefinida ? styles.badgeOk : styles.badgeOff]}>
            {senhaDefinida ? 'GRAVADO NO CELULAR' : 'AINDA SEM SENHA'}
          </Text>

          <Text style={styles.label}>Usuário de INSERT</Text>
          <TextInput
            value={usuario}
            onChangeText={setUsuario}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!carregando}
            style={styles.input}
            placeholder="CSCLIENTE"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>Senha do banco</Text>
          <TextInput
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            autoCapitalize="none"
            editable={!carregando}
            style={styles.input}
            placeholder={senhaDefinida ? 'Deixe em branco para manter a senha atual' : 'Senha do Oracle'}
            placeholderTextColor={colors.muted}
          />

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}
          {status ? <Text style={styles.ok}>{status}</Text> : null}

          <View style={styles.botoes}>
            <ActionButton
              label="Testar no PC"
              variant="ghost"
              onPress={() => void testar()}
              loading={testando}
              disabled={carregando || salvando || !usuario}
            />
            <ActionButton
              label="Salvar no celular"
              onPress={() => void salvar()}
              loading={salvando}
              disabled={carregando || testando || !usuario}
            />
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  back: { marginBottom: 16 },
  backText: { color: colors.leaf, fontWeight: '700' },
  section: { fontWeight: '800', color: colors.forest, marginBottom: 8 },
  ajuda: { color: colors.muted, fontWeight: '600', marginBottom: 14, lineHeight: 20 },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: 16, gap: 8 },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  badgeOk: { color: colors.forest, backgroundColor: colors.gold },
  badgeOff: { color: colors.leaf, backgroundColor: colors.creamDark },
  label: { color: colors.muted, fontWeight: '700', marginTop: 4 },
  input: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontWeight: '600',
  },
  botoes: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  erro: { color: colors.danger, fontWeight: '700' },
  ok: { color: colors.success, fontWeight: '700' },
  meta: { color: colors.muted, fontWeight: '600' },
});
