import { consultarSql, sincronizarConexaoBancoOrds } from '../server/oracle.ts';

await sincronizarConexaoBancoOrds();

const queries = {
  fazendas: `SELECT codigo AS cod_fazenda, nome AS nome_fazenda FROM agricola.fazenda WHERE ROWNUM <= 5`,
  talhoes: `SELECT cod_fazenda, codigo AS cod_talhao, areaplantada FROM agricola.talhao WHERE ROWNUM <= 5`,
  materiais: `SELECT m.cod_material, TRIM(m.descricao) AS descricao, m.cod_unidade
              FROM material.material m WHERE ROWNUM <= 5`,
  operacoes: `SELECT DISTINCT o.cod_operacaoagricola AS cod_operacao, TRIM(o.descricao) AS descricao
              FROM rh.operacaoobjetocusto o
              WHERE o.data_termino IS NULL AND ROWNUM <= 5`,
};

for (const [nome, sql] of Object.entries(queries)) {
  try {
    const rows = await consultarSql(sql);
    console.log('===', nome, 'count sample', rows.length);
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.log('ERR', nome, e instanceof Error ? e.message : e);
  }
}

// max nr_apontamento
try {
  const max = await consultarSql(
    `SELECT MAX(nr_apontamento) AS max_nr, MAX(ano_apontamento) AS max_ano FROM agricola.tmp_osapontamento`,
  );
  console.log('max apontamento', max);
} catch (e) {
  console.log('max err', e.message);
}
