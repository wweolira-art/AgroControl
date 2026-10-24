import { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthProvider';
import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import { obterCadastrosApontamento } from '../src/services/apontamento';
import {
  carregarLancamentosMaoDeObraLocal,
  removerLancamentoMaoDeObraLocal,
  salvarLancamentoMaoDeObraLocal,
  type LancamentoMaoDeObraLocal,
} from '../src/services/mao-de-obra-local';
import { gravarMaoDeObraParaFuncionarios, listarServicosMaoDeObra, type ServicoMaoDeObra, type TurmaMaoDeObra } from '../src/services/mao-de-obra';
import type { CadastrosApontamento } from '../src/types/apontamento';
import { colors } from '../src/theme/colors';

type Opcao = { chave: string; titulo: string };
function Escolha({ label, valor, opcoes, onChange, disabled, digitarCodigo = false }: {
  label: string; valor: string; opcoes: Opcao[]; onChange: (value: string) => void; disabled: boolean; digitarCodigo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ultimoValor = useRef(valor);
  const selecionado = opcoes.find(item => item.chave === valor);
  const filtradas = busca.trim()
    ? opcoes.filter(item => item.titulo.toLocaleLowerCase().includes(busca.trim().toLocaleLowerCase())).slice(0, 30)
    : opcoes.slice(0, 30);

  useEffect(() => {
    if (!digitarCodigo || ultimoValor.current === valor) return;
    ultimoValor.current = valor;
    setBusca(valor);
  }, [digitarCodigo, opcoes, valor]);

  const selecionar = (item: Opcao) => {
    ultimoValor.current = item.chave;
    onChange(item.chave);
    setBusca(item.chave);
    setAberto(false);
  };

  return <View style={styles.campo}>
    <Text style={styles.label}>{label}</Text>
    {digitarCodigo && <>
      <View style={styles.linhaCodigo}>
        <TextInput
          accessibilityLabel={`Código de ${label}`}
          style={[styles.input, styles.inputCodigo]}
          editable={!disabled}
          value={busca}
          placeholder="Código"
          onFocus={() => setAberto(true)}
          onChangeText={texto => {
            setBusca(texto);
            const encontrado = opcoes.find(item => item.chave === texto.trim());
            if (encontrado) {
              selecionar(encontrado);
            } else {
              ultimoValor.current = '';
              onChange('');
              setAberto(true);
            }
          }}
        />
        {!!selecionado && <Text style={styles.descricaoCodigo}>{selecionado.titulo}</Text>}
      </View>
      {!!busca && !selecionado && !filtradas.length && <Text style={styles.codigoInvalido}>{label} não encontrado.</Text>}
      {aberto && !disabled && <View style={styles.listaInline}>
        {filtradas.map(item => <Pressable key={item.chave} style={styles.opcao} onPress={() => selecionar(item)}><Text>{item.titulo}</Text></Pressable>)}
        {!filtradas.length && <Text style={styles.codigoInvalido}>Nenhum cadastro encontrado.</Text>}
      </View>}
    </>}
    {!digitarCodigo && <Pressable disabled={disabled} style={styles.input} onPress={() => { setBusca(''); setAberto(true); }}>
      <Text>{selecionado?.titulo ?? 'Selecionar…'}</Text>
    </Pressable>}
    {!digitarCodigo && <Modal visible={aberto} animationType="slide" onRequestClose={() => setAberto(false)}>
      <SafeAreaView style={styles.modal}>
        <Text style={styles.titulo}>{label}</Text>
        <TextInput style={styles.input} placeholder="Buscar nome ou código" value={busca} onChangeText={setBusca} />
        <ScrollView keyboardShouldPersistTaps="handled">
          {opcoes.filter(item => item.titulo.toLocaleLowerCase().includes(busca.toLocaleLowerCase())).map(item =>
            <Pressable key={item.chave} style={styles.opcao} onPress={() => selecionar(item)}>
              <Text>{item.titulo}</Text>
            </Pressable>)}
          {opcoes.length === 0 && <Text>Nenhum cadastro disponível.</Text>}
        </ScrollView>
        <View style={styles.botoes}><ActionButton label="Fechar" variant="ghost" onPress={() => setAberto(false)} /></View>
      </SafeAreaView>
    </Modal>}
  </View>;
}

function hoje() {
  const data = new Date();
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
}

function formatarData(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 8);
  return [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)].filter(Boolean).join('/');
}

