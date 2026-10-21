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
  for (const [name, sql] of [
    ['cadastrosTurma', `SELECT owner, table_name, column_name, data_type FROM all_tab_columns WHERE owner IN ('RH','AGRICOLA') AND (table_name LIKE '%TURMA%' OR table_name LIKE '%AGENCIADOR%') ORDER BY owner,table_name,column_id`],
    ['mapeamentoTurma', `SELECT line,text FROM all_source WHERE owner='RH' AND name='PR_INTEGRA_APONTAMENTO_APP_CS' AND type='PROCEDURE' AND (UPPER(text) LIKE '%TURMA%' OR UPPER(text) LIKE '%AGENCIADOR%') ORDER BY line`],
  ]) {
    console.log(JSON.stringify({[name]:(await connection.execute(sql,{}, {outFormat:oracledb.OUT_FORMAT_OBJECT})).rows}));
  }
} finally { await connection?.close(); }