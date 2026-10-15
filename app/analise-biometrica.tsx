import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { useAuth } from '../src/auth/AuthProvider';
import { Header } from '../src/components/Header';
import {
  consultarCadastrosAnaliseBiometrica,
  consultarLancamentosAnaliseBiometrica,
  enviarLancamentosAnaliseBiometrica,
  excluirLancamentosAnaliseBiometrica,
} from '../src/services/analise-biometrica';
import { obterCadastrosApontamento } from '../src/services/apontamento';
import { colors } from '../src/theme/colors';
import type {
  CadastrosAnaliseBiometrica,
  ItemAnaliseBiometrica,
  LancamentoAnaliseBiometrica,
  PontoAnaliseBiometrica,
} from '../src/types/analise-biometrica';
import type { FazendaCadastro, TalhaoCadastro } from '../src/types/apontamento';

const LIMITE_LISTA = 25;
const FATOR_PESO_TCH = 6.67;

function hojeBr(): string {
  const data = new Date();
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
}

function formatarDataDigitada(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 2) {
    return digitos;
  }
  if (digitos.length <= 4) {
    return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  }
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

function dataValida(texto: string): boolean {
  const match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return false;
  }
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3]);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

function parseNumero(texto: string): number | null {
  const numero = Number(texto.replace(',', '.').trim());
  return Number.isFinite(numero) ? numero : null;
}

