import axios from 'axios';

import type {
  CadastrosAnaliseBiometrica,
  ItemAnaliseBiometrica,
  LancamentoAnaliseBiometrica,
  LancamentoAnaliseBiometricaEntrada,
  PontoAnaliseBiometrica,
  RegistroAnaliseBiometrica,
} from '../types/analise-biometrica';

const BASE_URL = 'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin';

const ENDPOINTS = {
  lancamentos: `${BASE_URL}/lancamento_analisebiometrica/`,
  itens: `${BASE_URL}/itens_analisebiometrica/`,
  pontos: `${BASE_URL}/pontos_analisebiometrica/`,
  motivosTch: `${BASE_URL}/motivostch_analisebiometrica/`,
  motivosTalhao: `${BASE_URL}/analisebiometrica_motivos/`,
} as const;

function extrairItems(data: unknown): RegistroAnaliseBiometrica[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is RegistroAnaliseBiometrica => Boolean(item && typeof item === 'object'));
  }
  if (data && typeof data === 'object') {
    const talvezItems = (data as { items?: unknown }).items;
    if (Array.isArray(talvezItems)) {
      return talvezItems.filter((item): item is RegistroAnaliseBiometrica => Boolean(item && typeof item === 'object'));
    }
    return [data as RegistroAnaliseBiometrica];
  }
  return [];
}

function mensagemErro(erro: unknown): Error {
  if (axios.isAxiosError(erro)) {
    const status = erro.response?.status;
    const data = erro.response?.data as { message?: string; mensagem?: string; error?: string } | undefined;
    const detalhe = data?.message ?? data?.mensagem ?? data?.error ?? erro.message;
    if (status === 401 || status === 403) {
      return new Error('Token da análise biométrica inválido ou sem permissão.');
    }
    return new Error(status ? `Falha ORDS ${status}: ${detalhe}` : detalhe);
  }
  return erro instanceof Error ? erro : new Error('Falha ao consultar análise biométrica.');
}

function proximaPagina(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return '';
  }
  const links = (data as { links?: unknown }).links;
  if (!Array.isArray(links)) {
    return '';
  }
  const next = links.find((link) => {
    if (!link || typeof link !== 'object') {
      return false;
    }
    const rel = (link as { rel?: unknown }).rel;
    return typeof rel === 'string' && rel.toLowerCase() === 'next';
  });
  const href = next && typeof next === 'object' ? (next as { href?: unknown }).href : '';
  return typeof href === 'string' ? href : '';
}

async function consultarLista(url: string): Promise<RegistroAnaliseBiometrica[]> {
  const registros: RegistroAnaliseBiometrica[] = [];
  let atual = url.includes('?') ? `${url}&limit=500` : `${url}?limit=500`;
  const visitadas = new Set<string>();
  while (atual && !visitadas.has(atual)) {
    visitadas.add(atual);
    const { data } = await axios.get(atual, {
      timeout: 120_000,
    });
    registros.push(...extrairItems(data));
    atual = proximaPagina(data);
  }
  return registros;
}

function numeroCampo(row: RegistroAnaliseBiometrica, ...campos: string[]): number {
  for (const campo of campos) {
    const valor = row[campo] ?? row[campo.toUpperCase()];
    const numero = Number(valor);
    if (Number.isFinite(numero)) {
      return numero;
    }
  }
  return 0;
}

function textoCampo(row: RegistroAnaliseBiometrica, ...campos: string[]): string {
  for (const campo of campos) {
    const valor = row[campo] ?? row[campo.toUpperCase()];
    if (valor !== undefined && valor !== null) {
      return String(valor).trim();
    }
  }
  return '';
}

function linkSelf(row: RegistroAnaliseBiometrica): string {
  const links = row.links ?? row.LINKS;
  if (!Array.isArray(links)) {
    return '';
  }
  const self = links.find((link) => {
    if (!link || typeof link !== 'object') {
      return false;
    }
    const rel = (link as { rel?: unknown }).rel;
    return typeof rel === 'string' && rel.toLowerCase() === 'self';
  });
  const href = self && typeof self === 'object' ? (self as { href?: unknown }).href : '';
  return typeof href === 'string' ? href : '';
}

