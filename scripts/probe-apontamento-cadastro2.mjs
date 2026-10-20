import { consultarSql, sincronizarConexaoBancoOrds } from '../server/oracle.ts';

await sincronizarConexaoBancoOrds();

const tables = await consultarSql(
  `SELECT table_name FROM all_tables
   WHERE owner IN ('RH','AGRICOLA') AND table_name LIKE '%OPERACAO%'
   ORDER BY owner, table_name`,
);
console.log(tables.map((t) => t.TABLE_NAME ?? t.table_name).join('\n'));

const op = await consultarSql(
  `SELECT o.cod_operacaoagricola, TRIM(oc.descricao) AS operacao, TRIM(oc.atividade) AS atividade
   FROM rh.operacaoobjetocusto o
   INNER JOIN custo.objetocusto oc ON oc.cod_objetocusto = o.cod_objetocusto
   WHERE o.data_termino IS NULL AND ROWNUM <= 5`,
);
console.log('operacoes join', JSON.stringify(op, null, 2));

const fazendas = await consultarSql(
  `SELECT f.cod_fazenda, TRIM(f.descricao) AS nome, f.cod_grupoempresa, f.cod_empresa, f.cod_filial
   FROM agricola.fazenda f
   WHERE f.cod_fazenda > 0 AND ROWNUM <= 5`,
);
console.log('fazendas', JSON.stringify(fazendas, null, 2));

const talhoes = await consultarSql(
  `SELECT t.cod_fazenda, t.cod_talhao, t.zona, NVL(t.areaplantada, t.areaproducao) AS area_ha,
          TRIM(t.descricao_talhao) AS descricao
   FROM agricola.talhao t
   WHERE t.cod_fazenda > 0 AND ROWNUM <= 5`,
);
console.log('talhoes', JSON.stringify(talhoes, null, 2));

// agricola materials only
const matAgr = await consultarSql(
  `SELECT m.cod_material, TRIM(m.descricao) AS descricao, m.cod_unidade
   FROM material.material m
   INNER JOIN material.grupomaterial gm ON gm.cod_familia = m.cod_familia AND gm.cod_grupomaterial = m.cod_grupomaterial
   WHERE m.cod_familia = 29 AND ROWNUM <= 5`,
);
console.log('materiais agr', JSON.stringify(matAgr, null, 2));
