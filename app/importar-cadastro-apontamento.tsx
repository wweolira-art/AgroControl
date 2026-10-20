import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import { env } from '../src/config/env';
import {
  importarCadastrosOracle,
  obterCadastrosApontamento,
  resumoCadastros,
} from '../src/services/apontamento';
import { limparCadastrosLocal } from '../src/services/apontamento-local';
import { salvarUrlApiPublica } from '../src/services/api-url';
import { obterUrlApiCustos } from '../src/services/oracle-conexao';
import { colors } from '../src/theme/colors';
import type { CadastrosApontamento } from '../src/types/apontamento';

export default function ImportarCadastroApontamentoScreen() {
  const router = useRouter();
  const [cadastros, setCadastros] = useState<CadastrosApontamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [urlApi, setUrlApi] = useState<string>('');
  const [urlDigitada, setUrlDigitada] = useState<string>('');
  const [salvandoUrl, setSalvandoUrl] = useState(false);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    setSucesso(null);
    try {
      setCadastros(await obterCadastrosApontamento());
      try {
        const url = await obterUrlApiCustos();
        setUrlApi(url);
        setUrlDigitada(url);
      } catch {
        setUrlApi(env.apiUrl || '');
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível ler os cadastros locais.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void recarregar();
    }, [recarregar]),
  );

  const importar = () => {
    Alert.alert(
      'Importar cadastros',
      'Baixa fazendas, talhões, materiais da família 44, operações, funcionários e meios de aplicação do Oracle e grava no celular para uso offline.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setImportando(true);
            setErro(null);
            setSucesso(null);
            try {
              const resultado = await importarCadastrosOracle();
              setCadastros(resultado.cadastros);
              setSucesso(
                `Cadastros importados da API · ${resumoCadastros(resultado.cadastros)}`,
              );
            } catch (falha) {
              setErro(falha instanceof Error ? falha.message : 'Falha na importação.');
            } finally {
              setImportando(false);
            }
          },
        },
      ],
    );
  };

  const limpar = () => {
    Alert.alert('Limpar cadastros', 'Remove os cadastros salvos neste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar',
        style: 'destructive',
        onPress: async () => {
          await limparCadastrosLocal();
          setCadastros(null);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header subtitle="Cadastros · apontamento offline" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Voltar</Text>
        </Pressable>

        <Text style={styles.intro}>
          Importe fazendas, talhões, materiais da família 44, operações, funcionários e meios de aplicação para preencher o lançamento. O apontamento em
          si é gravado (INSERT) na API do PC, nas tabelas tmp do ERP — o app não procura apontamento
          existente.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>AgroControl-api-public</Text>
          <Text style={styles.cardLinha}>Em uso: {urlApi || env.apiUrl || 'nenhuma'}</Text>
          <Text style={styles.cardSub}>
            O banco é acessado só nesse PC. Lá: AgroControl-API.cmd ou npm run public. Padrão: {env.apiUrl}
          </Text>
          <TextInput
            style={styles.input}
            value={urlDigitada}
            onChangeText={setUrlDigitada}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={env.apiUrl || 'https://….ngrok-free.dev'}
            placeholderTextColor={colors.muted}
          />
          <ActionButton
            label={salvandoUrl ? 'Salvando…' : 'Usar esta URL'}
            variant="secondary"
            disabled={salvandoUrl}
            onPress={() => {
              void (async () => {
                setSalvandoUrl(true);
                setErro(null);
                try {
                  const url = await salvarUrlApiPublica(urlDigitada);
                  setUrlApi(url);
                  setUrlDigitada(url);
                  setSucesso(`URL da API gravada neste celular: ${url}`);
                } catch (falha) {
                  setErro(falha instanceof Error ? falha.message : 'Não foi possível gravar a URL.');
                } finally {
                  setSalvandoUrl(false);
                }
              })();
            }}
          />
        </View>

        {carregando ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : null}
        {erro ? <Text style={styles.erro}>{erro}</Text> : null}
        {sucesso ? <Text style={styles.ok}>{sucesso}</Text> : null}

        {!carregando ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitulo}>Armazenamento local</Text>
              <Text style={styles.cardLinha}>{resumoCadastros(cadastros)}</Text>
              {cadastros?.importadoEm ? (
                <Text style={styles.cardSub}>
                  Última importação: {new Date(cadastros.importadoEm).toLocaleString('pt-BR')}
                </Text>
              ) : (
                <Text style={styles.cardSub}>Importe os cadastros antes de usar o apontamento.</Text>
              )}
            </View>

            {cadastros ? (
              <View style={styles.card}>
                <Text style={styles.cardTitulo}>Detalhes</Text>
                <Text style={styles.cardLinha}>Fazendas: {cadastros.fazendas.length}</Text>
                <Text style={styles.cardLinha}>Talhões: {cadastros.talhoes.length}</Text>
                <Text style={styles.cardLinha}>Materiais: {cadastros.materiais.length}</Text>
                <Text style={styles.cardLinha}>Operações: {cadastros.operacoes.length}</Text>
                <Text style={styles.cardLinha}>Funcionários: {cadastros.funcionarios?.length ?? 0}</Text>
                <Text style={styles.cardLinha}>Meios de aplicação: {cadastros.meiosAplicacao?.length ?? 0}</Text>
              </View>
            ) : null}

            <ActionButton
              label={importando ? 'Importando…' : 'Importar do Oracle'}
              onPress={() => void importar()}
              disabled={importando}
              loading={importando}
            />

            <ActionButton
              label="Ir para Insumos"
              variant="secondary"
              onPress={() => router.push('/apontamento')}
              disabled={!cadastros}
            />

            <ActionButton
              label="Apontamentos salvos no celular"
              variant="ghost"
              onPress={() => router.push('/apontamentos-locais')}
            />

            {cadastros ? (
              <ActionButton label="Limpar cadastros locais" variant="ghost" onPress={() => void limpar()} />
            ) : null}
          </>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 10 },
  back: { marginBottom: 12 },
  backText: { color: colors.leaf, fontWeight: '700' },
  intro: { color: colors.muted, fontWeight: '600', lineHeight: 18, marginBottom: 16 },
  loader: { marginVertical: 24 },
  erro: { color: colors.danger, fontWeight: '700', marginBottom: 12 },
  ok: { color: colors.success, fontWeight: '700', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.creamDark,
  },
  cardTitulo: { color: colors.forest, fontWeight: '800', fontSize: 16, marginBottom: 8 },
  cardLinha: { color: colors.ink, fontWeight: '600', marginBottom: 4 },
  cardSub: { color: colors.muted, fontWeight: '600', fontSize: 12, marginTop: 6, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.creamDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontWeight: '600',
    marginBottom: 12,
    backgroundColor: colors.cream,
  },
});