function valorFormatado(valor: number): string {
  return Number.isFinite(valor) ? String(valor).replace('.', ',') : '-';
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function contemTodos(texto: string, termos: string[]): boolean {
  return termos.every((termo) => texto.includes(termo));
}

function itemCanasPorMetro(item: ItemAnaliseBiometrica): boolean {
  const descricao = normalizarTexto(item.descricao);
  return (
    contemTodos(descricao, ['cana', 'metro']) ||
    contemTodos(descricao, ['colmo', 'metro']) ||
    contemTodos(descricao, ['colmos', 'metro'])
  );
}

function itemPesoPorCana(item: ItemAnaliseBiometrica): boolean {
  const descricao = normalizarTexto(item.descricao);
  return contemTodos(descricao, ['peso', 'cana']) || contemTodos(descricao, ['peso', 'colmo']);
}

function itemPesoTch(item: ItemAnaliseBiometrica): boolean {
  const descricao = normalizarTexto(item.descricao);
  return contemTodos(descricao, ['peso', 'tch']) || descricao.includes('tch');
}

function formatarTch(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

interface TchResultado {
  tch: number | null;
  motivo: string | null;
  canasPorMetro: number | null;
  pesoPorCana: number | null;
}

function calcularTch(
  canasPorMetro: number | null,
  pesoPorCana: number | null,
): TchResultado {
  if (canasPorMetro == null) {
    return { tch: null, motivo: 'Informe cana por metro para calcular o Peso TCH.', canasPorMetro, pesoPorCana };
  }
  if (pesoPorCana == null) {
    return { tch: null, motivo: 'Informe peso por cana para calcular o Peso TCH.', canasPorMetro, pesoPorCana };
  }
  return {
    tch: canasPorMetro * pesoPorCana * FATOR_PESO_TCH,
    motivo: null,
    canasPorMetro,
    pesoPorCana,
  };
}

function groupUsuarios(grupo: LancamentoAnaliseBiometrica[]): string[] {
  const usuarios = new Set<string>();
  for (const linha of grupo) {
    const autor = linha.usuario.trim();
    if (autor) {
      usuarios.add(autor);
    }
  }
  return [...usuarios];
}

interface SeletorProps<T> {
  titulo: string;
  busca: string;
  selecionado: T | null;
  opcoes: T[];
  onBusca: (texto: string) => void;
  onSelecionar: (item: T) => void;
  rotulo: (item: T) => string;
  chave: (item: T) => string;
  vazio: string;
}

function Seletor<T>({
  titulo,
  busca,
  selecionado,
  opcoes,
  onBusca,
  onSelecionar,
  rotulo,
  chave,
  vazio,
}: SeletorProps<T>) {
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo || (selecionado && termo === rotulo(selecionado).toLowerCase())) {
      return [];
    }
    const lista = opcoes.filter((item) => rotulo(item).toLowerCase().includes(termo));
    return lista.slice(0, LIMITE_LISTA);
  }, [busca, opcoes, rotulo, selecionado]);

  return (
    <View style={styles.campo}>
      <Text style={styles.label}>{titulo}</Text>
      <TextInput
        value={busca}
        onChangeText={onBusca}
        placeholder="Digite para buscar..."
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      {selecionado ? <Text style={styles.selecionado}>Selecionado: {rotulo(selecionado)}</Text> : null}
      {opcoes.length === 0 ? (
        <Text style={styles.vazio}>{vazio}</Text>
      ) : busca.trim() === '' ? (
        <Text style={styles.vazio}>Digite para buscar.</Text>
      ) : filtradas.length === 0 && !selecionado ? (
        <Text style={styles.vazio}>Nenhuma opção encontrada.</Text>
      ) : (
        <View>
          {filtradas.map((item) => (
            <Pressable
              key={chave(item)}
              onPress={() => onSelecionar(item)}
              style={[styles.opcao, selecionado && chave(selecionado) === chave(item) && styles.opcaoAtiva]}
            >
              <Text style={styles.opcaoTexto}>{rotulo(item)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function AnaliseBiometricaScreen() {
  const router = useRouter();
  const { usuario, isAdmin } = useAuth();
  const [cadastros, setCadastros] = useState<CadastrosAnaliseBiometrica | null>(null);
  const [fazendas, setFazendas] = useState<FazendaCadastro[]>([]);
  const [talhoes, setTalhoes] = useState<TalhaoCadastro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoLancamentos, setCarregandoLancamentos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [excluindoChave, setExcluindoChave] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lancamentos, setLancamentos] = useState<LancamentoAnaliseBiometrica[]>([]);

  const [data, setData] = useState(hojeBr);
  const [buscaFazenda, setBuscaFazenda] = useState('');
  const [buscaTalhao, setBuscaTalhao] = useState('');
  const [fazenda, setFazenda] = useState<FazendaCadastro | null>(null);
  const [talhao, setTalhao] = useState<TalhaoCadastro | null>(null);
  const [codPonto, setCodPonto] = useState('');
  const [ponto, setPonto] = useState<PontoAnaliseBiometrica | null>(null);
  const [variedade, setVariedade] = useState('');
  const [valores, setValores] = useState<Record<number, string>>({});

  const talhoesFiltrados = useMemo(
    () => (fazenda ? talhoes.filter((talhaoItem) => talhaoItem.codFazenda === fazenda.codFazenda) : talhoes),
    [fazenda, talhoes],
  );

  const lancamentosAgrupados = useMemo(() => {
    const mapa = new Map<string, LancamentoAnaliseBiometrica[]>();
    const dataFiltro = data.trim();
    const filtrados = dataFiltro
      ? lancamentos.filter((lancamento) => String(lancamento.data).trim() === dataFiltro)
      : lancamentos;
    for (const lancamento of filtrados) {
      const chave = [
        lancamento.data,
        lancamento.codFazenda,
        lancamento.codTalhao,
        lancamento.codPonto,
        lancamento.variedade,
      ].join('|');
      const grupo = mapa.get(chave) ?? [];
      grupo.push(lancamento);
      mapa.set(chave, grupo);
    }
    return [...mapa.values()].sort((a, b) => String(b[0]?.data ?? '').localeCompare(String(a[0]?.data ?? '')));
  }, [data, lancamentos]);

  const descricaoItem = useCallback(
    (codItem: number) => cadastros?.itens.find((item) => item.codItem === codItem)?.descricao ?? `Item ${codItem}`,
    [cadastros],
  );

  const itensTch = useMemo(() => {
    const itens = cadastros?.itens ?? [];
    return {
      canasPorMetro: itens.find(itemCanasPorMetro) ?? null,
      pesoPorCana: itens.find(itemPesoPorCana) ?? null,
      pesoTch: itens.find(itemPesoTch) ?? null,
    };
  }, [cadastros]);

  const tchAtual = useMemo(() => {
    return calcularTch(
      itensTch.canasPorMetro ? parseNumero(valores[itensTch.canasPorMetro.codItem] ?? '') : null,
      itensTch.pesoPorCana ? parseNumero(valores[itensTch.pesoPorCana.codItem] ?? '') : null,
    );
  }, [itensTch, valores]);

  const calcularTchGrupo = useCallback(
    (grupo: LancamentoAnaliseBiometrica[]): TchResultado => {
      const valorPorItem = (predicado: (item: ItemAnaliseBiometrica) => boolean): number | null => {
        const item = cadastros?.itens.find(predicado);
        if (!item) {
          return null;
        }
        const lancamento = grupo.find((linha) => linha.codItem === item.codItem);
        return lancamento && Number.isFinite(lancamento.valor) ? lancamento.valor : null;
      };
      return calcularTch(
        valorPorItem(itemCanasPorMetro),
        valorPorItem(itemPesoPorCana),
      );
    },
    [cadastros],
  );

  const totalLancamentosData = useMemo(
    () => lancamentos.filter((lancamento) => String(lancamento.data).trim() === data.trim()).length,
    [data, lancamentos],
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [bio, apontamento] = await Promise.all([
        consultarCadastrosAnaliseBiometrica(),
        obterCadastrosApontamento(),
      ]);
      setCadastros(bio);
      setFazendas(apontamento?.fazendas ?? []);
      setTalhoes(apontamento?.talhoes ?? []);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro ao carregar cadastros da análise biométrica.');
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarLancamentos = useCallback(async () => {
    setCarregandoLancamentos(true);
    setErro(null);
    try {
      setLancamentos(await consultarLancamentosAnaliseBiometrica());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro ao carregar lançamentos biométricos.');
    } finally {
      setCarregandoLancamentos(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
      void carregarLancamentos();
    }, [carregar, carregarLancamentos]),
  );

  const selecionarFazenda = (selecionada: FazendaCadastro) => {
    setFazenda(selecionada);
    setBuscaFazenda(`${selecionada.codFazenda} - ${selecionada.nome}`);
    setTalhao(null);
    setBuscaTalhao('');
  };

  const selecionarTalhao = (selecionado: TalhaoCadastro) => {
    setTalhao(selecionado);
    setBuscaTalhao(`${selecionado.codTalhao} - ${selecionado.descricao}`);
  };

  const selecionarPonto = (selecionado: PontoAnaliseBiometrica) => {
    setPonto(selecionado);
    setCodPonto(String(selecionado.codPonto));
  };

  const chaveGrupo = (grupo: LancamentoAnaliseBiometrica[]): string => {
    const primeiro = grupo[0];
    if (!primeiro) {
      return '';
    }
    return [
      primeiro.data,
      primeiro.codFazenda,
      primeiro.codTalhao,
      primeiro.codPonto,
      primeiro.variedade,
    ].join('|');
  };

  const usuarioLancamentoAtual = usuario?.nome || usuario?.email || '';

  const podeExcluirGrupo = (grupo: LancamentoAnaliseBiometrica[]): boolean => {
    if (isAdmin) {
      return true;
    }
    const autores = new Set(groupUsuarios(grupo).map((autor) => normalizarTexto(autor)));
    if (autores.size === 0) {
      return true;
    }
    return autores.has(normalizarTexto(usuarioLancamentoAtual));
  };

  const excluirGrupo = (grupo: LancamentoAnaliseBiometrica[]) => {
    const chave = chaveGrupo(grupo);
    const primeiro = grupo[0];
    if (!primeiro) {
      return;
    }
    if (!grupo.every((linha) => linha.selfUrl)) {
      Alert.alert('Não foi possível excluir', 'Algumas linhas deste lançamento não possuem link de exclusão da ORDS.');
      return;
    }
    Alert.alert(
      'Excluir lançamento',
      `Excluir ${grupo.length} item(ns) do ponto ${primeiro.codPonto}, talhão ${primeiro.codTalhao}, data ${primeiro.data}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setExcluindoChave(chave);
            setErro(null);
            try {
              await excluirLancamentosAnaliseBiometrica(grupo);
              await carregarLancamentos();
            } catch (falha) {
              setErro(falha instanceof Error ? falha.message : 'Falha ao excluir lançamento biométrico.');
            } finally {
              setExcluindoChave(null);
            }
          },
        },
      ],
    );
  };

  const enviar = async () => {
    const pontoCodigo = ponto?.codPonto ?? parseNumero(codPonto);
    if (!dataValida(data)) {
      setErro('Informe uma data válida no formato DD/MM/AAAA.');
      return;
    }
    if (!fazenda) {
      setErro('Selecione a fazenda.');
      return;
    }
    if (!talhao) {
      setErro('Selecione o talhão.');
      return;
    }
    if (!pontoCodigo || pontoCodigo <= 0) {
      setErro('Informe o ponto da análise biométrica.');
      return;
    }
    if (!cadastros?.itens.length) {
      setErro('Nenhum item de análise biométrica foi encontrado na ORDS.');
      return;
    }
    if (!variedade.trim()) {
      setErro('Informe a variedade.');
      return;
    }
    const itensComValor = cadastros.itens.map((itemAtual) => ({
      item: itemAtual,
      valor: itemPesoTch(itemAtual) ? tchAtual.tch : parseNumero(valores[itemAtual.codItem] ?? ''),
    }));
    const faltando = itensComValor.filter((linha) => linha.valor == null);
    if (faltando.length > 0) {
      setErro(`Informe o valor de todos os itens. Falta: ${faltando.map((linha) => linha.item.descricao).join(', ')}.`);
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      await enviarLancamentosAnaliseBiometrica(
        itensComValor.map((linha) => ({
          data,
          codPonto: pontoCodigo,
          codItem: linha.item.codItem,
          codFazenda: fazenda.codFazenda,
          codTalhao: talhao.codTalhao,
          variedade: variedade.trim(),
          valor: linha.valor ?? 0,
          usuario: usuarioLancamentoAtual,
        })),
      );
      Alert.alert('Lançamento enviado', `${itensComValor.length} item(ns) da análise biométrica gravado(s) na ORDS.`);
      setCodPonto('');
      setPonto(null);
      setVariedade('');
      setValores({});
      void carregarLancamentos();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha ao enviar lançamento biométrico.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header subtitle="Lançamento biométrico" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Voltar</Text>
        </Pressable>

        <Text style={styles.intro}>
          Preencha os dados da análise biométrica e envie para lancamento_analisebiometrica na ORDS.
        </Text>

        {carregando ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : null}
        {erro ? <Text style={styles.erro}>{erro}</Text> : null}

        <View style={styles.card}>
          <View style={styles.campo}>
            <Text style={styles.label}>Data</Text>
            <TextInput
              value={data}
              onChangeText={(texto) => setData(formatarDataDigitada(texto))}
              keyboardType="number-pad"
              placeholder="DD/MM/AAAA"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>

          <Seletor
            titulo="Fazenda"
            busca={buscaFazenda}
            selecionado={fazenda}
            opcoes={fazendas}
            onBusca={(texto) => {
              setBuscaFazenda(texto);
              setFazenda(null);
            }}
            onSelecionar={selecionarFazenda}
            rotulo={(opcao) => `${opcao.codFazenda} - ${opcao.nome}`}
            chave={(opcao) => String(opcao.codFazenda)}
            vazio="Importe os cadastros de apontamento para listar fazendas."
          />

          <Seletor
            titulo="Talhão"
            busca={buscaTalhao}
            selecionado={talhao}
            opcoes={talhoesFiltrados}
            onBusca={(texto) => {
              setBuscaTalhao(texto);
              setTalhao(null);
            }}
            onSelecionar={selecionarTalhao}
            rotulo={(opcao) => `${opcao.codTalhao} - ${opcao.descricao}`}
            chave={(opcao) => `${opcao.codFazenda}-${opcao.codTalhao}`}
            vazio="Importe os cadastros de apontamento para listar talhões."
          />

          {cadastros?.pontos.length ? (
            <View style={styles.campo}>
              <Text style={styles.label}>Ponto</Text>
              {cadastros.pontos.map((opcao) => (
                <Pressable
                  key={opcao.codPonto}
                  onPress={() => selecionarPonto(opcao)}
                  style={[styles.opcao, ponto?.codPonto === opcao.codPonto && styles.opcaoAtiva]}
                >
                  <Text style={styles.opcaoTexto}>{`${opcao.codPonto} - ${opcao.descricao}`}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.campo}>
              <Text style={styles.label}>Código do ponto</Text>
              <TextInput
                value={codPonto}
                onChangeText={(texto) => {
                  setCodPonto(texto.replace(/\D/g, ''));
                  setPonto(null);
                }}
                keyboardType="number-pad"
                placeholder="Ex.: 1"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </View>
          )}

          <View style={styles.campo}>
            <Text style={styles.label}>Valores por item</Text>
            {cadastros?.itens.length ? (
              cadastros.itens.map((opcao) => {
                const automaticoPesoTch = itemPesoTch(opcao);
                return (
                  <View key={opcao.codItem} style={styles.itemValor}>
                    <Text style={styles.itemValorTitulo}>{`${opcao.codItem} - ${opcao.descricao}`}</Text>
                    {automaticoPesoTch ? (
                      <View style={styles.resultadoAutomatico}>
                        <Text style={styles.resultadoAutomaticoValor}>
                          {tchAtual.tch == null ? '--' : `${formatarTch(tchAtual.tch)} t/ha`}
                        </Text>
                        <Text style={styles.resultadoAutomaticoTexto}>Calculado automaticamente</Text>
                      </View>
                    ) : (
                      <TextInput
                        value={valores[opcao.codItem] ?? ''}
                        onChangeText={(texto) =>
                          setValores((atual) => ({
                            ...atual,
                            [opcao.codItem]: texto,
                          }))
                        }
                        keyboardType="decimal-pad"
                        placeholder="Informe o valor"
                        placeholderTextColor={colors.muted}
                        style={styles.input}
                      />
                    )}
                  </View>
                );
              })
            ) : (
              <Text style={styles.vazio}>Nenhum item encontrado na ORDS.</Text>
            )}
          </View>

          <View style={styles.tchCard}>
            <Text style={styles.tchKicker}>Resultado calculado</Text>
            <Text style={styles.tchTitulo}>
              {tchAtual.tch == null ? '--' : `${formatarTch(tchAtual.tch)} t/ha`}
            </Text>
            <Text style={styles.tchFormula}>
              Peso TCH = cana por metro x peso por cana x {String(FATOR_PESO_TCH).replace('.', ',')}
            </Text>
            {tchAtual.motivo ? <Text style={styles.tchAviso}>{tchAtual.motivo}</Text> : null}
          </View>

          <View style={styles.campo}>
            <Text style={styles.label}>Variedade</Text>
            <TextInput
              value={variedade}
              onChangeText={setVariedade}
              autoCapitalize="characters"
              placeholder="Informe a variedade"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>
        </View>

        <ActionButton
          label={enviando ? 'Enviando...' : 'Enviar lançamento'}
          onPress={() => void enviar()}
          loading={enviando}
          disabled={enviando || carregando}
        />

        <View style={styles.historicoHeader}>
          <Text style={styles.historicoTitulo}>Lançamentos já gravados</Text>
          <ActionButton
            label={carregandoLancamentos ? 'Atualizando...' : 'Atualizar'}
            variant="ghost"
            onPress={() => void carregarLancamentos()}
            loading={carregandoLancamentos}
            disabled={carregandoLancamentos}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.historicoResumo}>
            {totalLancamentosData} linha(s) em {lancamentosAgrupados.length} lançamento(s) na data {data || 'informada'}.
          </Text>
          {lancamentosAgrupados.length === 0 ? (
            <Text style={styles.vazio}>Nenhum lançamento biométrico encontrado para esta data.</Text>
          ) : (
            lancamentosAgrupados.map((grupo) => {
              const primeiro = grupo[0];
              if (!primeiro) {
                return null;
              }
              const tchGrupo = calcularTchGrupo(grupo);
              const chave = chaveGrupo(grupo);
              const autores = groupUsuarios(grupo);
              const podeExcluir = podeExcluirGrupo(grupo);
              return (
                <View
                  key={`${primeiro.data}-${primeiro.codFazenda}-${primeiro.codTalhao}-${primeiro.codPonto}-${primeiro.variedade}`}
                  style={styles.lancamentoCard}
                >
                  <Text style={styles.lancamentoTitulo}>
                    Ponto {primeiro.codPonto} · Fazenda {primeiro.codFazenda} · Talhão {primeiro.codTalhao}
                  </Text>
                  <Text style={styles.lancamentoSub}>
                    {primeiro.data} · Variedade {primeiro.variedade || '-'}
                  </Text>
                  <Text style={styles.lancamentoSub}>
                    Lançado por {autores.length > 0 ? autores.join(', ') : 'usuário não informado'}
                  </Text>
                  <View style={styles.tchResumo}>
                    <Text style={styles.tchResumoLabel}>Peso TCH do ponto</Text>
                    <Text style={styles.tchResumoValor}>
                      {tchGrupo.tch == null ? '--' : `${formatarTch(tchGrupo.tch)} t/ha`}
                    </Text>
                    {tchGrupo.motivo ? <Text style={styles.tchResumoAviso}>{tchGrupo.motivo}</Text> : null}
                  </View>
                  {grupo
                    .slice()
                    .sort((a, b) => a.codItem - b.codItem)
                    .map((linha) => (
                      <Text key={`${linha.codItem}-${linha.valor}`} style={styles.lancamentoLinha}>
                        {descricaoItem(linha.codItem)}: {valorFormatado(linha.valor)}
                      </Text>
                    ))}
                  {podeExcluir ? (
                    <View style={styles.excluirBox}>
                      <ActionButton
                        label={excluindoChave === chave ? 'Excluindo...' : 'Excluir lançamento'}
                        variant="danger"
                        onPress={() => excluirGrupo(grupo)}
                        loading={excluindoChave === chave}
                        disabled={excluindoChave != null}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
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
  back: { marginBottom: 12 },
  backText: { color: colors.leaf, fontWeight: '700' },
  intro: { color: colors.muted, fontWeight: '600', lineHeight: 19, marginBottom: 16 },
  loader: { marginVertical: 18 },
  erro: { color: colors.danger, fontWeight: '700', marginBottom: 12 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.creamDark,
  },
  campo: { marginBottom: 16 },
  label: { color: colors.forest, fontWeight: '800', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.creamDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontWeight: '600',
    backgroundColor: colors.cream,
  },
  selecionado: { color: colors.leaf, fontWeight: '700', fontSize: 12, marginTop: 6 },
  opcao: {
    borderWidth: 1,
    borderColor: colors.creamDark,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    backgroundColor: colors.white,
  },
  opcaoAtiva: { borderColor: colors.leaf, backgroundColor: '#E8F3EC' },
  opcaoTexto: { color: colors.ink, fontWeight: '700' },
  itemValor: {
    borderWidth: 1,
    borderColor: colors.creamDark,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    backgroundColor: colors.white,
    gap: 8,
  },
  itemValorTitulo: { color: colors.forest, fontWeight: '800' },
  resultadoAutomatico: {
    borderWidth: 1,
    borderColor: colors.creamDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.successSoft,
    gap: 2,
  },
  resultadoAutomaticoValor: { color: colors.forest, fontWeight: '800', fontSize: 16 },
  resultadoAutomaticoTexto: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  tchCard: {
    backgroundColor: colors.forest,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  tchKicker: { color: colors.accent, fontWeight: '800', fontSize: 12, letterSpacing: 0.4 },
  tchTitulo: { color: colors.white, fontWeight: '800', fontSize: 24, marginTop: 4 },
  tchFormula: { color: colors.creamDark, fontWeight: '600', fontSize: 12, marginTop: 6, lineHeight: 18 },
  tchAviso: { color: colors.gold, fontWeight: '800', fontSize: 12, marginTop: 8, lineHeight: 18 },
  historicoHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 10,
  },
  historicoTitulo: { color: colors.forest, fontWeight: '800', fontSize: 16, flex: 1 },
  historicoResumo: { color: colors.muted, fontWeight: '700', marginBottom: 10 },
  lancamentoCard: {
    borderWidth: 1,
    borderColor: colors.creamDark,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    backgroundColor: colors.white,
  },
  lancamentoTitulo: { color: colors.forest, fontWeight: '800' },
  lancamentoSub: { color: colors.muted, fontWeight: '700', fontSize: 12, marginTop: 3, marginBottom: 8 },
  tchResumo: {
    backgroundColor: colors.successSoft,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    gap: 2,
  },
  tchResumoLabel: { color: colors.leaf, fontWeight: '800', fontSize: 12 },
  tchResumoValor: { color: colors.forest, fontWeight: '800', fontSize: 18 },
  tchResumoAviso: { color: colors.muted, fontWeight: '700', fontSize: 11, lineHeight: 16 },
  lancamentoLinha: { color: colors.ink, fontWeight: '600', lineHeight: 18 },
  excluirBox: { flexDirection: 'row', marginTop: 10 },
  vazio: { color: colors.muted, fontWeight: '600', lineHeight: 18 },
});