export async function consultarCadastrosAnaliseBiometrica(): Promise<CadastrosAnaliseBiometrica> {
  try {
    const [itensRows, pontosRows, motivosRows] = await Promise.all([
      consultarLista(ENDPOINTS.itens),
      consultarLista(ENDPOINTS.pontos),
      consultarLista(ENDPOINTS.motivosTch),
    ]);
    const itens: ItemAnaliseBiometrica[] = itensRows
      .map((row) => ({
        codItem: numeroCampo(row, 'cod_item', 'codItem'),
        descricao: textoCampo(row, 'descricao') || String(numeroCampo(row, 'cod_item', 'codItem')),
      }))
      .filter((item) => item.codItem > 0);
    const pontos: PontoAnaliseBiometrica[] = pontosRows
      .map((row) => ({
        codPonto: numeroCampo(row, 'cod_ponto', 'codPonto'),
        descricao: textoCampo(row, 'descricao') || String(numeroCampo(row, 'cod_ponto', 'codPonto')),
      }))
      .filter((ponto) => ponto.codPonto > 0);

    return {
      itens,
      pontos,
      motivosTch: motivosRows.map(row => ({
        codMotivo: numeroCampo(row, 'cod_motivo'),
        descricao: textoCampo(row, 'descricao'),
      })).filter(row => Number.isSafeInteger(row.codMotivo) && row.codMotivo > 0 && row.descricao),
      importadoEm: new Date().toISOString(),
    };
  } catch (erro) {
    throw mensagemErro(erro);
  }
}

export async function consultarLancamentosAnaliseBiometrica(): Promise<LancamentoAnaliseBiometrica[]> {
  try {
    const rows = await consultarLista(ENDPOINTS.lancamentos);
    const motivos = await consultarMotivosTalhao();
    return rows.map((row) => ({
      codigosMotivoTch: codigosMotivoTchTalhao(motivos, { data: textoCampo(row, 'data'), codFazenda: numeroCampo(row, 'cod_fazenda'), codTalhao: numeroCampo(row, 'cod_talhao') }),
      selfUrl: linkSelf(row),
      data: textoCampo(row, 'data'),
      codPonto: numeroCampo(row, 'cod_ponto', 'codPonto'),
      codItem: numeroCampo(row, 'cod_item', 'codItem'),
      codFazenda: numeroCampo(row, 'cod_fazenda', 'codFazenda'),
      codTalhao: numeroCampo(row, 'cod_talhao', 'codTalhao'),
      variedade: textoCampo(row, 'variedade'),
      valor: numeroCampo(row, 'valor'),
      usuario: textoCampo(row, 'usuario'),

    }));
  } catch (erro) {
    throw mensagemErro(erro);
  }
}

async function enviarLancamentoAnaliseBiometrica(
  entrada: LancamentoAnaliseBiometricaEntrada,
): Promise<RegistroAnaliseBiometrica> {
  try {
    const { data } = await axios.post<RegistroAnaliseBiometrica>(
      ENDPOINTS.lancamentos,
      {
        data: entrada.data,
        cod_ponto: entrada.codPonto,
        cod_item: entrada.codItem,
        cod_fazenda: entrada.codFazenda,
        cod_talhao: entrada.codTalhao,
        variedade: entrada.variedade,
        valor: entrada.valor,
        usuario: entrada.usuario ?? null,
      },
      { timeout: 60_000 },
    );
    return data;
  } catch (erro) {
    throw mensagemErro(erro);
  }
}

