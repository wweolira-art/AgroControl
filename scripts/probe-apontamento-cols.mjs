import { consultarSql, sincronizarConexaoBancoOrds } from '../server/oracle.ts';

await sincronizarConexaoBancoOrds();

for (const t of ['FAZENDA', 'TALHAO', 'OPERACAOOBJETOCUSTO']) {
  const owner = t === 'OPERACAOOBJETOCUSTO' ? 'RH' : 'AGRICOLA';
  const cols = await consultarSql(
    `SELECT column_name FROM all_tab_columns WHERE owner = :owner AND table_name = :t ORDER BY column_id`,
    { owner, t },
  );
  console.log(`=== ${owner}.${t} ===`);
  console.log(cols.map((c) => c.COLUMN_NAME ?? c.column_name).join(', '));
}

const faz = await consultarSql(`SELECT * FROM agricola.fazenda WHERE ROWNUM <= 1`);
console.log('fazenda sample', JSON.stringify(faz[0], null, 2));

const tal = await consultarSql(`SELECT * FROM agricola.talhao WHERE ROWNUM <= 1`);
console.log('talhao sample keys', Object.keys(tal[0] ?? {}));

const op = await consultarSql(`SELECT * FROM rh.operacaoobjetocusto WHERE data_termino IS NULL AND ROWNUM <= 1`);
console.log('operacao sample', JSON.stringify(op[0], null, 2));
