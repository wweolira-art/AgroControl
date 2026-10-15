/**
 * Apontamento operacional — leitura de cadastros e gravação nas tabelas tmp do ERP.
 */

import { consultarSql, consultarSqlGravacao, withOracleConnection, withOracleGravacao } from './oracle.ts';

function rowVal(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
    const upper = key.toUpperCase();
    if (row[upper] !== undefined && row[upper] !== null) {
      return row[upper];
    }
    const lower = key.toLowerCase();
    if (row[lower] !== undefined && row[lower] !== null) {
      return row[lower];
    }
  }
  return null;
}

function toNumber(val: unknown): number | null {
  if (val == null || val === '') {
    return null;
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function toStr(val: unknown): string {
  return val == null ? '' : String(val).trim();
}

function uniqTalhoes(talhoes: TalhaoCadastro[]): TalhaoCadastro[] {
  const porChave = new Map<string, TalhaoCadastro>();
  for (const talhao of talhoes) {
    const chave = `${talhao.codFazenda}-${talhao.codTalhao}`;
    const atual = porChave.get(chave);
    if (!atual || (talhao.codSafra ?? 0) > (atual.codSafra ?? 0)) {
      porChave.set(chave, talhao);
    }
  }
  return [...porChave.values()].sort(
    (a, b) => a.codFazenda - b.codFazenda || a.codTalhao - b.codTalhao,
  );
}

export interface FazendaCadastro {
  codFazenda: number;
  nome: string;
}

export interface TalhaoCadastro {
  codFazenda: number;
  codTalhao: number;
  zona: number;
  areaHa: number | null;
  descricao: string;
  codSafra: number | null;
}

export interface MaterialCadastro {
  codMaterial: number;
  descricao: string;
  codUnidade: string;
}

export interface OperacaoCadastro {
  codOperacao: number;
  descricao: string;
  codObjetocusto: number;
  codTipofazenda: number;
  codGrupoempresa: number;
  codEmpresa: number;
  codFilial: number;
}

export interface FuncionarioCadastro {
  codFuncionario: number;
  nome: string;
}

export interface MeioAplicacaoCadastro {
  codMeioaplicacao: number;
  descricao: string;
}

export interface TipoOperacaoCadastro {
  tipoOperacao: string;
  descricao: string;
}

export interface CadastrosApontamento {
  fazendas: FazendaCadastro[];
  talhoes: TalhaoCadastro[];
  materiais: MaterialCadastro[];
  operacoes: OperacaoCadastro[];
  funcionarios: FuncionarioCadastro[];
  meiosAplicacao: MeioAplicacaoCadastro[];
  tiposOperacao: TipoOperacaoCadastro[];
  importadoEm: string;
}

export interface ItemMaterialEntrada {
  codMaterial: number;
  quantidade: number;
  dose?: number;
}

export interface ApontamentoEntrada {
  codFazenda: number;
  codTalhao: number;
  zona?: number;
  codSafra?: number | null;
  codOperacao: number;
  tipoOperacao?: string;
  codFuncionario: number;
  codObjetocusto?: number | null;
  codTipofazenda?: number | null;
  areaAplicada: number;
  codMaterial?: number;
  dose?: number;
  quantidade?: number;
  materiais?: ItemMaterialEntrada[];
  dataApontamento?: string;
  logon?: string;
  codMeioaplicacao: number;
  codGrupoempresaAgr?: number;
  codEmpresaAgr?: number;
  codFilialAgr?: number;
  codAlmoxarifado?: number;
}

export interface ApontamentoGravado {
  anoApontamento: number;
  nrApontamento: number;
  itemApontamento: number;
  nrApontamentoGerado: number;
  itemApontamentoGerado: number;
  quantidade: number;
}

const CADASTRO_FAZENDAS_SQL = `
SELECT f.cod_fazenda, TRIM(f.descricao) AS nome
  FROM agricola.fazenda f
 WHERE f.cod_fazenda > 0
 ORDER BY TRIM(f.descricao)
`;

const CADASTRO_TALHOES_SQL = `
SELECT cod_fazenda, cod_talhao, zona, area_ha, descricao, cod_safra
  FROM (
    SELECT t.cod_fazenda, t.cod_talhao, NVL(t.zona, 1) AS zona,
           NVL(t.areaplantada, t.areaproducao) AS area_ha,
           TRIM(NVL(t.descricao_talhao, TO_CHAR(t.cod_talhao))) AS descricao,
           t.cod_safra,
           ROW_NUMBER() OVER (
             PARTITION BY t.cod_fazenda, t.cod_talhao
             ORDER BY t.cod_safra DESC NULLS LAST,
                      NVL(t.areaplantada, t.areaproducao) DESC NULLS LAST
           ) AS rn
      FROM agricola.talhao t
     WHERE t.cod_fazenda > 0
       AND NVL(t.encerrado, 'N') <> 'S'
  )
 WHERE rn = 1
 ORDER BY cod_fazenda, cod_talhao
`;

const CADASTRO_MATERIAIS_SQL = `
SELECT m.cod_material, TRIM(m.descricao) AS descricao, NVL(TRIM(m.cod_unidade), 'UN') AS cod_unidade
  FROM material.material m
 WHERE m.cod_familia = 44
   AND m.cod_material IS NOT NULL
 ORDER BY TRIM(m.descricao)
`;

const CADASTRO_OPERACOES_SQL = `
SELECT o.cod_operacaoagricola AS cod_operacao,
       TRIM(o.descricao) AS descricao,
       NVL(oc.cod_objetocusto, 0) AS cod_objetocusto,
       NVL(oc.cod_tipofazenda, 1) AS cod_tipofazenda,
       NVL(oc.cod_grupoempresa, 1) AS cod_grupoempresa,
       NVL(oc.cod_empresa, 1) AS cod_empresa,
       NVL(oc.cod_filial, 1) AS cod_filial
  FROM rh.operacaoagricola o
  LEFT JOIN rh.operacaoobjetocusto oc
    ON oc.cod_operacaoagricola = o.cod_operacaoagricola
   AND oc.data_termino IS NULL
   AND oc.cod_objetocusto = (
         SELECT MIN(x.cod_objetocusto)
           FROM rh.operacaoobjetocusto x
          WHERE x.cod_operacaoagricola = o.cod_operacaoagricola
            AND x.data_termino IS NULL
       )
 WHERE NVL(o.ativo, 'S') = 'S'
 ORDER BY TRIM(o.descricao), o.cod_operacaoagricola
`;

const CADASTRO_TIPOS_OPERACAO_SQL = `
SELECT TRIM(t.tipo_operacao) AS tipo_operacao,
       TRIM(t.descricao) AS descricao
  FROM agricola.tipooperacao t
 WHERE t.tipo_operacao IS NOT NULL
 ORDER BY t.id_tipooperac
`;

const CADASTRO_FUNCIONARIOS_SQL = `
SELECT s.cdgfuncionario AS cod_funcionario,
       TRIM(s.cscfuncionario) AS nome
  FROM agricola.sga_funcionario s
 WHERE s.idnativo = 'S'
   AND TRIM(s.cscfuncionario) IS NOT NULL
 ORDER BY TRIM(s.cscfuncionario)
`;

/** Catálogo de meios da vw_ordemservico — a tabela de domínio não existe no ERP. */
const TIPOS_OPERACAO_ERP: TipoOperacaoCadastro[] = [
  { tipoOperacao: 'C', descricao: 'MANUAL' },
  { tipoOperacao: 'M', descricao: 'MECANIZADO' },
];

const MEIOS_APLICACAO: MeioAplicacaoCadastro[] = [
  { codMeioaplicacao: 1, descricao: 'MANUAL MARTINELI' },
  { codMeioaplicacao: 2, descricao: 'BARRA MANUAL' },
  { codMeioaplicacao: 3, descricao: 'AEREO' },
  { codMeioaplicacao: 4, descricao: 'IRRIGAÇÃO POR GRAVIDADE' },
  { codMeioaplicacao: 5, descricao: 'MAQUINARIO' },
  { codMeioaplicacao: 6, descricao: 'MANUAL TANQUE CATAÇÃO' },
  { codMeioaplicacao: 7, descricao: 'APLICAÇÃO DE H. TRAM. MECANIZA' },
  { codMeioaplicacao: 8, descricao: 'APLICAÇÃO PJ MECANIZADA' },
  { codMeioaplicacao: 10, descricao: 'PRÉ PLANTIO' },
  { codMeioaplicacao: 11, descricao: 'PRÉ SOCARIA' },
  { codMeioaplicacao: 14, descricao: 'BARRA PEC.' },
  { codMeioaplicacao: 15, descricao: 'ADUBAÇÃO MANUAL' },
  { codMeioaplicacao: 16, descricao: 'COBERTA DE CANA MECANIZADA' },
  { codMeioaplicacao: 17, descricao: 'ADUBAÇÃO MECANIZADA' },
  { codMeioaplicacao: 18, descricao: 'APLICAÇÃO DE CALCÁRIO MECANIZA' },
  { codMeioaplicacao: 19, descricao: 'APLICAÇÃO DE HERB. PASTO' },
  { codMeioaplicacao: 20, descricao: 'APLICAÇÃO MANUAL' },
  { codMeioaplicacao: 22, descricao: 'PENTA' },
  { codMeioaplicacao: 23, descricao: 'ATOMIZADOR' },
  { codMeioaplicacao: 24, descricao: 'TRÂMPULO 4018' },
  { codMeioaplicacao: 25, descricao: 'PATRIOTA' },
  { codMeioaplicacao: 26, descricao: 'LIBERAÇÃO DE COTÉSIA MANUAL' },
  { codMeioaplicacao: 27, descricao: 'APLICAÇÃO COM DRONNER' },
  { codMeioaplicacao: 28, descricao: 'REPLANTA MANUAL' },
  { codMeioaplicacao: 29, descricao: 'DRONE' },
  { codMeioaplicacao: 30, descricao: 'CANETINHA' },
  { codMeioaplicacao: 31, descricao: 'ARRANCA DE CAPIM MANUAL' },
  { codMeioaplicacao: 32, descricao: 'PATRIOT TERCEIRO' },
  { codMeioaplicacao: 33, descricao: 'CORTADOR DE SOQUEIRA' },
  { codMeioaplicacao: 34, descricao: 'HERCULES' },
  { codMeioaplicacao: 35, descricao: 'UNIPORT' },
  { codMeioaplicacao: 36, descricao: 'QUEBRA LOMBO' },
];

async function executarComCommit(
  sql: string,
  binds: Record<string, unknown> = {},
): Promise<void> {
  await withOracleGravacao(async (connection, driver) => {
    await connection.execute(sql, binds, {
      outFormat: driver.OUT_FORMAT_OBJECT,
      autoCommit: true,
    });
  });
}

export async function listarCadastrosApontamento(): Promise<CadastrosApontamento> {
  const [fazRows, talRows, matRows, opRows, funcRows, tipoRows] = await Promise.all([
    consultarSql(CADASTRO_FAZENDAS_SQL),
    consultarSql(CADASTRO_TALHOES_SQL),
    consultarSql(CADASTRO_MATERIAIS_SQL),
    consultarSql(CADASTRO_OPERACOES_SQL),
    consultarSql(CADASTRO_FUNCIONARIOS_SQL),
    consultarSql(CADASTRO_TIPOS_OPERACAO_SQL).catch(() => []),
  ]);

  return {
    fazendas: fazRows
      .map((row) => ({
        codFazenda: toNumber(rowVal(row, 'COD_FAZENDA', 'cod_fazenda')) ?? 0,
        nome: toStr(rowVal(row, 'NOME', 'nome')),
      }))
      .filter((f) => f.codFazenda > 0),
    talhoes: uniqTalhoes(
      talRows
        .map((row) => ({
          codFazenda: toNumber(rowVal(row, 'COD_FAZENDA', 'cod_fazenda')) ?? 0,
          codTalhao: toNumber(rowVal(row, 'COD_TALHAO', 'cod_talhao')) ?? 0,
          zona: toNumber(rowVal(row, 'ZONA', 'zona')) ?? 1,
          areaHa: toNumber(rowVal(row, 'AREA_HA', 'area_ha')),
          descricao: toStr(rowVal(row, 'DESCRICAO', 'descricao')),
          codSafra: toNumber(rowVal(row, 'COD_SAFRA', 'cod_safra')),
        }))
        .filter((t) => t.codFazenda > 0 && t.codTalhao > 0),
    ),
    materiais: matRows
      .map((row) => ({
        codMaterial: toNumber(rowVal(row, 'COD_MATERIAL', 'cod_material')) ?? 0,
        descricao: toStr(rowVal(row, 'DESCRICAO', 'descricao')),
        codUnidade: toStr(rowVal(row, 'COD_UNIDADE', 'cod_unidade')) || 'UN',
      }))
      .filter((m) => m.codMaterial > 0),
    operacoes: opRows
      .map((row) => ({
        codOperacao: toNumber(rowVal(row, 'COD_OPERACAO', 'cod_operacao')) ?? 0,
        descricao: toStr(rowVal(row, 'DESCRICAO', 'descricao')),
        codObjetocusto: toNumber(rowVal(row, 'COD_OBJETOCUSTO', 'cod_objetocusto')) ?? 0,
        codTipofazenda: toNumber(rowVal(row, 'COD_TIPOFAZENDA', 'cod_tipofazenda')) ?? 1,
        codGrupoempresa: toNumber(rowVal(row, 'COD_GRUPOEMPRESA', 'cod_grupoempresa')) ?? 1,
        codEmpresa: toNumber(rowVal(row, 'COD_EMPRESA', 'cod_empresa')) ?? 1,
        codFilial: toNumber(rowVal(row, 'COD_FILIAL', 'cod_filial')) ?? 1,
      }))
      .filter((o) => o.codOperacao > 0),
    funcionarios: funcRows
      .map((row) => ({
        codFuncionario: toNumber(rowVal(row, 'COD_FUNCIONARIO', 'cod_funcionario')) ?? 0,
        nome: toStr(rowVal(row, 'NOME', 'nome')),
      }))
      .filter((f) => f.codFuncionario > 0 && f.nome),
    meiosAplicacao: MEIOS_APLICACAO,
    tiposOperacao: (() => {
      const tipos = tipoRows
        .map((row) => ({
          tipoOperacao: toStr(rowVal(row, 'TIPO_OPERACAO', 'tipo_operacao')).toUpperCase().slice(0, 1),
          descricao: toStr(rowVal(row, 'DESCRICAO', 'descricao')),
        }))
        .filter((t) => t.tipoOperacao && t.descricao);
      return tipos.length > 0 ? tipos : TIPOS_OPERACAO_ERP;
    })(),
    importadoEm: new Date().toISOString(),
  };
}

async function proximoNrApontamento(ano: number): Promise<number> {
  const rows = await consultarSqlGravacao(
    `SELECT NVL(MAX(nr_apontamento), 0) + 1 AS prox FROM agricola.tmp_osapontamento WHERE ano_apontamento = :ano`,
    { ano },
  );
  const prox = toNumber(rowVal(rows[0] ?? {}, 'PROX', 'prox'));
  return prox && prox > 0 ? prox : 1;
}

async function proximoNrApontamentoGerado(ano: number): Promise<number> {
  const rows = await consultarSqlGravacao(
    `SELECT GREATEST(
              NVL((SELECT MAX(nr_apontamento) FROM agricola.apontamento WHERE ano_apontamento = :ano), 0),
              NVL((SELECT MAX(nr_apontamento_gerado) FROM agricola.tmp_osapontamento WHERE ano_apontamento = :ano), 0)
            ) + 1 AS prox
       FROM dual`,
    { ano },
  );
  const prox = toNumber(rowVal(rows[0] ?? {}, 'PROX', 'prox'));
  return prox && prox > 0 ? prox : 1;
}

async function buscarTalhao(codFazenda: number, codTalhao: number): Promise<TalhaoCadastro | null> {
  const rows = await consultarSql(
    `SELECT t.cod_fazenda, t.cod_talhao, NVL(t.zona, 1) AS zona,
            NVL(t.areaplantada, t.areaproducao) AS area_ha,
            TRIM(NVL(t.descricao_talhao, TO_CHAR(t.cod_talhao))) AS descricao,
            t.cod_safra
       FROM agricola.talhao t
      WHERE t.cod_fazenda = :codFazenda AND t.cod_talhao = :codTalhao AND ROWNUM = 1`,
    { codFazenda, codTalhao },
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    codFazenda,
    codTalhao,
    zona: toNumber(rowVal(row, 'ZONA', 'zona')) ?? 1,
    areaHa: toNumber(rowVal(row, 'AREA_HA', 'area_ha')),
    descricao: toStr(rowVal(row, 'DESCRICAO', 'descricao')),
    codSafra: toNumber(rowVal(row, 'COD_SAFRA', 'cod_safra')),
  };
}

async function buscarUnidadeMaterial(codMaterial: number): Promise<string> {
  const rows = await consultarSql(
    `SELECT NVL(TRIM(m.cod_unidade), 'UN') AS cod_unidade
       FROM material.material m
      WHERE m.cod_material = :codMaterial AND ROWNUM = 1`,
    { codMaterial },
  );
  return toStr(rowVal(rows[0] ?? {}, 'COD_UNIDADE', 'cod_unidade')) || 'UN';
}

async function buscarAlmoxarifadoMaterial(
  codMaterial: number,
  codGrupoempresa: number,
  codEmpresa: number,
  codFilial: number,
): Promise<number | null> {
  try {
    const rows = await consultarSql(
      `SELECT e.cod_almoxarifado
         FROM material.estoque e
        WHERE e.cod_material = :codMaterial
          AND e.cod_grupoempresa = :codGrupoempresa
          AND e.cod_empresa = :codEmpresa
          AND e.cod_filial = :codFilial
          AND e.ano = TO_NUMBER(TO_CHAR(SYSDATE, 'YYYY'))
          AND e.mes = TO_NUMBER(TO_CHAR(SYSDATE, 'MM'))
        ORDER BY NVL(e.quantidade, 0) DESC
        FETCH FIRST 1 ROW ONLY`,
      { codMaterial, codGrupoempresa, codEmpresa, codFilial },
    );
    return toNumber(rowVal(rows[0] ?? {}, 'COD_ALMOXARIFADO', 'cod_almoxarifado'));
  } catch {
    return null;
  }
}

interface LoteMaterial {
  idLotee: number;
  quantidade: number;
}

type OracleModuleDriver = {
  BIND_OUT: number;
  CURSOR: unknown;
  NUMBER: unknown;
  STRING: unknown;
};

type OracleExec = {
  execute: (
    sql: string,
    binds?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Promise<{
    rows?: Record<string, unknown>[];
    outBinds?: Record<string, unknown>;
  }>;
};

function escolherLoteMaterial(
  rows: Record<string, unknown>[],
  codMaterial: number,
): LoteMaterial | null {
  const candidatos = rows
    .map((row) => ({
      idLotee: toNumber(rowVal(row, 'id_lote', 'ID_LOTE', 'id_lotee', 'ID_LOTEE')) ?? 0,
      codMaterial: toNumber(rowVal(row, 'cod_material', 'COD_MATERIAL')) ?? codMaterial,
      saldo: toNumber(rowVal(row, 'quantidade', 'QUANTIDADE', 'saldo', 'SALDO')) ?? 0,
      validade: rowVal(row, 'data_validade', 'DATA_VALIDADE'),
    }))
    .filter((item) => item.codMaterial === codMaterial && item.idLotee > 0)
    .sort((a, b) => {
      const da = a.validade instanceof Date ? a.validade.getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.validade instanceof Date ? b.validade.getTime() : Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  const escolhido = candidatos[0];
  if (!escolhido) {
    return null;
  }
  return { idLotee: escolhido.idLotee, quantidade: escolhido.saldo };
}

async function buscarLoteMaterial(codMaterial: number): Promise<LoteMaterial | null> {
  try {
    const lotes = await withOracleConnection(async (connection, driver) => {
      const d = driver as OracleModuleDriver;
      const result = (await (connection as OracleExec).execute(
        `BEGIN :ret := agricola.pkg_mobile.fn_lista_mat_lote; END;`,
        { ret: { dir: d.BIND_OUT, type: d.CURSOR } },
      )) as { outBinds?: { ret?: { getRows: (n: number) => Promise<Record<string, unknown>[]>; close: () => Promise<void> } } };
      const rs = result.outBinds?.ret;
      if (!rs) {
        return [];
      }
      const rows = await rs.getRows(3000);
      await rs.close();
      return rows;
    });
    const viaPkg = escolherLoteMaterial(lotes, codMaterial);
    if (viaPkg) {
      return viaPkg;
    }
  } catch {
    /* PKG_MOBILE inválido: tenta material.lote direto */
  }

  try {
    const rows = await consultarSql(
      `SELECT l.id_lotee,
              l.cod_material,
              l.numero_lote,
              l.data_validade,
              0 AS saldo
         FROM material.lote l
        WHERE l.cod_material = :codMaterial
          AND NVL(l.ativo, 'S') = 'S'`,
      { codMaterial },
    );
    return escolherLoteMaterial(rows, codMaterial);
  } catch {
    return null;
  }
}

async function buscarOperacao(codOperacao: number): Promise<OperacaoCadastro | null> {
  const rows = await consultarSql(
    `SELECT o.cod_operacaoagricola AS cod_operacao,
            TRIM(o.descricao) AS descricao,
            NVL(oc.cod_objetocusto, 0) AS cod_objetocusto,
            NVL(oc.cod_tipofazenda, 1) AS cod_tipofazenda,
            NVL(oc.cod_grupoempresa, 1) AS cod_grupoempresa,
            NVL(oc.cod_empresa, 1) AS cod_empresa,
            NVL(oc.cod_filial, 1) AS cod_filial
       FROM rh.operacaoagricola o
       LEFT JOIN rh.operacaoobjetocusto oc
         ON oc.cod_operacaoagricola = o.cod_operacaoagricola
        AND oc.data_termino IS NULL
        AND oc.cod_objetocusto = (
              SELECT MIN(x.cod_objetocusto)
                FROM rh.operacaoobjetocusto x
               WHERE x.cod_operacaoagricola = o.cod_operacaoagricola
                 AND x.data_termino IS NULL
            )
      WHERE o.cod_operacaoagricola = :codOperacao
        AND NVL(o.ativo, 'S') = 'S'
        AND ROWNUM = 1`,
    { codOperacao },
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    codOperacao,
    descricao: toStr(rowVal(row, 'DESCRICAO', 'descricao')),
    codObjetocusto: toNumber(rowVal(row, 'COD_OBJETOCUSTO', 'cod_objetocusto')) ?? 0,
    codTipofazenda: toNumber(rowVal(row, 'COD_TIPOFAZENDA', 'cod_tipofazenda')) ?? 1,
    codGrupoempresa: toNumber(rowVal(row, 'COD_GRUPOEMPRESA', 'cod_grupoempresa')) ?? 1,
    codEmpresa: toNumber(rowVal(row, 'COD_EMPRESA', 'cod_empresa')) ?? 1,
    codFilial: toNumber(rowVal(row, 'COD_FILIAL', 'cod_filial')) ?? 1,
  };
}

function resolverMateriais(entrada: ApontamentoEntrada): ItemMaterialEntrada[] {
  const lista: ItemMaterialEntrada[] = [];
  if (Array.isArray(entrada.materiais)) {
    for (const item of entrada.materiais) {
      const codMaterial = Number(item.codMaterial);
      const quantidade = Number(item.quantidade);
      if (Number.isFinite(codMaterial) && codMaterial > 0 && Number.isFinite(quantidade) && quantidade > 0) {
        lista.push({
          codMaterial,
          quantidade,
          dose: Number(item.dose) || 0,
        });
      }
    }
  }
  if (
    lista.length === 0 &&
    Number.isFinite(entrada.codMaterial) &&
    (entrada.codMaterial ?? 0) > 0 &&
    Number.isFinite(entrada.quantidade) &&
    (entrada.quantidade ?? 0) > 0
  ) {
    lista.push({
      codMaterial: entrada.codMaterial as number,
      quantidade: entrada.quantidade as number,
      dose: Number(entrada.dose) || 0,
    });
  }
  return lista;
}

export async function gravarApontamentoTmp(entrada: ApontamentoEntrada): Promise<ApontamentoGravado> {
  if (!Number.isFinite(entrada.codFazenda) || !Number.isFinite(entrada.codTalhao)) {
    throw new Error('Informe fazenda e talhão.');
  }
  if (!Number.isFinite(entrada.codOperacao)) {
    throw new Error('Informe a operação.');
  }
  if (!Number.isFinite(entrada.areaAplicada) || entrada.areaAplicada <= 0) {
    throw new Error('Informe a área aplicada (ha).');
  }
  if (!Number.isFinite(entrada.codFuncionario) || entrada.codFuncionario <= 0) {
    throw new Error('Informe o funcionário.');
  }
  if (!Number.isFinite(entrada.codMeioaplicacao) || entrada.codMeioaplicacao <= 0) {
    throw new Error('Informe o meio de aplicação.');
  }

  const materiais = resolverMateriais(entrada);
  if (materiais.length === 0) {
    throw new Error('Informe ao menos um material com quantidade.');
  }

  const quantidadeTotal = materiais.reduce((soma, item) => soma + item.quantidade, 0);

  const talhao = await buscarTalhao(entrada.codFazenda, entrada.codTalhao);
  const operacao = await buscarOperacao(entrada.codOperacao);
  if (!operacao) {
    throw new Error(`Operação ${entrada.codOperacao} não encontrada.`);
  }

  const dataRef = entrada.dataApontamento ? new Date(entrada.dataApontamento) : new Date();
  const ano = dataRef.getFullYear();
  const itemApontamento = 1;
  const itemApontamentoGerado = itemApontamento;
  const logon = entrada.logon ?? 'ELEJOTAGRO';

  const tipoOperacao = toStr(entrada.tipoOperacao).toUpperCase().slice(0, 1) || 'M';
  const zona = entrada.zona ?? talhao?.zona ?? 1;
  const codSafra = entrada.codSafra ?? talhao?.codSafra ?? 11;
  const codObjetocusto = entrada.codObjetocusto ?? operacao.codObjetocusto;
  const codTipofazenda = entrada.codTipofazenda ?? operacao.codTipofazenda;
  const codMeioaplicacao = entrada.codMeioaplicacao;
  const codFuncionario = entrada.codFuncionario;
  const codGrupoempresaAgr = entrada.codGrupoempresaAgr ?? operacao.codGrupoempresa;
  const codEmpresaAgr = entrada.codEmpresaAgr ?? operacao.codEmpresa;
  const codFilialAgr = entrada.codFilialAgr ?? operacao.codFilial;

  const nrApontamento = await proximoNrApontamento(ano);
  const nrApontamentoGerado = await proximoNrApontamentoGerado(ano);

  await executarComCommit(
    `INSERT INTO agricola.tmp_osapontamento (
       ano_apontamento, nr_apontamento, data_apontamento, nr_apontamento_gerado, importar, importado, logon
     ) VALUES (
       :ano, :nr, TRUNC(:dataApontamento), :nrGerado, 'S', 'N', :logon
     )`,
    {
      ano,
      nr: nrApontamento,
      dataApontamento: dataRef,
      nrGerado: nrApontamentoGerado,
      logon,
    },
  );

  await executarComCommit(
    `INSERT INTO agricola.tmp_ositemapont (
       ano_apontamento, nr_apontamento, item_apontamento, cod_fazenda, zona, cod_talhao,
       cod_safra, cod_tipofazenda, cod_objetocusto, cod_operacao, tipo_operacao, area,
       cod_meioaplicacao, cod_funcionario, nr_apontamento_gerado, item_apontamento_gerado,
       importar, volume_calda
     ) VALUES (
       :ano, :nr, :item, :codFazenda, :zona, :codTalhao,
       :codSafra, :codTipofazenda, :codObjetocusto, :codOperacao, :tipoOperacao, :area,
       :codMeioaplicacao, :codFuncionario, :nrGerado, :itemGerado,
       'S', 0
     )`,
    {
      ano,
      nr: nrApontamento,
      item: itemApontamento,
      codFazenda: entrada.codFazenda,
      zona,
      codTalhao: entrada.codTalhao,
      codSafra,
      codTipofazenda,
      codObjetocusto,
      codOperacao: entrada.codOperacao,
      tipoOperacao,
      area: entrada.areaAplicada,
      codMeioaplicacao,
      codFuncionario,
      nrGerado: nrApontamentoGerado,
      itemGerado: itemApontamentoGerado,
    },
  );

  for (let i = 0; i < materiais.length; i += 1) {
    const itemMaterial = materiais[i];
    const almoxVw = await buscarAlmoxarifadoMaterial(
      itemMaterial.codMaterial,
      codGrupoempresaAgr,
      codEmpresaAgr,
      codFilialAgr,
    );
    const codAlmoxarifado = entrada.codAlmoxarifado ?? almoxVw ?? 4;
    const codUnidade = await buscarUnidadeMaterial(itemMaterial.codMaterial);

    await executarComCommit(
      `INSERT INTO agricola.tmp_osmaterial (
         ano_apontamento, nr_apontamento, item_apontamento, seq_material, cod_material,
         quantidade, cod_unidade, cod_grupoempresa_agr, cod_empresa_agr, cod_filial_agr,
         cod_almoxarifado, nr_apontamento_gerado, item_apontamento_gerado, importar, excluido
       ) VALUES (
         :ano, :nr, :item, :seq, :codMaterial,
         :quantidade, :codUnidade, :codGrupoempresaAgr, :codEmpresaAgr, :codFilialAgr,
         :codAlmoxarifado, :nrGerado, :itemGerado, 'S', 'N'
       )`,
      {
        ano,
        nr: nrApontamento,
        item: itemApontamento,
        seq: i + 1,
        codMaterial: itemMaterial.codMaterial,
        quantidade: itemMaterial.quantidade,
        codUnidade,
        codGrupoempresaAgr,
        codEmpresaAgr,
        codFilialAgr,
        codAlmoxarifado,
        nrGerado: nrApontamentoGerado,
        itemGerado: itemApontamentoGerado,
      },
    );
  }

  return {
    anoApontamento: ano,
    nrApontamento,
    itemApontamento,
    nrApontamentoGerado,
    itemApontamentoGerado,
    quantidade: quantidadeTotal,
  };
}
