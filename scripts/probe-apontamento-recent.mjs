import { consultarSql, sincronizarConexaoBancoOrds } from '../server/oracle.ts';

await sincronizarConexaoBancoOrds();

const recent = await consultarSql(
  `SELECT a.ano_apontamento, a.nr_apontamento, a.data_apontamento,
          i.cod_fazenda, i.cod_talhao, i.cod_operacao, i.area, i.cod_safra,
          i.cod_tipofazenda, i.cod_objetocusto, i.cod_meioaplicacao, i.zona,
          m.cod_material, m.quantidade, m.seq_material
   FROM agricola.tmp_osapontamento a
   INNER JOIN agricola.tmp_ositemapont i
     ON i.ano_apontamento = a.ano_apontamento AND i.nr_apontamento = a.nr_apontamento
   LEFT JOIN agricola.tmp_osmaterial m
     ON m.ano_apontamento = i.ano_apontamento AND m.nr_apontamento = i.nr_apontamento
    AND m.item_apontamento = i.item_apontamento
   WHERE a.ano_apontamento = 2025
   ORDER BY a.nr_apontamento DESC
   FETCH FIRST 3 ROWS ONLY`,
);
console.log(JSON.stringify(recent, null, 2));

const seq = await consultarSql(
  `SELECT MAX(nr_apontamento) AS max_nr FROM agricola.tmp_osapontamento WHERE ano_apontamento = :ano`,
  { ano: new Date().getFullYear() },
);
console.log('seq current year', seq);
