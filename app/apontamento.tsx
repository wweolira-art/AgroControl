import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDeviceAccess } from '../src/auth/DeviceAccessProvider';

import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import {
  garantirCadastrosApontamento,
  resumoCadastros,
} from '../src/services/apontamento';
import { carregarRascunhosLocal, salvarRascunhoLocal } from '../src/services/apontamento-local';
import { colors } from '../src/theme/colors';
import {
  TIPOS_OPERACAO_ERP,
  materiaisDoRascunho,
  type ApontamentoRascunho,
  type CadastrosApontamento,
  type FazendaCadastro,
  type FuncionarioCadastro,
  type MaterialCadastro,
  type MeioAplicacaoCadastro,
  type OperacaoCadastro,
  type TalhaoCadastro,
} from '../src/types/apontamento';

function novoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseNumero(texto: string): number | null {
  const normalizado = texto.replace(',', '.').trim();
  if (!normalizado) {
    return null;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
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

function dataIsoParaBr(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) {
    return hojeBr();
  }
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
}

const LIMITE_LISTA = 30;

type CampoId =
  | 'data'
  | 'fazenda'
  | 'talhao'
  | 'operacao'
  | 'funcionario'
  | 'meio'
  | 'material'
  | 'quantidade'
  | 'area';

interface CampoPendente {
  id: CampoId;
  rotulo: string;
}

interface LinhaMaterial {
  id: string;
  material: MaterialCadastro;
  quantidade: number;
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
  invalido?: boolean;
  onLayoutCampo?: (evento: LayoutChangeEvent) => void;
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
  invalido = false,
  onLayoutCampo,
  exigirBusca = false,
}: SeletorProps<T>) {
  const [aberto, setAberto] = useState(!exigirBusca);

  useEffect(() => {
    if (selecionado) {
      setAberto(false);
    }
  }, [selecionado]);

  useEffect(() => {
    if (invalido && !selecionado && !exigirBusca) {
      setAberto(true);
    }
  }, [exigirBusca, invalido, selecionado]);

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

  const mostrarLista = exigirBusca
    ? filtradas.buscaAtiva && aberto
    : aberto || !selecionado;

  return (
    <View style={[styles.campo, invalido && styles.campoErro]} onLayout={onLayoutCampo}>
      <Text style={[styles.label, invalido && styles.labelErro]}>{titulo}</Text>
      <TextInput
        value={valor}
        onChangeText={(texto) => {
          onChangeText(texto);
          setAberto(true);
        }}
        onFocus={() => {
          if (exigirBusca) {
            return;
          }
          setAberto(true);
        }}
        placeholder="Digite para buscar…"
        placeholderTextColor={colors.muted}
        style={[styles.input, invalido && styles.inputErro]}
      />
      {invalido && !selecionado ? <Text style={styles.avisoCampo}>Selecione uma opção.</Text> : null}
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
          <View style={styles.listaOpcoes}>
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

export default function ApontamentoScreen() {
  const { pode } = useDeviceAccess();
  const router = useRouter();
  const params = useLocalSearchParams<{
    codigoFazenda?: string;
    talhao?: string;
    nomeFazenda?: string;
    editarId?: string;
  }>();

  const [cadastros, setCadastros] = useState<CadastrosApontamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentouEnviar, setTentouEnviar] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const posicoesCampos = useRef<Partial<Record<CampoId, number>>>({});

  const [buscaFazenda, setBuscaFazenda] = useState('');
  const [buscaTalhao, setBuscaTalhao] = useState('');
  const [buscaOperacao, setBuscaOperacao] = useState('');
  const [buscaFuncionario, setBuscaFuncionario] = useState('');
  const [buscaMeio, setBuscaMeio] = useState('');
  const [buscaMaterial, setBuscaMaterial] = useState('');

  const [fazenda, setFazenda] = useState<FazendaCadastro | null>(null);
  const [talhao, setTalhao] = useState<TalhaoCadastro | null>(null);
  const [operacao, setOperacao] = useState<OperacaoCadastro | null>(null);
  const [tipoOperacao, setTipoOperacao] = useState('M');
  const [funcionario, setFuncionario] = useState<FuncionarioCadastro | null>(null);
  const [meioAplicacao, setMeioAplicacao] = useState<MeioAplicacaoCadastro | null>(null);
  const [material, setMaterial] = useState<MaterialCadastro | null>(null);
  const [linhasMateriais, setLinhasMateriais] = useState<LinhaMaterial[]>([]);

  const [quantidade, setQuantidade] = useState('');
  const [areaAplicada, setAreaAplicada] = useState('');
  const [dataApontamento, setDataApontamento] = useState(hojeBr);

  const talhoesFazenda = useMemo(() => {
    if (!cadastros || !fazenda) {
      return [];
    }
    const unicos = new Map<number, TalhaoCadastro>();
    for (const item of cadastros.talhoes) {
      if (item.codFazenda !== fazenda.codFazenda) {
        continue;
      }
      const atual = unicos.get(item.codTalhao);
      if (!atual || (item.codSafra ?? 0) > (atual.codSafra ?? 0)) {
        unicos.set(item.codTalhao, item);
      }
    }
    return [...unicos.values()].sort((a, b) => a.codTalhao - b.codTalhao);
  }, [cadastros, fazenda]);

  const tiposOperacao = useMemo(() => {
    const lista = cadastros?.tiposOperacao?.filter((item) => item.tipoOperacao && item.descricao) ?? [];
    return lista.length > 0 ? lista : TIPOS_OPERACAO_ERP;
  }, [cadastros]);

  const listaMateriaisPronta = useMemo((): LinhaMaterial[] => {
    const lista = [...linhasMateriais];
    const quantidadeNum = parseNumero(quantidade);
    if (material && quantidadeNum != null && quantidadeNum > 0) {
      const idx = lista.findIndex((item) => item.material.codMaterial === material.codMaterial);
      if (idx >= 0) {
        lista[idx] = { ...lista[idx], quantidade: quantidadeNum };
      } else {
        lista.push({ id: novoId(), material, quantidade: quantidadeNum });
      }
    }
    return lista;
  }, [linhasMateriais, material, quantidade]);

  const pendentes = useMemo((): CampoPendente[] => {
    const areaNum = parseNumero(areaAplicada);
    const faltando: CampoPendente[] = [];
    if (!dataBrParaIso(dataApontamento)) {
      faltando.push({ id: 'data', rotulo: 'Data do apontamento' });
    }
    if (!fazenda) {
      faltando.push({ id: 'fazenda', rotulo: 'Fazenda' });
    }
    if (!talhao) {
      faltando.push({ id: 'talhao', rotulo: 'Talhão' });
    }
    if (!operacao) {
      faltando.push({ id: 'operacao', rotulo: 'Operação' });
    }
    if (!funcionario) {
      faltando.push({ id: 'funcionario', rotulo: 'Funcionário' });
    }
    if (!meioAplicacao) {
      faltando.push({ id: 'meio', rotulo: 'Meio de aplicação' });
    }
    if (listaMateriaisPronta.length === 0) {
      if (!material) {
        faltando.push({ id: 'material', rotulo: 'Material' });
      }
      faltando.push({ id: 'quantidade', rotulo: 'Quantidade' });
    }
    if (areaNum == null || areaNum <= 0) {
      faltando.push({ id: 'area', rotulo: 'Área aplicada' });
    }
    return faltando;
  }, [areaAplicada, dataApontamento, fazenda, funcionario, listaMateriaisPronta.length, material, meioAplicacao, operacao, talhao]);

  const campoInvalido = (id: CampoId) => tentouEnviar && pendentes.some((item) => item.id === id);

  const registrarCampo = (id: CampoId) => (evento: LayoutChangeEvent) => {
    posicoesCampos.current[id] = evento.nativeEvent.layout.y;
  };

  const irParaCampo = (id: CampoId) => {
    const y = posicoesCampos.current[id];
    if (y == null) {
      return;
    }
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    });
  };

  const validarCampos = (): boolean => {
    if (pendentes.length === 0) {
      setTentouEnviar(false);
      return true;
    }
    setTentouEnviar(true);
    setTimeout(() => irParaCampo(pendentes[0].id), 80);
    return false;
  };

  useEffect(() => {
    if (tentouEnviar && pendentes.length === 0) {
      setTentouEnviar(false);
    }
  }, [pendentes.length, tentouEnviar]);

  const rascunhoIdRef = useRef(novoId());
  const cadastrosRef = useRef(cadastros);
  cadastrosRef.current = cadastros;

  const recarregar = useCallback(async () => {
    const atual = cadastrosRef.current;
    const jaTemOpcoes = Boolean(
      atual &&
        (atual.fazendas.length > 0 ||
          atual.talhoes.length > 0 ||
          atual.materiais.length > 0 ||
          atual.operacoes.length > 0 ||
          (atual.funcionarios?.length ?? 0) > 0),
    );
    if (!jaTemOpcoes) {
      setCarregando(true);
    }
    setErro(null);
    try {
      const dados = await garantirCadastrosApontamento();
      setCadastros(dados);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro ao carregar cadastros.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void recarregar();
    }, [recarregar]),
  );

  useEffect(() => {
    if (!cadastros) {
      return;
    }
    if (params.editarId) {
      return;
    }
    const codFazenda = Number(params.codigoFazenda);
    const codTalhao = Number(params.talhao);
    if (!Number.isFinite(codFazenda) || codFazenda <= 0) {
      return;
    }

    const faz = cadastros.fazendas.find((f) => f.codFazenda === codFazenda);
    if (faz) {
      setFazenda(faz);
      setBuscaFazenda(faz.nome);
    } else if (params.nomeFazenda) {
      setBuscaFazenda(params.nomeFazenda);
    }

    if (Number.isFinite(codTalhao) && codTalhao > 0) {
      const tal = cadastros.talhoes.find((t) => t.codFazenda === codFazenda && t.codTalhao === codTalhao);
      if (tal) {
        setTalhao(tal);
        setBuscaTalhao(`${tal.codTalhao} — ${tal.descricao}`);
      }
    }
  }, [cadastros, params.codigoFazenda, params.editarId, params.nomeFazenda, params.talhao]);

  useEffect(() => {
    if (!cadastros || !params.editarId) {
      return;
    }
    let ativo = true;
    void carregarRascunhosLocal().then((rascunhos) => {
      if (!ativo) {
        return;
      }
      const rascunho = rascunhos.find((item) => item.id === params.editarId);
      if (!rascunho) {
        setErro('Apontamento salvo não encontrado neste aparelho.');
        return;
      }

      rascunhoIdRef.current = rascunho.id;
      setDataApontamento(dataIsoParaBr(rascunho.dataApontamento));
      setTipoOperacao(rascunho.tipoOperacao || 'M');
      setAreaAplicada(String(rascunho.areaAplicada).replace('.', ','));

      const faz = cadastros.fazendas.find((item) => item.codFazenda === rascunho.codFazenda) ?? {
        codFazenda: rascunho.codFazenda,
        nome: rascunho.nomeFazenda,
      };
      setFazenda(faz);
      setBuscaFazenda(`${faz.codFazenda} — ${faz.nome}`);

      const tal =
        cadastros.talhoes.find(
          (item) => item.codFazenda === rascunho.codFazenda && item.codTalhao === rascunho.codTalhao,
        ) ?? {
          codFazenda: rascunho.codFazenda,
          codTalhao: rascunho.codTalhao,
          zona: rascunho.zona,
          areaHa: null,
          descricao: rascunho.nomeTalhao,
          codSafra: rascunho.codSafra,
        };
      setTalhao(tal);
      setBuscaTalhao(`${tal.codTalhao} — ${tal.descricao}`);

      const op = cadastros.operacoes.find((item) => item.codOperacao === rascunho.codOperacao) ?? {
        codOperacao: rascunho.codOperacao,
        descricao: rascunho.nomeOperacao,
        codObjetocusto: 0,
        codTipofazenda: 1,
        codGrupoempresa: 1,
        codEmpresa: 1,
        codFilial: 1,
      };
      setOperacao(op);
      setBuscaOperacao(`${op.codOperacao} — ${op.descricao}`);

      const func = cadastros.funcionarios.find((item) => item.codFuncionario === rascunho.codFuncionario) ?? {
        codFuncionario: rascunho.codFuncionario,
        nome: rascunho.nomeFuncionario,
      };
      setFuncionario(func);
      setBuscaFuncionario(`${func.nome} — ${func.codFuncionario}`);

      const meio = cadastros.meiosAplicacao.find((item) => item.codMeioaplicacao === rascunho.codMeioaplicacao) ?? {
        codMeioaplicacao: rascunho.codMeioaplicacao,
        descricao: rascunho.nomeMeioaplicacao,
      };
      setMeioAplicacao(meio);
      setBuscaMeio(`${meio.codMeioaplicacao} — ${meio.descricao}`);

      const materiais = materiaisDoRascunho(rascunho).map((linha) => {
        const mat = cadastros.materiais.find((item) => item.codMaterial === linha.codMaterial) ?? {
          codMaterial: linha.codMaterial,
          descricao: linha.nomeMaterial,
          codUnidade: linha.codUnidade,
        };
        return {
          id: `${rascunho.id}-${linha.codMaterial}`,
          material: mat,
          quantidade: linha.quantidade,
        };
      });
      setLinhasMateriais(materiais);
      setMaterial(null);
      setBuscaMaterial('');
      setQuantidade('');
      setTentouEnviar(false);
    });
    return () => {
      ativo = false;
    };
  }, [cadastros, params.editarId]);

  useEffect(() => {
    if (!tiposOperacao.some((item) => item.tipoOperacao === tipoOperacao)) {
      const mecanizado = tiposOperacao.find((item) => item.tipoOperacao === 'M');
      setTipoOperacao(mecanizado?.tipoOperacao ?? tiposOperacao[0]?.tipoOperacao ?? 'M');
    }
  }, [tipoOperacao, tiposOperacao]);

  const adicionarMaterial = () => {
    const quantidadeNum = parseNumero(quantidade);
    if (!material) {
      setTentouEnviar(true);
      irParaCampo('material');
      return;
    }
    if (quantidadeNum == null || quantidadeNum <= 0) {
      setTentouEnviar(true);
      irParaCampo('quantidade');
      return;
    }
    setLinhasMateriais((atual) => {
      const idx = atual.findIndex((item) => item.material.codMaterial === material.codMaterial);
      if (idx >= 0) {
        const proxima = [...atual];
        proxima[idx] = { ...proxima[idx], quantidade: quantidadeNum };
        return proxima;
      }
      return [...atual, { id: novoId(), material, quantidade: quantidadeNum }];
    });
    setMaterial(null);
    setBuscaMaterial('');
    setQuantidade('');
  };

  const removerMaterial = (id: string) => {
    setLinhasMateriais((atual) => atual.filter((item) => item.id !== id));
  };

  const montarRascunho = (): ApontamentoRascunho | null => {
    const areaNum = parseNumero(areaAplicada);
    const dataIso = dataBrParaIso(dataApontamento);
    const materiais = listaMateriaisPronta;
    const primeiro = materiais[0];
    if (!fazenda || !talhao || !operacao || !funcionario || !meioAplicacao || !primeiro || areaNum == null || !dataIso) {
      return null;
    }
    return {
      id: rascunhoIdRef.current,
      codFazenda: fazenda.codFazenda,
      nomeFazenda: fazenda.nome,
      codTalhao: talhao.codTalhao,
      nomeTalhao: talhao.descricao,
      zona: talhao.zona,
      codSafra: talhao.codSafra,
      codOperacao: operacao.codOperacao,
      nomeOperacao: operacao.descricao,
      tipoOperacao,
      codFuncionario: funcionario.codFuncionario,
      nomeFuncionario: funcionario.nome,
      codMeioaplicacao: meioAplicacao.codMeioaplicacao,
      nomeMeioaplicacao: meioAplicacao.descricao,
      codMaterial: primeiro.material.codMaterial,
      nomeMaterial: primeiro.material.descricao,
      codUnidade: primeiro.material.codUnidade,
      dose: 0,
      areaAplicada: areaNum,
      quantidade: primeiro.quantidade,
      materiais: materiais.map((item) => ({
        codMaterial: item.material.codMaterial,
        nomeMaterial: item.material.descricao,
        codUnidade: item.material.codUnidade,
        quantidade: item.quantidade,
        dose: 0,
      })),
      dataApontamento: dataIso,
      criadoEm: new Date().toISOString(),
      syncStatus: 'pendente',
    };
  };

  const salvarLocal = async () => {
    if (!validarCampos()) {
      return;
    }
    const rascunho = montarRascunho();
    if (!rascunho) {
      return;
    }
    await salvarRascunhoLocal({ ...rascunho, syncStatus: 'pendente' });
    rascunhoIdRef.current = novoId();
    setQuantidade('');
    setAreaAplicada('');
    setLinhasMateriais([]);
    setMaterial(null);
    setBuscaMaterial('');
    Alert.alert(
      'Salvo no celular',
      'O apontamento ficou pendente neste aparelho. Envie ao Oracle na tela Apontamentos salvos.',
      [
        { text: 'Continuar lançando' },
        ...(pode('salvos') ? [{ text: 'Ver pendentes', onPress: () => router.push('/apontamentos-locais') }] : []),
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header subtitle="Insumos · vários materiais na mesma operação" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Voltar</Text>
        </Pressable>

        {pode('cadastros') && <Pressable onPress={() => router.push('/importar-cadastro-apontamento')} style={styles.link}>
          <Text style={styles.linkText}>Cadastros · {resumoCadastros(cadastros)}</Text>
        </Pressable>}
        {pode('salvos') && <Pressable onPress={() => router.push('/apontamentos-locais')} style={styles.link}>
          <Text style={styles.linkText}>Apontamentos salvos no celular</Text>
        </Pressable>}

        {carregando ? (
          <View style={styles.carregandoBox}>
            <ActivityIndicator color={colors.leaf} />
            <Text style={styles.carregandoTexto}>Carregando opções de lançamento…</Text>
          </View>
        ) : null}
        {erro ? (
          <>
            <Text style={styles.erro}>{erro}</Text>
            <View style={styles.retry}>
              <ActionButton label="Tentar de novo" variant="ghost" onPress={() => void recarregar()} />
            </View>
          </>
        ) : null}

        {pendentes.length > 0 ? (
          <View style={[styles.indicador, tentouEnviar && styles.indicadorErro]}>
            <Text style={[styles.indicadorTitulo, tentouEnviar && styles.indicadorTituloErro]}>
              {tentouEnviar
                ? `Falta informar ${pendentes.length} campo${pendentes.length > 1 ? 's' : ''}`
                : `Ainda falta informar ${pendentes.length} campo${pendentes.length > 1 ? 's' : ''}`}
            </Text>
            {pendentes.map((campo) => (
              <Pressable key={campo.id} onPress={() => irParaCampo(campo.id)} style={styles.indicadorItem}>
                <Text style={[styles.indicadorTexto, tentouEnviar && styles.indicadorTextoErro]}>• {campo.rotulo}</Text>
              </Pressable>
            ))}
            <Text style={styles.indicadorDica}>Toque no item para ir até o campo.</Text>
          </View>
        ) : (
          <View style={styles.indicadorOk}>
            <Text style={styles.indicadorOkTexto}>Tudo preenchido. Salve no celular para ficar pendente.</Text>
          </View>
        )}

        <View
          style={[styles.campo, campoInvalido('data') && styles.campoErro]}
          onLayout={registrarCampo('data')}
        >
          <Text style={[styles.label, campoInvalido('data') && styles.labelErro]}>Data do apontamento</Text>
          <TextInput
            value={dataApontamento}
            onChangeText={(texto) => setDataApontamento(formatarDataDigitada(texto))}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={colors.muted}
            style={[styles.input, campoInvalido('data') && styles.inputErro]}
          />
          {!dataBrParaIso(dataApontamento) ? (
            <Text style={campoInvalido('data') ? styles.avisoCampo : styles.vazio}>
              Informe a data no formato DD/MM/AAAA.
            </Text>
          ) : null}
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
          invalido={campoInvalido('fazenda')}
          onLayoutCampo={registrarCampo('fazenda')}
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
          rotulo={(t) => `${t.codTalhao} — ${t.descricao}${t.areaHa != null ? ` (${t.areaHa} ha)` : ''}`}
          chave={(t) => `${t.codFazenda}-${t.codTalhao}`}
          vazio={fazenda ? 'Nenhum talhão nesta fazenda.' : 'Selecione a fazenda para ver os talhões.'}
          invalido={campoInvalido('talhao')}
          onLayoutCampo={registrarCampo('talhao')}
        />

        <Seletor
          titulo="Operação"
          valor={buscaOperacao}
          onChangeText={setBuscaOperacao}
          opcoes={cadastros?.operacoes ?? []}
          selecionado={operacao}
          exigirBusca
          onSelecionar={(item) => {
            setOperacao(item);
            setBuscaOperacao(item.descricao);
          }}
          rotulo={(o) => `${o.codOperacao} — ${o.descricao}`}
          chave={(o) => String(o.codOperacao)}
          vazio={carregando ? 'Carregando operações…' : 'Nenhuma operação encontrada.'}
          invalido={campoInvalido('operacao')}
          onLayoutCampo={registrarCampo('operacao')}
        />

        <View style={styles.campo}>
          <Text style={styles.label}>Tipo de operação</Text>
          <View style={styles.tipoLinha}>
            {tiposOperacao.map((tipo) => (
              <Pressable
                key={tipo.tipoOperacao}
                onPress={() => setTipoOperacao(tipo.tipoOperacao)}
                style={[styles.tipoBotao, tipoOperacao === tipo.tipoOperacao && styles.tipoBotaoAtivo]}
              >
                <Text style={[styles.tipoTexto, tipoOperacao === tipo.tipoOperacao && styles.tipoTextoAtivo]}>
                  {tipo.descricao}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Seletor
          titulo="Funcionário"
          valor={buscaFuncionario}
          onChangeText={setBuscaFuncionario}
          opcoes={cadastros?.funcionarios ?? []}
          selecionado={funcionario}
          exigirBusca
          onSelecionar={(item) => {
            setFuncionario(item);
            setBuscaFuncionario(`${item.nome} — ${item.codFuncionario}`);
          }}
          rotulo={(f) => `${f.nome} — ${f.codFuncionario}`}
          chave={(f) => String(f.codFuncionario)}
          vazio={carregando ? 'Carregando funcionários…' : 'Nenhum funcionário ativo encontrado.'}
          invalido={campoInvalido('funcionario')}
          onLayoutCampo={registrarCampo('funcionario')}
        />

        <Seletor
          titulo="Meio de aplicação"
          valor={buscaMeio}
          onChangeText={setBuscaMeio}
          opcoes={cadastros?.meiosAplicacao ?? []}
          selecionado={meioAplicacao}
          exigirBusca
          onSelecionar={(item) => {
            setMeioAplicacao(item);
            setBuscaMeio(`${item.codMeioaplicacao} — ${item.descricao}`);
          }}
          rotulo={(m) => `${m.codMeioaplicacao} — ${m.descricao}`}
          chave={(m) => String(m.codMeioaplicacao)}
          vazio={carregando ? 'Carregando meios de aplicação…' : 'Nenhum meio de aplicação encontrado.'}
          invalido={campoInvalido('meio')}
          onLayoutCampo={registrarCampo('meio')}
        />

        <Seletor
          titulo="Material"
          valor={buscaMaterial}
          onChangeText={setBuscaMaterial}
          opcoes={cadastros?.materiais ?? []}
          selecionado={material}
          exigirBusca
          onSelecionar={(item) => {
            setMaterial(item);
            setBuscaMaterial(item.descricao);
          }}
          rotulo={(m) => `${m.codMaterial} — ${m.descricao} (${m.codUnidade})`}
          chave={(m) => String(m.codMaterial)}
          vazio={carregando ? 'Carregando materiais…' : 'Nenhum material encontrado.'}
          invalido={campoInvalido('material')}
          onLayoutCampo={registrarCampo('material')}
        />

        <View
          style={[styles.campo, campoInvalido('quantidade') && styles.campoErro]}
          onLayout={registrarCampo('quantidade')}
        >
          <Text style={[styles.label, campoInvalido('quantidade') && styles.labelErro]}>
            Quantidade{material?.codUnidade ? ` (${material.codUnidade})` : ''}
          </Text>
          <TextInput
            value={quantidade}
            onChangeText={setQuantidade}
            keyboardType="decimal-pad"
            placeholder="Informe a quantidade deste material"
            placeholderTextColor={colors.muted}
            style={[styles.input, campoInvalido('quantidade') && styles.inputErro]}
          />
          {campoInvalido('quantidade') ? <Text style={styles.avisoCampo}>Informe a quantidade.</Text> : null}
        </View>

        <View style={styles.acoesMaterial}>
          <ActionButton label="Adicionar material à operação" variant="secondary" onPress={adicionarMaterial} />
        </View>

        {linhasMateriais.length > 0 ? (
          <View style={styles.listaMateriais}>
            <Text style={styles.label}>Materiais desta operação ({linhasMateriais.length})</Text>
            {linhasMateriais.map((linha) => (
              <View key={linha.id} style={styles.linhaMaterial}>
                <Text style={styles.linhaMaterialTexto}>
                  {linha.material.codMaterial} — {linha.material.descricao} · {linha.quantidade}{' '}
                  {linha.material.codUnidade}
                </Text>
                <Pressable onPress={() => removerMaterial(linha.id)}>
                  <Text style={styles.removerMaterial}>Remover</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.vazio}>
            Escolha o material, informe a quantidade e toque em “Adicionar material à operação”. Você pode incluir
            vários. Ao salvar, o material ainda preenchido também entra na lista.
          </Text>
        )}

        <View
          style={[styles.campo, campoInvalido('area') && styles.campoErro]}
          onLayout={registrarCampo('area')}
        >
          <Text style={[styles.label, campoInvalido('area') && styles.labelErro]}>Área aplicada (ha)</Text>
          <TextInput
            value={areaAplicada}
            onChangeText={setAreaAplicada}
            keyboardType="decimal-pad"
            placeholder="Informe a área aplicada"
            placeholderTextColor={colors.muted}
            style={[styles.input, campoInvalido('area') && styles.inputErro]}
          />
          {campoInvalido('area') ? <Text style={styles.avisoCampo}>Informe a área aplicada.</Text> : null}
        </View>

            <View style={styles.acoes}>
              <ActionButton label="Salvar no celular" onPress={() => void salvarLocal()} disabled={carregando} />
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
  back: { marginBottom: 8 },
  backText: { color: colors.leaf, fontWeight: '700' },
  link: { marginBottom: 12 },
  linkText: { color: colors.muted, fontWeight: '600', fontSize: 12 },
  carregandoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  carregandoTexto: { color: colors.muted, fontWeight: '700' },
  erro: { color: colors.danger, fontWeight: '700', marginBottom: 12 },
  retry: { marginBottom: 14 },
  indicador: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: 12,
    marginBottom: 16,
  },
  indicadorErro: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  indicadorTitulo: { color: colors.forest, fontWeight: '800', marginBottom: 8 },
  indicadorTituloErro: { color: colors.danger },
  indicadorItem: { paddingVertical: 3 },
  indicadorTexto: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  indicadorTextoErro: { color: colors.danger },
  indicadorDica: { color: colors.muted, fontWeight: '600', fontSize: 11, marginTop: 8 },
  indicadorOk: {
    backgroundColor: colors.successSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  indicadorOkTexto: { color: colors.success, fontWeight: '800' },
  campo: { marginBottom: 14 },
  campoErro: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  label: { color: colors.forest, fontWeight: '800', marginBottom: 6 },
  labelErro: { color: colors.danger },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.creamDark,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontWeight: '600',
  },
  inputErro: { borderColor: colors.danger, backgroundColor: '#fff' },
  avisoCampo: { color: colors.danger, fontWeight: '700', fontSize: 12, marginTop: 8 },
  selecionado: { color: colors.leaf, fontWeight: '700', fontSize: 12, marginTop: 6, marginBottom: 4 },
  vazio: { color: colors.muted, fontWeight: '600', fontSize: 12, marginTop: 8 },
  listaOpcoes: { marginTop: 4 },
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
    flexBasis: 120,
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
  acoes: { gap: 10 },
  acoesMaterial: { marginBottom: 14 },
  listaMateriais: { marginBottom: 16, gap: 8 },
  linhaMaterial: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.creamDark,
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  linhaMaterialTexto: { color: colors.ink, fontWeight: '600', fontSize: 13, flex: 1 },
  removerMaterial: { color: colors.danger, fontWeight: '800', fontSize: 12 },
});
