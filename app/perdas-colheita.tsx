import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useDeviceAccess } from '../src/auth/DeviceAccessProvider';

import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import { useUserLocation } from '../src/hooks/useUserLocation';
import { salvarPerdaLocal } from '../src/services/apontamento-local';
import { obterCadastrosPerda } from '../src/services/perdas';
import { colors } from '../src/theme/colors';
import type {
  CadastrosPerda,
  EquipamentoCadastro,
  FazendaPerdaCadastro,
  FrenteCadastro,
  OperadorCadastro,
  TalhaoPerdaCadastro,
  TipoCorteCadastro,
  PerdaRascunho,
} from '../src/types/perdas';

const LIMITE_LISTA = 30;
const TURNOS = [
  { codigo: 'M', rotulo: 'Manhã' },
  { codigo: 'T', rotulo: 'Tarde' },
  { codigo: 'N', rotulo: 'Noite' },
];

function parseNumero(texto: string): number | null {
  const normalizado = texto.replace(',', '.').trim();
  if (!normalizado) {
    return null;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function novoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hojeBr(): string {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${hoje.getFullYear()}`;
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

function dataBrParaIso(texto: string): string | null {
  const match = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3]);
  const data = new Date(ano, mes - 1, dia, 12, 0, 0);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return null;
  }
  return data.toISOString();
}

function turnoPadrao(): string {
  const hora = new Date().getHours();
  if (hora < 12) {
    return 'M';
  }
  if (hora < 18) {
    return 'T';
  }
  return 'N';
}

interface SeletorProps<T> {
  titulo: string;
  valor: string;
  onChangeText: (texto: string) => void;
  opcoes: T[];
  selecionado: T | null;
  onSelecionar: (item: T) => void;
  rotulo: (item: T) => string;
  chave: (item: T) => string;
  vazio?: string;
  exigirBusca?: boolean;
}

function Seletor<T>({
  titulo,
  valor,
  onChangeText,
  opcoes,
  selecionado,
  onSelecionar,
  rotulo,
  chave,
  vazio,
  exigirBusca = false,
}: SeletorProps<T>) {
  const [aberto, setAberto] = useState(!exigirBusca);

  useEffect(() => {
    if (selecionado) {
      setAberto(false);
    }
  }, [selecionado]);

  const filtradas = useMemo(() => {
    const busca = valor.trim().toLowerCase();
    const rotuloSelecionado = selecionado ? rotulo(selecionado).toLowerCase() : '';
    const buscaAtiva = Boolean(busca && busca !== rotuloSelecionado);
    const lista = buscaAtiva
      ? opcoes.filter((item) => rotulo(item).toLowerCase().includes(busca))
      : exigirBusca
        ? []
        : opcoes;
    return { total: lista.length, visiveis: lista.slice(0, LIMITE_LISTA), buscaAtiva };
  }, [exigirBusca, opcoes, rotulo, selecionado, valor]);

  const mostrarLista = exigirBusca ? filtradas.buscaAtiva && aberto : aberto || !selecionado;

  return (
    <View style={styles.campo}>
      <Text style={styles.label}>{titulo}</Text>
      <TextInput
        value={valor}
        onChangeText={(texto) => {
          onChangeText(texto);
          setAberto(true);
        }}
        onFocus={() => {
          if (!exigirBusca) {
            setAberto(true);
          }
        }}
        placeholder="Digite para buscar…"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      {selecionado ? <Text style={styles.selecionado}>Selecionado: {rotulo(selecionado)}</Text> : null}
      {exigirBusca && !mostrarLista && !selecionado ? (
        <Text style={styles.vazio}>
          {opcoes.length > 0 ? 'Digite para ver as opções.' : (vazio ?? 'Nenhuma opção disponível.')}
        </Text>
      ) : null}
      {mostrarLista ? (
        opcoes.length === 0 ? (
          <Text style={styles.vazio}>{vazio ?? 'Nenhuma opção disponível.'}</Text>
        ) : filtradas.total === 0 ? (
          <Text style={styles.vazio}>Nenhuma opção encontrada para essa busca.</Text>
        ) : (
          <View>
            {filtradas.visiveis.map((item) => (
              <Pressable
                key={chave(item)}
                onPress={() => onSelecionar(item)}
                style={[styles.opcao, selecionado && chave(selecionado) === chave(item) && styles.opcaoAtiva]}
              >
                <Text style={styles.opcaoTexto}>{rotulo(item)}</Text>
              </Pressable>
            ))}
            {filtradas.total > LIMITE_LISTA ? (
              <Text style={styles.listaHint}>
                Mostrando {LIMITE_LISTA} de {filtradas.total}. Continue digitando para filtrar.
              </Text>
            ) : (
              <Text style={styles.listaHint}>{filtradas.total} opção(ões)</Text>
            )}
          </View>
        )
      ) : selecionado && !exigirBusca ? (
        <Pressable onPress={() => setAberto(true)} style={styles.trocar}>
          <Text style={styles.trocarTexto}>Ver opções</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function PerdasColheitaScreen() {
  const { pode } = useDeviceAccess();
  const router = useRouter();
  const { coordenada } = useUserLocation();
  const [cadastros, setCadastros] = useState<CadastrosPerda | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [codTipocorte, setCodTipocorte] = useState(2);
  const [dataAmostra, setDataAmostra] = useState(hojeBr);
  const [turno, setTurno] = useState(turnoPadrao);
  const [bituca, setBituca] = useState(false);

  const [buscaFazenda, setBuscaFazenda] = useState('');
  const [buscaTalhao, setBuscaTalhao] = useState('');
  const [buscaFrente, setBuscaFrente] = useState('');
  const [buscaEquipamento, setBuscaEquipamento] = useState('');
  const [buscaOperador, setBuscaOperador] = useState('');

  const [fazenda, setFazenda] = useState<FazendaPerdaCadastro | null>(null);
  const [talhao, setTalhao] = useState<TalhaoPerdaCadastro | null>(null);
  const [frente, setFrente] = useState<FrenteCadastro | null>(null);
  const [equipamento, setEquipamento] = useState<EquipamentoCadastro | null>(null);
  const [operador, setOperador] = useState<OperadorCadastro | null>(null);
  const [quantidades, setQuantidades] = useState<Record<number, string>>({});
  const rascunhoIdRef = useState(() => ({ current: novoId() }))[0];

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setCadastros(await obterCadastrosPerda());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro ao carregar cadastros de perdas.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void recarregar();
    }, [recarregar]),
  );

  const tiposCorte: TipoCorteCadastro[] = cadastros?.tiposCorte?.length
    ? cadastros.tiposCorte
    : [
        { codTipocorte: 1, descricao: 'Manual' },
        { codTipocorte: 2, descricao: 'Mecanizado' },
      ];

  const tiposPerda = useMemo(
    () => (cadastros?.tiposPerda ?? []).filter((item) => item.codTipocorte === codTipocorte),
    [cadastros, codTipocorte],
  );

  const talhoesFazenda = useMemo(() => {
    if (!cadastros || !fazenda) {
      return [];
    }
    return cadastros.talhoes
      .filter((item) => item.codFazenda === fazenda.codFazenda)
      .sort((a, b) => a.codTalhao - b.codTalhao);
  }, [cadastros, fazenda]);

  const totalKg = useMemo(() => {
    return tiposPerda.reduce((soma, tipo) => soma + (parseNumero(quantidades[tipo.codTipoperda] ?? '') ?? 0), 0);
  }, [quantidades, tiposPerda]);

  const areaAmostra =
    codTipocorte === 1
      ? (cadastros?.parametros.areaAmostraManual ?? 10)
      : (cadastros?.parametros.areaAmostraMecanizada ?? 10);
  const meta =
    codTipocorte === 1 ? (cadastros?.parametros.metaManual ?? 2.5) : (cadastros?.parametros.metaMecanizada ?? 3.5);

  const montarRascunho = (): PerdaRascunho | null => {
    const dataIso = dataBrParaIso(dataAmostra);
    if (!fazenda || !talhao || !dataIso) {
      return null;
    }
    const itens = tiposPerda
      .map((tipo) => ({
        codTipoperda: tipo.codTipoperda,
        descricao: tipo.descricao,
        quantidade: parseNumero(quantidades[tipo.codTipoperda] ?? '') ?? 0,
      }))
      .filter((item) => item.quantidade > 0);
    if (itens.length === 0) {
      return null;
    }
    return {
      id: rascunhoIdRef.current,
      codTipocorte,
      nomeTipocorte: tiposCorte.find((t) => t.codTipocorte === codTipocorte)?.descricao ?? String(codTipocorte),
      codFazenda: fazenda.codFazenda,
      nomeFazenda: fazenda.nome,
      codTalhao: talhao.codTalhao,
      nomeTalhao: talhao.descricao,
      zona: talhao.zona,
      codSafra: talhao.codSafra,
      codSafradetalhe: talhao.codSafradetalhe,
      dataAmostra: dataIso,
      turno,
      codFrente: frente?.codFrente ?? null,
      nomeFrente: frente?.descricao,
      codEquipamento: equipamento?.codEquipamento ?? null,
      nomeEquipamento: equipamento?.descricao,
      codOperador: operador?.codOperador ?? null,
      nomeOperador: operador?.nome,
      tipoOperador: operador ? 'F' : 'T',
      bituca: bituca ? 'S' : 'N',
      latitude: coordenada ? String(coordenada.latitude) : null,
      longitude: coordenada ? String(coordenada.longitude) : null,
      itens,
      criadoEm: new Date().toISOString(),
      syncStatus: 'pendente',
    };
  };

  const salvarLocal = () => {
    const dataIso = dataBrParaIso(dataAmostra);
    if (!fazenda || !talhao || !dataIso) {
      Alert.alert('Faltam dados', 'Informe data, fazenda e talhão.');
      return;
    }
    if (tiposPerda.length === 0) {
      Alert.alert('Faltam dados', 'Não há tipos de perda para este tipo de amostra.');
      return;
    }

    const rascunho = montarRascunho();
    if (!rascunho) {
      Alert.alert('Faltam quantidades', 'Informe pelo menos um tipo de perda com quantidade maior que zero.');
      return;
    }
    const total = rascunho.itens.reduce((soma, item) => soma + item.quantidade, 0);

    Alert.alert(
      'Salvar no celular',
      `Salvar amostra ${tiposCorte.find((t) => t.codTipocorte === codTipocorte)?.descricao ?? ''} em ${fazenda.nome} / talhão ${talhao.codTalhao}?\nTotal: ${total.toFixed(3)} kg em ${areaAmostra} m².`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salvar',
          onPress: async () => {
            setSalvando(true);
            setErro(null);
            try {
              await salvarPerdaLocal(rascunho);
              rascunhoIdRef.current = novoId();
              Alert.alert(
                'Salvo no celular',
                'A perda ficou pendente neste aparelho. Envie ao Oracle na tela Apontamentos salvos.',
                [
                  { text: 'Continuar lançando' },
                  ...(pode('salvos') ? [{ text: 'Ver pendentes', onPress: () => router.push('/apontamentos-locais') }] : []),
                ],
              );
              setQuantidades({});
            } catch (falha) {
              setErro(falha instanceof Error ? falha.message : 'Falha ao salvar.');
            } finally {
              setSalvando(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header subtitle="Perdas de colheita · amostra" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable onPress={() => router.replace('/')} style={styles.back}>
          <Text style={styles.backText}>← Início</Text>
        </Pressable>

        <Text style={styles.intro}>
          O tipo de amostra (manual ou mecanizado) define quais perdas aparecem. Salve no celular para ficar pendente e
          envie ao Oracle na tela de apontamentos salvos.
        </Text>

        {carregando ? (
          <View style={styles.carregandoBox}>
            <ActivityIndicator color={colors.leaf} />
            <Text style={styles.carregandoTexto}>Carregando tipos de perda…</Text>
          </View>
        ) : null}
        {erro ? <Text style={styles.erro}>{erro}</Text> : null}

        <View style={styles.campo}>
          <Text style={styles.label}>Tipo de amostra</Text>
          <View style={styles.tipoLinha}>
            {tiposCorte.map((tipo) => (
              <Pressable
                key={tipo.codTipocorte}
                onPress={() => {
                  setCodTipocorte(tipo.codTipocorte);
                  setQuantidades({});
                }}
                style={[styles.tipoBotao, codTipocorte === tipo.codTipocorte && styles.tipoBotaoAtivo]}
              >
                <Text style={[styles.tipoTexto, codTipocorte === tipo.codTipocorte && styles.tipoTextoAtivo]}>
                  {tipo.descricao}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.campo}>
          <Text style={styles.label}>Data da amostra (dd/mm/aaaa)</Text>
          <TextInput
            value={dataAmostra}
            onChangeText={(texto) => setDataAmostra(formatarDataDigitada(texto))}
            placeholder="dd/mm/aaaa"
            placeholderTextColor={colors.muted}
            style={styles.input}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>

        <View style={styles.campo}>
          <Text style={styles.label}>Turno</Text>
          <View style={styles.tipoLinha}>
            {TURNOS.map((item) => (
              <Pressable
                key={item.codigo}
                onPress={() => setTurno(item.codigo)}
                style={[styles.tipoBotao, turno === item.codigo && styles.tipoBotaoAtivo]}
              >
                <Text style={[styles.tipoTexto, turno === item.codigo && styles.tipoTextoAtivo]}>{item.rotulo}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Seletor
          titulo="Fazenda"
          valor={buscaFazenda}
          onChangeText={setBuscaFazenda}
          opcoes={cadastros?.fazendas ?? []}
          selecionado={fazenda}
          exigirBusca
          onSelecionar={(item) => {
            setFazenda(item);
            setBuscaFazenda(item.nome);
            setTalhao(null);
            setBuscaTalhao('');
          }}
          rotulo={(f) => `${f.codFazenda} — ${f.nome}`}
          chave={(f) => String(f.codFazenda)}
          vazio={carregando ? 'Carregando fazendas…' : 'Nenhuma fazenda encontrada.'}
        />

        <Seletor
          titulo="Talhão"
          valor={buscaTalhao}
          onChangeText={setBuscaTalhao}
          opcoes={talhoesFazenda}
          selecionado={talhao}
          exigirBusca
          onSelecionar={(item) => {
            setTalhao(item);
            setBuscaTalhao(`${item.codTalhao} — ${item.descricao}`);
          }}
          rotulo={(t) => `${t.codTalhao} — ${t.descricao}`}
          chave={(t) => String(t.codTalhao)}
          vazio={!fazenda ? 'Selecione a fazenda primeiro.' : 'Nenhum talhão nesta fazenda.'}
        />

        <Seletor
          titulo="Frente"
          valor={buscaFrente}
          onChangeText={setBuscaFrente}
          opcoes={cadastros?.frentes ?? []}
          selecionado={frente}
          onSelecionar={(item) => {
            setFrente(item);
            setBuscaFrente(item.descricao);
          }}
          rotulo={(f) => `${f.codFrente} — ${f.descricao}`}
          chave={(f) => String(f.codFrente)}
          vazio="Nenhuma frente cadastrada."
        />

        <Seletor
          titulo="Equipamento"
          valor={buscaEquipamento}
          onChangeText={setBuscaEquipamento}
          opcoes={cadastros?.equipamentos ?? []}
          selecionado={equipamento}
          exigirBusca
          onSelecionar={(item) => {
            setEquipamento(item);
            setBuscaEquipamento(`${item.codEquipamento} — ${item.descricao}`);
          }}
          rotulo={(e) => `${e.codEquipamento} — ${e.descricao}`}
          chave={(e) => String(e.codEquipamento)}
          vazio="Nenhum equipamento de colheita encontrado."
        />

        <Seletor
          titulo="Operador"
          valor={buscaOperador}
          onChangeText={setBuscaOperador}
          opcoes={cadastros?.operadores ?? []}
          selecionado={operador}
          exigirBusca
          onSelecionar={(item) => {
            setOperador(item);
            setBuscaOperador(`${item.nome} — ${item.codOperador}`);
          }}
          rotulo={(o) => `${o.nome} — ${o.codOperador}`}
          chave={(o) => String(o.codOperador)}
          vazio="Nenhum operador encontrado."
        />

        <Pressable onPress={() => setBituca((atual) => !atual)} style={styles.check}>
          <View style={[styles.checkBox, bituca && styles.checkBoxAtivo]} />
          <Text style={styles.checkTexto}>Houve catação de bituca</Text>
        </Pressable>

        <View style={styles.cardCalc}>
          <Text style={styles.calcTitulo}>ÁREA DA AMOSTRA · META</Text>
          <Text style={styles.calcValor}>
            {areaAmostra} m² · meta {meta} t/ha
          </Text>
          <Text style={styles.calcFormula}>
            {tiposPerda.length} tipo(s) de perda deste corte · total lançado {totalKg.toFixed(3)} kg
          </Text>
        </View>

        <Text style={styles.secao}>Tipos de perda</Text>
        {tiposPerda.length === 0 && !carregando ? (
          <Text style={styles.vazio}>Nenhum tipo de perda ativo para este corte em agricola.historico_tipoperda.</Text>
        ) : null}
        {tiposPerda.map((tipo) => (
          <View key={tipo.codTipoperda} style={styles.campo}>
            <Text style={styles.label}>{tipo.descricao}</Text>
            <TextInput
              value={quantidades[tipo.codTipoperda] ?? ''}
              onChangeText={(texto) => setQuantidades((atual) => ({ ...atual, [tipo.codTipoperda]: texto }))}
              placeholder="0"
              placeholderTextColor={colors.muted}
              style={styles.input}
              keyboardType="decimal-pad"
            />
          </View>
        ))}

        <View style={styles.acoes}>
          <ActionButton
            label={salvando ? 'Salvando…' : 'Salvar no celular'}
            onPress={salvarLocal}
            loading={salvando}
            disabled={salvando || carregando}
          />
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
  intro: { color: colors.muted, fontWeight: '600', lineHeight: 20, marginBottom: 16 },
  carregandoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  carregandoTexto: { color: colors.muted, fontWeight: '600' },
  erro: { color: colors.danger, fontWeight: '700', marginBottom: 12 },
  campo: { marginBottom: 14 },
  label: { color: colors.muted, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.creamDark,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontWeight: '600',
  },
  selecionado: { color: colors.leaf, fontWeight: '700', fontSize: 12, marginTop: 6 },
  vazio: { color: colors.muted, fontWeight: '600', fontSize: 12, marginTop: 8 },
  listaHint: { color: colors.muted, fontWeight: '600', fontSize: 11, marginTop: 8 },
  trocar: { marginTop: 8, alignSelf: 'flex-start' },
  trocarTexto: { color: colors.leaf, fontWeight: '800', fontSize: 13 },
  opcao: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.creamDark,
  },
  opcaoAtiva: { borderColor: colors.leaf, backgroundColor: colors.successSoft },
  opcaoTexto: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  tipoLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipoBotao: {
    flexGrow: 1,
    flexBasis: 96,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.creamDark,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tipoBotaoAtivo: { borderColor: colors.leaf, backgroundColor: colors.successSoft },
  tipoTexto: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  tipoTextoAtivo: { color: colors.forest },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.leaf,
    backgroundColor: colors.white,
  },
  checkBoxAtivo: { backgroundColor: colors.leaf },
  checkTexto: { color: colors.forest, fontWeight: '700' },
  cardCalc: {
    backgroundColor: colors.forest,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  calcTitulo: { color: colors.accent, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  calcValor: { color: colors.white, fontWeight: '800', fontSize: 22, marginVertical: 6 },
  calcFormula: { color: colors.creamDark, fontWeight: '600', fontSize: 12 },
  secao: { color: colors.forest, fontWeight: '800', fontSize: 16, marginBottom: 10 },
  acoes: { gap: 10, marginTop: 8 },
});