export async function enviarLancamentosAnaliseBiometrica(
  entradas: LancamentoAnaliseBiometricaEntrada[],
): Promise<RegistroAnaliseBiometrica[]> {
  const grupos = new Map<string, LancamentoAnaliseBiometricaEntrada[]>();
  for (const entrada of entradas) {
    const key = chaveMotivoTch(entrada);
    grupos.set(key, [...(grupos.get(key) ?? []), entrada]);
  }
  const pendentes: { contexto: LancamentoAnaliseBiometricaEntrada; codigos: number[] }[] = [];
  for (const grupo of grupos.values()) {
    const contexto = grupo[0];
    const codigos = [...new Set(grupo.flatMap(row => row.codigosMotivoTch ?? []))];
    if (codigos.some(codigo => !Number.isSafeInteger(codigo) || codigo <= 0)) throw new Error('Selecione um código válido de motivo TCH.');
    if (!codigos.length) continue;
    // Confere disponibilidade e todos os códigos antes de gravar medições.
    const existentes = await consultarMotivosTalhao(contexto, true);
    const anteriores = codigosMotivoTchTalhao(existentes, contexto);
    const novos = codigos.filter(codigo => !anteriores.includes(codigo));
    for (const codigo of novos) {
      const motivos = await consultarLista(`${ENDPOINTS.motivosTch}?q=${encodeURIComponent(JSON.stringify({ cod_motivo: codigo }))}`);
      if (!motivos.some(row => numeroCampo(row, 'cod_motivo') === codigo)) throw new Error('O motivo TCH selecionado não existe mais no cadastro. Recarregue os cadastros.');
    }
    pendentes.push({ contexto, codigos: novos });
  }
  for (const { contexto, codigos } of pendentes) {
    for (const codigo of codigos) {
      try {
        await axios.post(ENDPOINTS.motivosTalhao, {
          data: contexto.data.trim(), cod_fazenda: contexto.codFazenda,
          cod_talhao: contexto.codTalhao, cod_motivo: codigo,
        }, { timeout: 60_000 });
      } catch (erro) {
        // Outro dispositivo pode ter incluído o mesmo código entre o GET e POST.
        const atuais = await consultarMotivosTalhao(contexto, true);
        if (!codigosMotivoTchTalhao(atuais, contexto).includes(codigo)) throw mensagemErro(erro);
      }
    }
  }
  const enviados: RegistroAnaliseBiometrica[] = [];
  for (const entrada of entradas) {
    // Os motivos pertencem ao talhão/data, sem duplicar valores ou códigos nos itens.
    enviados.push(await enviarLancamentoAnaliseBiometrica(entrada));
  }
  return enviados;
}

export async function consultarMotivosTalhao(contexto?: ContextoMotivoTch, obrigatorio = false) {
  const filtro = contexto ? `?q=${encodeURIComponent(JSON.stringify({ data: contexto.data.trim(), cod_fazenda: contexto.codFazenda, cod_talhao: contexto.codTalhao }))}` : '';
  try {
    const rows = await consultarLista(`${ENDPOINTS.motivosTalhao}${filtro}`);
    return rows.map(row => ({ data: textoCampo(row, 'data'), codFazenda: numeroCampo(row, 'cod_fazenda'), codTalhao: numeroCampo(row, 'cod_talhao'), codigosMotivoTch: [numeroCampo(row, 'cod_motivo')] }));
  } catch (erro) {
    if (axios.isAxiosError(erro) && erro.response?.status === 404) {
      if (!obrigatorio) return [];
      throw new Error('Ative a tabela de múltiplos motivos no banco: execute scripts/habilitar-biometria-multiplos-motivos.sql no schema ADMIN. Nenhuma medição foi enviada.');
    }
    throw mensagemErro(erro);
  }
}

type ContextoMotivoTch = { data: string; codFazenda: number; codTalhao: number };
export function chaveMotivoTch(contexto: ContextoMotivoTch): string {
  return JSON.stringify([contexto.data.trim(), contexto.codFazenda, contexto.codTalhao]);
}
export function codigosMotivoTchTalhao(
  lancamentos: (ContextoMotivoTch & { codigosMotivoTch?: number[] })[], contexto: ContextoMotivoTch,
): number[] {
  const key = chaveMotivoTch(contexto);
  return [...new Set(lancamentos.filter(row => chaveMotivoTch(row) === key).flatMap(row => row.codigosMotivoTch ?? [])
    .filter((code): code is number => code != null && Number.isSafeInteger(code) && code > 0))];
}

export async function excluirLancamentoAnaliseBiometrica(selfUrl: string): Promise<void> {
  if (!selfUrl) {
    throw new Error('Este lançamento não tem link de exclusão na ORDS.');
  }
  try {
    await axios.delete(selfUrl, { timeout: 60_000 });
  } catch (erro) {
    throw mensagemErro(erro);
  }
}

export async function excluirLancamentosAnaliseBiometrica(lancamentos: LancamentoAnaliseBiometrica[]): Promise<void> {
  for (const lancamento of lancamentos) {
    await excluirLancamentoAnaliseBiometrica(lancamento.selfUrl);
  }
}
