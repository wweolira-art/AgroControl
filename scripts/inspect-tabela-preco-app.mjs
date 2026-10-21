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
  const source=fs.readFileSync(new URL('../server/mao-de-obra.ts',import.meta.url),'utf8');
  const sql=source.match(/export const SQL_SERVICOS_MAO_DE_OBRA = `([\s\S]*?)`;/)?.[1];
  if (!sql) throw new Error('SQL de serviços não encontrado');
  const farms=await connection.execute(`SELECT MIN(cod_fazenda) AS cod FROM agricola.fazenda WHERE cod_grupoempresa=1 AND cod_empresa=1`,{}, {outFormat:oracledb.OUT_FORMAT_OBJECT});
  const codFazenda=process.argv[3] ? Number(process.argv[3]) : farms.rows[0].COD;
  console.log(JSON.stringify({fazenda:(await connection.execute(`SELECT cod_fazenda,cod_grupoempresa,cod_empresa,cod_filial FROM agricola.fazenda WHERE cod_fazenda=:codFazenda`,{codFazenda},{outFormat:oracledb.OUT_FORMAT_OBJECT})).rows}));
  console.log(JSON.stringify({tabelas:(await connection.execute(`SELECT cod_grupoempresa,cod_empresa,cod_tabelapreco,TO_CHAR(datainicio,'YYYY-MM-DD') AS inicio,TO_CHAR(datafinal,'YYYY-MM-DD') AS fim FROM rh.tabelapreco ORDER BY cod_grupoempresa,cod_empresa,datainicio DESC`,{},{outFormat:oracledb.OUT_FORMAT_OBJECT})).rows}));
  for (const dataApontamento of ['2026-10-20','2026-03-01']) {
    const result=await connection.execute(sql,{codFazenda,dataApontamento},{outFormat:oracledb.OUT_FORMAT_OBJECT});
    console.log(JSON.stringify({data:dataApontamento,quantidade:result.rows.length,tabelas:[...new Set(result.rows.map(r=>r.COD_TABELAPRECO))],exemplo:result.rows.find(r=>r.COD_ATIVIDADE===1)}));
  }
} finally { await connection?.close(); }
