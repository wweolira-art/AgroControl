import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../src/auth/AuthProvider';
import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import { criarUsuario, listarUsuarios } from '../src/services/usuario';
import { colors } from '../src/theme/colors';
import type { UsuarioLista } from '../src/types/auth';

export default function UsuariosScreen() {
  const router = useRouter();
  const { isAdmin, pronto } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [admin, setAdmin] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (pronto && !isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, pronto, router]);

  const recarregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      setUsuarios(await listarUsuarios());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível listar os usuários.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void recarregar();
    }
  }, [isAdmin]);

  const cadastrar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await criarUsuario({ nome, email, senha, admin });
      setNome('');
      setEmail('');
      setSenha('');
      setAdmin(false);
      await recarregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível criar o usuário.');
    } finally {
      setSalvando(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header subtitle="Usuários · acesso admin" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable onPress={() => router.replace('/')} style={styles.back}>
          <Text style={styles.backText}>← Início</Text>
        </Pressable>

        <Text style={styles.section}>Novo usuário</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Nome</Text>
          <TextInput value={nome} onChangeText={setNome} style={styles.input} placeholder="Nome completo" placeholderTextColor={colors.muted} />
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            placeholder="email@fazenda.com"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Senha</Text>
          <TextInput value={senha} onChangeText={setSenha} secureTextEntry style={styles.input} placeholder="Senha" placeholderTextColor={colors.muted} />
          <View style={styles.switchRow}>
            <Text style={styles.labelSwitch}>Perfil administrador</Text>
            <Switch value={admin} onValueChange={setAdmin} trackColor={{ true: colors.leaf }} />
          </View>
          {erro ? <Text style={styles.erro}>{erro}</Text> : null}
          <View style={styles.botao}>
            <ActionButton label="Cadastrar" onPress={() => void cadastrar()} loading={salvando} disabled={!nome || !email || !senha} />
          </View>
        </View>

        <Text style={styles.section}>Cadastrados</Text>
        <View style={styles.card}>
          {carregando ? (
            <Text style={styles.meta}>Carregando…</Text>
          ) : usuarios.length === 0 ? (
            <Text style={styles.meta}>Nenhum usuário na API.</Text>
          ) : (
            usuarios.map((item) => (
              <View key={item.idUsuario} style={styles.item}>
                <View style={styles.itemHead}>
                  <Text style={styles.itemTitle}>{item.nome}</Text>
                  <Text style={[styles.badge, item.perfil === 'admin' ? styles.badgeAdmin : styles.badgeOp]}>
                    {item.perfil === 'admin' ? 'ADMIN' : 'OPERADOR'}
                  </Text>
                </View>
                <Text style={styles.meta}>{item.email}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  back: {
    marginBottom: 16,
  },
  backText: {
    color: colors.leaf,
    fontWeight: '700',
  },
  section: {
    fontWeight: '800',
    color: colors.forest,
    marginBottom: 10,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 20,
  },
  label: {
    color: colors.muted,
    fontWeight: '700',
  },
  labelSwitch: {
    color: colors.ink,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  botao: {
    marginTop: 8,
    flexDirection: 'row',
  },
  erro: {
    color: colors.danger,
    fontWeight: '700',
  },
  item: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.creamDark,
    gap: 4,
  },
  itemHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    color: colors.forest,
    fontWeight: '800',
    flex: 1,
  },
  meta: {
    color: colors.muted,
    fontWeight: '600',
  },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  badgeAdmin: {
    color: colors.forest,
    backgroundColor: colors.gold,
  },
  badgeOp: {
    color: colors.leaf,
    backgroundColor: colors.creamDark,
  },
});
