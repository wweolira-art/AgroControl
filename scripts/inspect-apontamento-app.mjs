import oracledb from 'oracledb';
import fs from 'node:fs';

// Somente metadados: não consulta lançamentos nem grava no banco.
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
  const result = await connection.execute(
    `SELECT column_name, data_type, data_length, data_precision, data_scale, nullable, data_default, identity_column
       FROM all_tab_columns WHERE owner = :owner AND table_name = :tableName ORDER BY column_id`,
    { owner: 'CSINTEGRACAO', tableName: 'APONTAMENTO_APP' }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const metadata = {};
  for (const [name, sql, binds] of [
    ['sequences', `SELECT sequence_owner, sequence_name FROM all_sequences WHERE sequence_owner = 'CSCLIENTE' AND sequence_name = 'SEQ_APONTAMENTO_APP'`, {}],
    ['permissoes', `SELECT grantee, privilege FROM all_tab_privs WHERE table_schema = :owner AND table_name = :tableName AND grantee IN (USER, 'PUBLIC')`, { owner: 'CSINTEGRACAO', tableName: 'APONTAMENTO_APP' }],
    ['restricoes', `SELECT constraint_name, constraint_type, status FROM all_constraints WHERE owner = :owner AND table_name = :tableName`, { owner: 'CSINTEGRACAO', tableName: 'APONTAMENTO_APP' }],
    ['triggers', `SELECT trigger_name, status, triggering_event, trigger_body FROM all_triggers WHERE table_owner = :owner AND table_name = :tableName`, { owner: 'CSINTEGRACAO', tableName: 'APONTAMENTO_APP' }],
  ]) {
    metadata[name] = (await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;
  }
  console.log(JSON.stringify({ usuarioConsulta: 'CSCLIENTE', colunas: result.rows, ...metadata }, null, 2));
} catch (error) {
  console.error(error.code ?? 'ORACLE_ERROR', String(error.message).split('\n')[0]);
  process.exitCode = 1;
} finally {
  await connection?.close();
}
