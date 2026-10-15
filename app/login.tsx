import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../src/auth/AuthProvider';
import { ActionButton } from '../src/components/ActionButton';
import { Logo } from '../src/components/Logo';
import { colors } from '../src/theme/colors';

export default function LoginScreen() {
  const router = useRouter();
  const { entrar, usuario, pronto } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (pronto && usuario) {
      router.replace('/');
    }
  }, [pronto, router, usuario]);

  const enviar = async () => {
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
      router.replace('/');
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Logo tamanho={156} />
          <Text style={styles.brand}>Elejotaagro</Text>
          <Text style={styles.subtitle}>Entre para acessar o aplicativo</Text>

          <View style={styles.card}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="seu@email.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Text style={styles.label}>Senha</Text>
            <TextInput
              value={senha}
              onChangeText={setSenha}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              style={styles.input}
              onSubmitEditing={() => void enviar()}
            />
            {erro ? <Text style={styles.erro}>{erro}</Text> : null}
            <View style={styles.botao}>
              <ActionButton label="Entrar" onPress={() => void enviar()} loading={enviando} disabled={!email || !senha} />
            </View>
          </View>

          <Text style={styles.dica}>
            Depois do login você escolhe mapa, cadastros ou apontamentos salvos.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.forest,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  brand: {
    color: colors.cream,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    color: colors.accent,
    marginTop: 8,
    marginBottom: 28,
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  label: {
    color: colors.muted,
    fontWeight: '700',
    marginTop: 6,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.ink,
    fontWeight: '600',
  },
  erro: {
    color: colors.danger,
    fontWeight: '700',
    marginTop: 4,
  },
  botao: {
    marginTop: 12,
    flexDirection: 'row',
  },
  dica: {
    color: colors.creamDark,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 18,
  },
});
