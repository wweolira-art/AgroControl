import { useCallback, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthProvider';
import { useDeviceAccess } from '../src/auth/DeviceAccessProvider';
import { ABAS_DISPOSITIVO, ABAS_OBRIGATORIAS, type AcessoUsuario } from '../src/config/device-tabs';
import { consultarAcessoUsuario, listarAcessosUsuario, salvarAcessoUsuario } from '../src/services/device-access';
import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import { colors } from '../src/theme/colors';

export default function AcessoUsuariosScreen() {
  const { isAdmin, pronto } = useAuth();
  const { email: emailAtual, atualizar } = useDeviceAccess();
  const router = useRouter();
  const [lista, setLista] = useState<AcessoUsuario[]>([]);
  const [editando, setEditando] = useState<AcessoUsuario | null>(null);
  const [emailDigitado, setEmailDigitado] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const recarregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try { setLista(await listarAcessosUsuario()); }
    catch (error) { setErro(error instanceof Error ? error.message : 'Falha ao carregar liberações.'); }
    finally { setCarregando(false); }
  }, []);
  useFocusEffect(useCallback(() => { if (isAdmin) void recarregar(); }, [isAdmin, recarregar]));
  if (!pronto) return <ActivityIndicator />;
  if (!isAdmin) return <Redirect href="/" />;

  async function salvar() {
    if (!editando || salvando) return;
    setSalvando(true); setErro(''); setSucesso('');
    try {
      const value = await salvarAcessoUsuario(editando.email, editando.abas);
      setLista(current => [...current.filter(item => item.email !== value.email), value]);
      setEditando(value); setSucesso('Abas liberadas atualizadas.');
      if (value.email === emailAtual) await atualizar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao salvar.');
      // A ORDS altera uma linha por chamada; em falha parcial, mostra o estado real.
      setEditando(await consultarAcessoUsuario(editando.email).catch(() => null));
    }
    finally { setSalvando(false); }
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <Header subtitle="Administração · acesso por e-mail" />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable disabled={salvando} onPress={() => router.back()}><Text style={styles.link}>← Voltar</Text></Pressable>
      <Text style={styles.title}>Abas por e-mail</Text>
      <Text>Informe o e-mail cadastrado ou selecione uma liberação abaixo. Somente as abas marcadas ficarão visíveis em qualquer aparelho em que esse usuário entrar.</Text>
      <Text>Cadastros e Apontamentos salvos são obrigatórios para todos e não podem ser desmarcados. As funções administrativas continuam exclusivas de administradores.</Text>
      {!!erro && <Text accessibilityRole="alert" style={styles.error}>{erro}</Text>}
      {!!sucesso && <Text accessibilityRole="alert" style={styles.success}>{sucesso}</Text>}
      {carregando && <ActivityIndicator color={colors.leaf} />}
      <TextInput style={styles.input} placeholder="E-mail do usuário" value={emailDigitado} editable={!carregando && !salvando} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" onChangeText={setEmailDigitado} />
      <View style={styles.row}><ActionButton label="Consultar e-mail" disabled={carregando || salvando || !emailDigitado.trim()} onPress={() => {
        setCarregando(true); setErro(''); setSucesso('');
        void consultarAcessoUsuario(emailDigitado).then(setEditando)
          .catch(error => setErro(error instanceof Error ? error.message : 'Falha ao consultar e-mail.'))
          .finally(() => setCarregando(false));
      }} /></View>
      <View style={styles.row}><ActionButton label="Atualizar liberações" variant="ghost" disabled={carregando || salvando} onPress={() => void recarregar()} /></View>
      {lista.map(item => <Pressable disabled={salvando || carregando} key={item.email} style={[styles.card, editando?.email === item.email && styles.selected]} onPress={() => { setEditando({ ...item, abas: [...item.abas] }); setSucesso(''); }}>
        <Text selectable style={styles.bold}>{item.email}{item.email === emailAtual ? ' · Seu e-mail' : ''}</Text>
        <Text>{item.abas.length} abas liberadas</Text>
      </Pressable>)}
      {!!editando && <View style={styles.editor}>
        <Text selectable style={styles.bold}>Liberações de {editando.email}</Text>
        {ABAS_DISPOSITIVO.map(aba => <View style={styles.option} key={aba.id}>
          <Text style={styles.optionLabel}>{aba.titulo}{ABAS_OBRIGATORIAS.includes(aba.id) ? ' · Obrigatória' : ''}</Text>
          <Switch accessibilityLabel={`Liberar ${aba.titulo}`} disabled={salvando || carregando || ABAS_OBRIGATORIAS.includes(aba.id)} value={ABAS_OBRIGATORIAS.includes(aba.id) || editando.abas.includes(aba.id)} onValueChange={enabled => setEditando({ ...editando,
            abas: enabled ? [...editando.abas, aba.id] : editando.abas.filter(value => value !== aba.id) })} />
        </View>)}
        <Text>A tela de acesso por e-mail permanece disponível ao administrador para evitar bloqueio da configuração.</Text>
        <View style={styles.row}><ActionButton label="Salvar liberações" loading={salvando} disabled={carregando} onPress={() => void salvar()} /></View>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: 20, gap: 14, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', color: colors.forest }, link: { color: colors.leaf, fontWeight: '700' },
  bold: { fontWeight: '700', color: colors.forest }, card: { padding: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.creamDark, borderRadius: 10, gap: 5 },
  selected: { borderColor: colors.leaf, borderWidth: 2 }, editor: { gap: 14, padding: 14, backgroundColor: colors.white, borderRadius: 10 },
  row: { flexDirection: 'row' }, option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, optionLabel: { flex: 1 },
  input: { padding: 12, borderWidth: 1, borderColor: colors.creamDark, borderRadius: 8 },
  error: { color: colors.danger, padding: 12, backgroundColor: colors.dangerSoft }, success: { color: colors.success, padding: 12, backgroundColor: colors.successSoft },
});