function dataParaApi(valor: string): string | null {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) return null;
  const [dia, mes, ano] = valor.split('/').map(Number);
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function novoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function MaoDeObraScreen() {
  const router = useRouter();
  const { usuario, pronto } = useAuth();
  const [cadastros, setCadastros] = useState<CadastrosApontamento | null>(null);
  const [servicos, setServicos] = useState<ServicoMaoDeObra[]>([]);
  const [carregandoServicos, setCarregandoServicos] = useState(false);
  const [erroServicos, setErroServicos] = useState('');
  const [versaoServicos, setVersaoServicos] = useState(0);
  const [turmas, setTurmas] = useState<TurmaMaoDeObra[]>([]);
  const [turma, setTurma] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const trava = useRef(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [fazenda, setFazenda] = useState('');
  const [talhao, setTalhao] = useState('');
  const [funcionario, setFuncionario] = useState('');
  const [funcionariosSelecionados, setFuncionariosSelecionados] = useState<number[]>([]);
  const [servico, setServico] = useState('');
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState('');
  const [armazenados, setArmazenados] = useState<LancamentoMaoDeObraLocal[]>([]);
  const turmaSelecionada = turmas.find((item) => String(item.codAgenciador) === turma);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const dados = await obterCadastrosApontamento();
      setCadastros(dados);
      setTurmas(dados?.turmas ?? []);
      setArmazenados(await carregarLancamentosMaoDeObraLocal());
      if (!dados || !Array.isArray(dados.turmas)) {
        setErro('Importe os cadastros na aba Cadastros para armazenar as turmas neste aparelho.');
      }
      setVersaoServicos(value => value + 1);
    } catch (error) { setErro(error instanceof Error ? error.message : 'Falha ao carregar cadastros.'); }
    finally { setCarregando(false); }
  }, []);
  useFocusEffect(useCallback(() => { if (usuario) void carregar(); }, [usuario, carregar]));
  useEffect(() => {
    let ativo = true;
    setServicos([]); setServico(''); setErroServicos('');
    const dataApi = dataParaApi(data);
    if (!cadastros?.fazendas.some(item => item.codFazenda === Number(fazenda)) || !dataApi) { setCarregandoServicos(false); return; }
    setCarregandoServicos(true);
    const consulta = setTimeout(() => {
      void listarServicosMaoDeObra(Number(fazenda), dataApi)
        .then(lista => {
          if (!ativo) return;
          setServicos(lista);
          if (!lista.length) setErroServicos('Não há serviços com preço na tabela mais recente válida para esta fazenda e data.');
        })
        .catch(error => { if (ativo) setErroServicos(error instanceof Error ? error.message : 'Falha ao carregar preços.'); })
        .finally(() => { if (ativo) setCarregandoServicos(false); });
    }, 400);
    return () => { ativo = false; clearTimeout(consulta); };
  }, [fazenda, data, versaoServicos, cadastros]);

  function dadosParaSalvar(): Omit<LancamentoMaoDeObraLocal, 'id' | 'criadoEm'> | null {
    const dataApi = dataParaApi(data);
    if (!turmaSelecionada || !fazenda || !talhao || !funcionariosSelecionados.length || !servico || !dataApi) {
      setErro('Informe turma, data, fazenda, talhão, funcionários e serviço antes de salvar.');
      return null;
    }
    return {
      codAgenciador: turmaSelecionada.codAgenciador,
      codGrupoempresaTurma: turmaSelecionada.codGrupoempresa,
      codFazenda: Number(fazenda), codTalhao: Number(talhao), codOperacao: Number(servico),
      dataApontamento: dataApi, observacao, funcionarios: [...new Set(funcionariosSelecionados)],
    };
  }

  async function salvarNoDispositivo() {
    setErro(''); setSucesso('');
    const dados = dadosParaSalvar();
    if (!dados) return;
    const lancamento: LancamentoMaoDeObraLocal = { ...dados, id: novoId(), criadoEm: new Date().toISOString() };
    await salvarLancamentoMaoDeObraLocal(lancamento);
    setArmazenados(await carregarLancamentosMaoDeObraLocal());
    setFuncionariosSelecionados([]); setFuncionario(''); setObservacao('');
    setSucesso('Lançamento armazenado neste dispositivo. Envie quando houver conexão.');
  }

  async function enviarArmazenados() {
    if (trava.current || !armazenados.length) return;
    trava.current = true; setEnviando(true); setErro(''); setSucesso('');
    let enviados = 0;
    try {
      for (const item of armazenados) {
        await gravarMaoDeObraParaFuncionarios({
          codAgenciador: item.codAgenciador, codGrupoempresaTurma: item.codGrupoempresaTurma,
          codFazenda: item.codFazenda, codTalhao: item.codTalhao, codOperacao: item.codOperacao,
          dataApontamento: item.dataApontamento, quantidade: 1, observacao: item.observacao,
        }, item.funcionarios, () => undefined);
        await removerLancamentoMaoDeObraLocal(item.id);
        enviados++;
      }
      setArmazenados(await carregarLancamentosMaoDeObraLocal());
      setSucesso(`${enviados} lançamento(s) armazenado(s) enviado(s) com sucesso.`);
    } catch (error) {
      setArmazenados(await carregarLancamentosMaoDeObraLocal());
      setErro(error instanceof Error ? error.message : 'Falha ao enviar os lançamentos armazenados.');
    } finally { trava.current = false; setEnviando(false); }
  }

  async function enviar() {
    if (trava.current) return;
    setErro(''); setSucesso('');
    const dataApi = dataParaApi(data);
    if (!dataApi) { setErro('Informe uma data válida no formato DD/MM/AAAA.'); return; }
    if (!turmaSelecionada || !fazenda || !talhao || !funcionariosSelecionados.length || !servico) {
      setErro('Informe turma, data, fazenda, talhão, adicione os funcionários e informe o serviço.'); return;
    }
    if (!cadastros?.fazendas.some(item => item.codFazenda === Number(fazenda)) ||
        !funcionariosSelecionados.every(codigo => cadastros.funcionarios.some(item => item.codFuncionario === codigo)) ||
        !servicos.some(item => item.codAtividade === Number(servico))) {
      setErro('Confira os códigos de fazenda, funcionário e serviço. Use códigos com descrição encontrada.'); return;
    }
    if (funcionario) { setErro('Adicione o funcionário digitado à lista ou limpe o campo antes de enviar.'); return; }
    trava.current = true; setEnviando(true);
    try {
      const quantidade = await gravarMaoDeObraParaFuncionarios({
        codAgenciador: turmaSelecionada.codAgenciador,
        codGrupoempresaTurma: turmaSelecionada.codGrupoempresa,
        codFazenda: Number(fazenda), codTalhao: Number(talhao),
        codOperacao: Number(servico), dataApontamento: dataApi,
        quantidade: 1, observacao }, funcionariosSelecionados, codigo => {
          setFuncionariosSelecionados(atual => atual.filter(item => item !== codigo));
        });
      setSucesso(`${quantidade} funcionário(s) com lançamento confirmado.`); setObservacao('');
    } catch (error) { setErro(error instanceof Error ? error.message : 'Falha ao gravar.'); }
    finally { trava.current = false; setEnviando(false); }
  }

  if (!pronto) return <ActivityIndicator />;
  if (!usuario) return <Redirect href="/login" />;
  const bloqueado = carregando || enviando;
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <Header subtitle="Lançamento de mão de obra" />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Pressable disabled={enviando} onPress={() => router.back()}><Text style={styles.voltar}>← Voltar</Text></Pressable>
        <Text style={styles.titulo}>Mão de Obra</Text>
        {carregando && <ActivityIndicator color={colors.leaf} />}
        {!!erro && <Text accessibilityRole="alert" style={styles.erro}>{erro}</Text>}
        {!!sucesso && <Text accessibilityRole="alert" style={styles.sucesso}>{sucesso}</Text>}
        <Escolha
          digitarCodigo
          label="Turma"
          valor={turma}
          disabled={bloqueado}
          opcoes={turmas.map((item) => ({
            chave: String(item.codAgenciador),
            titulo: `${item.codAgenciador} · ${item.descricao || `Turma ${item.codAgenciador} · Grupo ${item.codGrupoempresa}`}`,
          }))}
          onChange={setTurma}
        />
        <Text style={styles.label}>Data</Text>
        <TextInput style={styles.input} editable={!bloqueado} value={data} onChangeText={valor => setData(formatarData(valor))} placeholder="20/10/2026" keyboardType="number-pad" maxLength={10} />
        <Escolha digitarCodigo label="Fazenda" valor={fazenda} disabled={bloqueado}
          opcoes={(cadastros?.fazendas ?? []).map(item => ({ chave: String(item.codFazenda), titulo: `${item.codFazenda} · ${item.nome}` }))}
          onChange={valor => { setFazenda(valor); setTalhao(''); }} />
        <Escolha digitarCodigo label="Talhão" valor={talhao} disabled={bloqueado || !fazenda}
          opcoes={[...new Map((cadastros?.talhoes ?? []).filter(item => item.codFazenda === Number(fazenda)).map(item => [item.codTalhao, { chave: String(item.codTalhao), titulo: `${item.codTalhao} · ${item.descricao}` }])).values()]}
          onChange={setTalhao} />
        <Escolha digitarCodigo label="Funcionário" valor={funcionario} disabled={bloqueado}
          opcoes={(cadastros?.funcionarios ?? []).map(item => ({ chave: String(item.codFuncionario), titulo: `${item.codFuncionario} · ${item.nome}` }))}
          onChange={setFuncionario} />
        <View style={styles.botoes}><ActionButton label="Adicionar funcionário" disabled={bloqueado || !cadastros?.funcionarios.some(item => item.codFuncionario === Number(funcionario)) || funcionariosSelecionados.includes(Number(funcionario))}
          onPress={() => {
            const codigo = Number(funcionario);
            if (!cadastros?.funcionarios.some(item => item.codFuncionario === codigo)) return;
            setFuncionariosSelecionados(atual => atual.includes(codigo) ? atual : [...atual, codigo]);
            setFuncionario('');
          }} /></View>
        {funcionariosSelecionados.map(codigo => <View key={codigo} style={styles.funcionarioSelecionado}>
          <Text style={styles.funcionarioNome}>{codigo} · {cadastros?.funcionarios.find(item => item.codFuncionario === codigo)?.nome ?? 'Cadastro indisponível'}</Text>
          <Pressable disabled={bloqueado} accessibilityLabel={`Remover funcionário ${codigo}`} onPress={() => setFuncionariosSelecionados(atual => atual.filter(item => item !== codigo))}>
            <Text style={styles.codigoInvalido}>Remover</Text>
          </Pressable>
        </View>)}
        {carregandoServicos && <ActivityIndicator color={colors.leaf} />}
        {!!erroServicos && <Text accessibilityRole="alert" style={styles.erro}>{erroServicos}</Text>}
        <Escolha digitarCodigo label="Serviço" valor={servico} disabled={bloqueado || carregandoServicos || !fazenda}
          opcoes={servicos.map(item => ({ chave: String(item.codAtividade), titulo: `${item.codAtividade} · ${item.descricao}` }))}
          onChange={setServico} />
        <Text style={styles.label}>Observação (opcional)</Text>
        <TextInput style={styles.input} editable={!bloqueado} value={observacao} onChangeText={setObservacao} multiline />
        <View style={styles.botoes}>
          <ActionButton label="Salvar no dispositivo" variant="secondary" disabled={bloqueado || !turmaSelecionada || !fazenda || !talhao || !servico || !funcionariosSelecionados.length} onPress={() => void salvarNoDispositivo()} />
          <ActionButton label="Enviar lançamento" loading={enviando} disabled={carregando || carregandoServicos || !cadastros || !servicos.length || !servico || !turmaSelecionada || !funcionariosSelecionados.length} onPress={() => void enviar()} />
        </View>
        {armazenados.length > 0 && <View style={styles.botoes}><ActionButton label={`Enviar ${armazenados.length} armazenado(s)`} variant="ghost" disabled={bloqueado} onPress={() => void enviarArmazenados()} /></View>}
        {(!!erro || !!erroServicos) && <View style={styles.botoes}><ActionButton label="Tentar novamente" variant="ghost" disabled={bloqueado} onPress={() => void carregar()} /></View>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, flex: { flex: 1 },
  conteudo: { padding: 20, gap: 12, paddingBottom: 40 }, voltar: { color: colors.leaf, fontWeight: '700' },
  titulo: { fontSize: 24, fontWeight: '700', color: colors.forest }, label: { fontWeight: '600', color: colors.forest },
  campo: { gap: 6 }, input: { padding: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.creamDark, borderRadius: 10, color: colors.ink },
  linhaCodigo: { flexDirection: 'row', alignItems: 'center', gap: 10 }, inputCodigo: { width: 96, flexGrow: 0, flexShrink: 0 }, descricaoCodigo: { flex: 1, color: colors.forest, fontWeight: '600' }, codigoInvalido: { color: colors.danger },
  erro: { padding: 12, color: colors.danger, backgroundColor: colors.dangerSoft },
  sucesso: { padding: 12, color: colors.success, backgroundColor: colors.successSoft },
  modal: { flex: 1, padding: 20, gap: 14, backgroundColor: colors.cream }, opcao: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.creamDark },
  listaInline: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.creamDark, borderRadius: 10, maxHeight: 260 },
  funcionarioSelecionado: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: colors.white, borderRadius: 10 },
  funcionarioNome: { flex: 1, color: colors.forest },
  botoes: { flexDirection: 'row' },
});
