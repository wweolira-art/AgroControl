import { consultarSql, sincronizarConexaoBancoOrds } from '../server/oracle.ts';

await sincronizarConexaoBancoOrds();

const tables = ['TMP_OSAPONTAMENTO', 'TMP_OSITEMAPONT', 'TMP_OSMATERIAL'];
for (const t of tables) {
  try {
    const cols = await consultarSql(
      `SELECT column_name, data_type, data_length
       FROM all_tab_columns
       WHERE owner = 'AGRICOLA' AND table_name = :t
       ORDER BY column_id`,
      { t },
    );
    console.log(`=== agricola.${t.toLowerCase()} ===`);
    for (const c of cols) {
      console.log(c.COLUMN_NAME ?? c.column_name, c.DATA_TYPE ?? c.data_type);
    }
    const sample = await consultarSql(`SELECT * FROM agricola.${t.toLowerCase()} WHERE ROWNUM <= 2`);
    console.log('sample rows:', sample.length);
    if (sample[0]) {
      console.log(JSON.stringify(sample[0], null, 2));
    }
  } catch (e) {
    console.log('ERR', t, e instanceof Error ? e.message : e);
  }
}
