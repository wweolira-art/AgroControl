import oracledb from 'oracledb';
import fs from 'node:fs';

// INSERT de zero linhas com rollback e consultas de diagnóstico; não cria lançamentos.
const envPath = process.argv[2] ?? new URL('../server/.env', import.meta.url);
const config = { ...process.env };
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)=(.*)$/);
    if (match && !config[match[1]]) config[match[1]] = match[2].trim();
  }
}
const connectString = config.ORACLE_GRAVACAO_CONNECT_STRING || config.ORACLE_CONNECT_STRING;
if (String(config.ORACLE_GRAVACAO_USER).toUpperCase() !== 'CSCLIENTE' || !config.ORACLE_GRAVACAO_PASSWORD || !connectString) {
  throw new Error('Configure ORACLE_GRAVACAO_USER=CSCLIENTE, ORACLE_GRAVACAO_PASSWORD e ORACLE_CONNECT_STRING no .env indicado.');
}
let connection;
try {
  if (config.ORACLE_USE_THICK === 'true') {
    if (!config.ORACLE_INSTANT_CLIENT) throw new Error('Configure ORACLE_INSTANT_CLIENT para o modo Thick.');
    oracledb.initOracleClient({ libDir: config.ORACLE_INSTANT_CLIENT });
  }
  connection = await oracledb.getConnection({
    user: config.ORACLE_GRAVACAO_USER, password: config.ORACLE_GRAVACAO_PASSWORD,
    connectString: connectString + (connectString.includes('?') ? '&' : '?') + 'connect_timeout=10&transport_connect_timeout=5',
  });
  connection.callTimeout = 15000;
  const probe = await connection.execute(
    `INSERT INTO csintegracao.APONTAMENTO_APP (id_apont, data_apontamento, cod_agenciador,
       cod_fazenda, zona, cod_talhao, cod_atividade, cod_funcionario, quantidade,
       cod_grupoempresa, cod_empresa, cod_filial, cod_grupoempresa_tabpreco,
       cod_empresa_tabpreco, cod_tabelapreco, valor_unitario, importado,
       origem_importacao, desconsiderar, observacao)
     SELECT id_apont, data_apontamento, cod_agenciador,
       cod_fazenda, zona, cod_talhao, cod_atividade, cod_funcionario, quantidade,
       cod_grupoempresa, cod_empresa, cod_filial, cod_grupoempresa_tabpreco,
       cod_empresa_tabpreco, cod_tabelapreco, valor_unitario, importado,
       origem_importacao, desconsiderar, observacao
       FROM csintegracao.APONTAMENTO_APP WHERE 1 = 0`, {}, { autoCommit: false });
  await connection.rollback();
  console.log(JSON.stringify({ teste: 'INSERT sem linhas', usuario: 'CSCLIENTE', linhas: probe.rowsAffected, rollback: true }));
  for (const [name, sql] of [
    ['errosIntegracao', `SELECT SUBSTR(log_erro, 1, 500) AS erro, COUNT(*) AS quantidade
       FROM csintegracao.APONTAMENTO_APP WHERE importado = 'E'
       GROUP BY SUBSTR(log_erro, 1, 500)`],
    ['rotinaIntegracao', `SELECT line, text FROM all_source WHERE owner = 'RH'
       AND name = 'PR_INTEGRA_APONTAMENTO_APP_CS' AND type = 'PROCEDURE'
       AND (UPPER(text) LIKE '%INSERT INTO%' OR UPPER(text) LIKE '%IMPORTADO%'
         OR UPPER(text) LIKE '%LOG_ERRO%' OR UPPER(text) LIKE '%COD_FISCAL%'
         OR UPPER(text) LIKE '%COD_RUAS%' OR UPPER(text) LIKE '%PRECO%')
       ORDER BY line`],
    ['situacaoIntegracao', `SELECT importado, desconsiderar, COUNT(*) AS quantidade,
       SUM(CASE WHEN log_erro IS NOT NULL THEN 1 ELSE 0 END) AS com_erro,
       SUM(CASE WHEN numero_integracao IS NOT NULL THEN 1 ELSE 0 END) AS com_numero_integracao
       FROM csintegracao.APONTAMENTO_APP GROUP BY importado, desconsiderar`],
    ['dependencias', `SELECT owner, name, type FROM all_dependencies
       WHERE referenced_owner = 'CSINTEGRACAO' AND referenced_name = 'APONTAMENTO_APP'`],
    ['contextoDisponivel', `SELECT owner, table_name, column_name FROM all_tab_columns
       WHERE (owner = 'RH' AND table_name IN ('TABELAPRECO', 'ITEMTABELAPRECO')
         AND column_name IN ('COD_GRUPOEMPRESA','COD_EMPRESA','COD_TABELAPRECO','COD_ITEMTABELAPRECO','VALOR','DATAINICIO','DATAFINAL'))
       ORDER BY owner, table_name, column_id`],
  ]) {
    const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    console.log(JSON.stringify({ [name]: result.rows }));
  }
} catch (error) {
  await connection?.rollback().catch(() => undefined);
  console.error(error.code ?? 'ORACLE_ERROR', String(error.message).split('\n')[0]);
  process.exitCode = 1;
} finally {
  await connection?.close();
}
