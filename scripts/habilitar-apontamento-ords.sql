-- Rode no Database Actions (schema ADMIN). Expõe cadastros de apontamento via ORDS
-- para importação offline no celular (sem depender da API do PC).
-- Requer database link erp_insumos (scripts/habilitar-insumos-ords.sql).

BEGIN
  ORDS.ENABLE_SCHEMA(p_enabled => TRUE, p_schema => 'ADMIN', p_url_mapping_type => 'BASE_PATH');
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/

BEGIN
  ORDS.DEFINE_MODULE(p_module_name => 'apontamento', p_base_path => 'apontamento/', p_items_per_page => 1000);
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -942 THEN RAISE; END IF;
END;
/

BEGIN
  ORDS.DEFINE_TEMPLATE(p_module_name => 'apontamento', p_pattern => 'fazendas/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'apontamento',
    p_pattern     => 'fazendas/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT f.cod_fazenda, TRIM(f.descricao) AS nome
  FROM agricola.fazenda@erp_insumos f
 WHERE f.cod_fazenda > 0
 ORDER BY TRIM(f.descricao)
~',
    p_items_per_page => 1000
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'apontamento', p_pattern => 'talhoes/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'apontamento',
    p_pattern     => 'talhoes/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT t.cod_fazenda, t.cod_talhao, NVL(t.zona, 1) AS zona,
       NVL(t.areaplantada, t.areaproducao) AS area_ha,
       TRIM(NVL(t.descricao_talhao, TO_CHAR(t.cod_talhao))) AS descricao,
       t.cod_safra
  FROM agricola.talhao@erp_insumos t
 WHERE t.cod_fazenda > 0
   AND NVL(t.encerrado, 'N') <> 'S'
 ORDER BY t.cod_fazenda, t.cod_talhao
~',
    p_items_per_page => 1000
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'apontamento', p_pattern => 'materiais/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'apontamento',
    p_pattern     => 'materiais/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT m.cod_material, TRIM(m.descricao) AS descricao, NVL(TRIM(m.cod_unidade), 'UN') AS cod_unidade
  FROM material.material@erp_insumos m
 WHERE m.cod_familia = 44
   AND m.cod_material IS NOT NULL
 ORDER BY TRIM(m.descricao)
~',
    p_items_per_page => 10000
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'apontamento', p_pattern => 'operacoes/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'apontamento',
    p_pattern     => 'operacoes/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT o.cod_operacaoagricola AS cod_operacao,
       TRIM(o.descricao) AS descricao,
       NVL(oc.cod_objetocusto, 0) AS cod_objetocusto,
       NVL(oc.cod_tipofazenda, 1) AS cod_tipofazenda,
       NVL(oc.cod_grupoempresa, 1) AS cod_grupoempresa,
       NVL(oc.cod_empresa, 1) AS cod_empresa,
       NVL(oc.cod_filial, 1) AS cod_filial
  FROM rh.operacaoagricola@erp_insumos o
  LEFT JOIN rh.operacaoobjetocusto@erp_insumos oc
    ON oc.cod_operacaoagricola = o.cod_operacaoagricola
   AND oc.data_termino IS NULL
   AND oc.cod_objetocusto = (
         SELECT MIN(x.cod_objetocusto)
           FROM rh.operacaoobjetocusto@erp_insumos x
          WHERE x.cod_operacaoagricola = o.cod_operacaoagricola
            AND x.data_termino IS NULL
       )
 WHERE NVL(o.ativo, 'S') = 'S'
 ORDER BY TRIM(o.descricao), o.cod_operacaoagricola
~',
    p_items_per_page => 1000
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'apontamento', p_pattern => 'tipos-operacao/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'apontamento',
    p_pattern     => 'tipos-operacao/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT TRIM(t.tipo_operacao) AS tipo_operacao, TRIM(t.descricao) AS descricao
  FROM agricola.tipooperacao@erp_insumos t
 WHERE t.tipo_operacao IS NOT NULL
 ORDER BY t.id_tipooperac
~',
    p_items_per_page => 1000
  );
END;
/

COMMIT;
