-- Configure o bind :oracle_password no cliente SQL; nunca salve a senha neste arquivo.
-- Rode no Database Actions da Autonomous (schema ADMIN), de uma vez.
-- 1) Cria ERP_CONEXAO e publica no ORDS (o app usa isto no Testar/Salvar).
-- 2) Tenta o database link para 0.tcp.sa.ngrok.io:10057/csorcl (pode falhar no ADB;
--    mesmo assim o Testar deixa de retornar Not Found).

ALTER SESSION SET GLOBAL_NAMES = FALSE;

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE ERP_CONEXAO (
      id NUMBER PRIMARY KEY,
      usuario VARCHAR2(128) NOT NULL,
      senha VARCHAR2(128),
      connect_string VARCHAR2(512) NOT NULL,
      atualizado_em TIMESTAMP DEFAULT SYSTIMESTAMP
    )
  ]';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

MERGE INTO ERP_CONEXAO t
USING (
  SELECT 1 AS id,
         'CONSULTA' AS usuario,
         :oracle_password AS senha,
         '0.tcp.sa.ngrok.io:10057/csorcl' AS connect_string
  FROM dual
) s
ON (t.id = s.id)
WHEN MATCHED THEN UPDATE SET
  t.usuario = s.usuario,
  t.senha = s.senha,
  t.connect_string = s.connect_string,
  t.atualizado_em = SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT (id, usuario, senha, connect_string)
VALUES (s.id, s.usuario, s.senha, s.connect_string);

BEGIN
  ORDS.ENABLE_OBJECT(
    p_enabled      => TRUE,
    p_schema       => 'ADMIN',
    p_object       => 'ERP_CONEXAO',
    p_object_type  => 'TABLE',
    p_object_alias => 'erp_conexao'
  );
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
/

COMMIT;

BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => '0.tcp.sa.ngrok.io',
    lower_port => 10057,
    upper_port => 10057,
    ace => xs$ace_type(
      privilege_list => xs$name_list('connect', 'resolve'),
      principal_name => 'ADMIN',
      principal_type => xs_acl.ptype_db
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
/

-- Crie o link pela procedure ERP_RECRIAR_LINK com credenciais informadas em ambiente seguro.

CREATE OR REPLACE PROCEDURE ERP_RECRIAR_LINK(
  p_usuario VARCHAR2,
  p_senha VARCHAR2,
  p_connect VARCHAR2
) AS
  l_user VARCHAR2(128);
  l_pass VARCHAR2(128);
  l_conn VARCHAR2(512);
  l_host VARCHAR2(256);
  l_port VARCHAR2(16);
  l_svc  VARCHAR2(128);
  l_using VARCHAR2(1000);
BEGIN
  l_user := REGEXP_REPLACE(TRIM(p_usuario), '[^A-Za-z0-9_$#]', '');
  l_pass := p_senha;
  l_conn := TRIM(p_connect);
  IF l_user IS NULL OR l_conn IS NULL THEN
    RAISE_APPLICATION_ERROR(-20001, 'Usuario e ORACLE_CONNECT_STRING sao obrigatorios.');
  END IF;
  IF NOT REGEXP_LIKE(l_conn, '^[A-Za-z0-9._:-]+/[A-Za-z0-9._$-]+$') THEN
    RAISE_APPLICATION_ERROR(-20002, 'ORACLE_CONNECT_STRING invalida. Use HOST:PORTA/SERVICO');
  END IF;
  l_host := REGEXP_SUBSTR(l_conn, '^[^:]+');
  l_port := REGEXP_SUBSTR(l_conn, '[^:]+', 1, 2);
  l_port := SUBSTR(l_port, 1, INSTR(l_port || '/', '/') - 1);
  l_svc := SUBSTR(l_conn, INSTR(l_conn, '/') + 1);
  l_using := '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=' || l_host || ')(PORT=' || l_port ||
             '))(CONNECT_DATA=(SERVICE_NAME=' || l_svc || ')))';
  BEGIN
    EXECUTE IMMEDIATE 'DROP DATABASE LINK erp_insumos';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE != -2024 THEN RAISE; END IF;
  END;
  EXECUTE IMMEDIATE
    'CREATE DATABASE LINK erp_insumos CONNECT TO ' || l_user ||
    ' IDENTIFIED BY "' || REPLACE(l_pass, '"', '""') || '" USING ''' || l_using || '''';
  UPDATE ERP_CONEXAO
     SET usuario = l_user,
         senha = NVL(l_pass, senha),
         connect_string = l_conn,
         atualizado_em = SYSTIMESTAMP
   WHERE id = 1;
  IF SQL%ROWCOUNT = 0 THEN
    INSERT INTO ERP_CONEXAO (id, usuario, senha, connect_string) VALUES (1, l_user, l_pass, l_conn);
  END IF;
  COMMIT;
END;
/

BEGIN
  ORDS.DELETE_MODULE(p_module_name => 'insumos');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
/

BEGIN
  ORDS.DEFINE_MODULE(
    p_module_name    => 'insumos',
    p_base_path      => 'insumos/',
    p_items_per_page => 0,
    p_status         => 'PUBLISHED',
    p_comments       => 'Custos e insumos do Oracle em nuvem (Easy Connect)'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'conexao/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'conexao/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT usuario,
       connect_string,
       CASE WHEN senha IS NOT NULL THEN 1 ELSE 0 END AS senha_definida
  FROM ERP_CONEXAO
 WHERE id = 1
~',
    p_items_per_page => 1
  );
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'conexao/',
    p_method      => 'PUT',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~
DECLARE
  l_senha ERP_CONEXAO.senha%TYPE;
  l_conn  VARCHAR2(512);
BEGIN
  BEGIN
    SELECT senha INTO l_senha FROM ERP_CONEXAO WHERE id = 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      l_senha := NULL;
  END;
  IF :senha IS NOT NULL AND LENGTH(TRIM(:senha)) > 0 THEN
    l_senha := :senha;
  END IF;
  l_conn := NVL(:connect_string, :connectString);
  UPDATE ERP_CONEXAO
     SET usuario = NVL(:usuario, usuario),
         senha = NVL(l_senha, senha),
         connect_string = NVL(l_conn, connect_string),
         atualizado_em = SYSTIMESTAMP
   WHERE id = 1;
  IF SQL%ROWCOUNT = 0 THEN
    INSERT INTO ERP_CONEXAO (id, usuario, senha, connect_string)
    VALUES (1, :usuario, l_senha, l_conn);
  END IF;
  COMMIT;
  BEGIN
    ERP_RECRIAR_LINK(NVL(:usuario, 'CONSULTA'), l_senha, l_conn);
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
END;
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'ping/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'ping/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => 'SELECT USER AS usuario FROM DUAL',
    p_items_per_page => 1
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'equipamentos/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'equipamentos/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT DISTINCT cod_equipamento
  FROM automotivo.itens_apontamento@erp_insumos
 WHERE cod_fazenda = :codFazenda
   AND cod_talhao = :codTalhao
   AND dt_apontamento >= ADD_MONTHS(TO_DATE(:dataInicio,'YYYY-MM-DD'), -2)
   AND dt_apontamento < TO_DATE(:dataFim,'YYYY-MM-DD')
   AND cod_equipamento IS NOT NULL
~',
    p_items_per_page => 0
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'ficha/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'ficha/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT t.areaplantada, t.areaproducao, t.cod_variedade, v.descricao AS variedade,
       t.cod_tiposolo, s.descricao AS tipo_solo, s.descricaodetalhada AS tipo_solo_detalhe
  FROM agricola.talhao@erp_insumos t
  LEFT JOIN agricola.variedade@erp_insumos v ON v.cod_variedade = t.cod_variedade
  LEFT JOIN agricola.tipo_solo@erp_insumos s ON s.cod_tiposolo = t.cod_tiposolo
 WHERE t.cod_fazenda = :codFazenda
   AND t.cod_talhao = :codTalhao
   AND ROWNUM = 1
~',
    p_items_per_page => 1
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'desc_equipamentos/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'desc_equipamentos/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT cod_equipamento, descricao
  FROM automotivo.equipamento@erp_insumos
 WHERE INSTR(',' || :csv || ',', ',' || TO_CHAR(cod_equipamento) || ',') > 0
~',
    p_items_per_page => 0
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'operacoes/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'operacoes/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT DISTINCT cod_equipamento, cod_operacaoagricola
  FROM automotivo.itens_apontamento@erp_insumos
 WHERE cod_fazenda = :codFazenda
   AND cod_talhao = :codTalhao
   AND dt_apontamento >= TO_DATE(:dataInicio,'YYYY-MM-DD')
   AND dt_apontamento < TO_DATE(:dataFim,'YYYY-MM-DD')
   AND INSTR(',' || :equipamentosCsv || ',', ',' || TO_CHAR(cod_equipamento) || ',') > 0
   AND cod_operacaoagricola IS NOT NULL
~',
    p_items_per_page => 0
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'insumos/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'insumos/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
WITH insumos AS (
  SELECT m.cod_material, m.quantidade, (m.quantidade * NVL(req.vrcustounitario, 0)) AS valor_total
    FROM agricola.apontamentomaterial@erp_insumos m
    INNER JOIN agricola.apontamentoitem@erp_insumos i
      ON i.cod_grupoempresa = m.cod_grupoempresa AND i.cod_empresa = m.cod_empresa
     AND i.cod_filial = m.cod_filial AND i.ano_apontamento = m.ano_apontamento
     AND i.nr_apontamento = m.nr_apontamento AND i.item_apontamento = m.item_apontamento
    INNER JOIN agricola.apontamento@erp_insumos ap
      ON ap.cod_grupoempresa = m.cod_grupoempresa AND ap.cod_empresa = m.cod_empresa
     AND ap.cod_filial = m.cod_filial AND ap.ano_apontamento = m.ano_apontamento
     AND ap.nr_apontamento = m.nr_apontamento
    LEFT JOIN material.itensrequisicaomaterial@erp_insumos req
      ON req.nrrequisicao = m.nrrequisicao AND req.cod_material = m.cod_material AND req.item = m.item_requisicao
   WHERE i.cod_fazenda = :codFazenda AND i.cod_talhao = :codTalhao
     AND ap.data_apontamento >= TO_DATE(:dataInicio,'YYYY-MM-DD')
     AND ap.data_apontamento < TO_DATE(:dataFim,'YYYY-MM-DD')
)
SELECT NVL(mat.cod_familia, 0) AS cod_familia,
       NVL(mat.cod_grupomaterial, 0) AS cod_grupomaterial,
       NVL(TRIM(gm.descricao), 'Sem grupo') AS grupo_descricao,
       i.cod_material,
       NVL(TRIM(mat.descricao), TO_CHAR(i.cod_material)) AS material_descricao,
       SUM(NVL(i.quantidade, 0)) AS quantidade,
       SUM(NVL(i.valor_total, 0)) AS custo_insumo
  FROM insumos i
  LEFT JOIN material.material@erp_insumos mat ON mat.cod_material = i.cod_material
  LEFT JOIN material.grupomaterial@erp_insumos gm
    ON gm.cod_familia = mat.cod_familia AND gm.cod_grupomaterial = mat.cod_grupomaterial
 GROUP BY NVL(mat.cod_familia, 0), NVL(mat.cod_grupomaterial, 0),
          NVL(TRIM(gm.descricao), 'Sem grupo'), i.cod_material,
          NVL(TRIM(mat.descricao), TO_CHAR(i.cod_material))
~',
    p_items_per_page => 0
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'insumos_atividade/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'insumos_atividade/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT NVL(i.cod_objetocusto, d.cod_objetocusto) AS cod_objetocusto,
       oc.atividade, TRIM(oc.descricao) AS atividade_descricao,
       m.cod_material, NVL(TRIM(mat.descricao), TO_CHAR(m.cod_material)) AS material_descricao,
       SUM(NVL(m.quantidade, 0)) AS quantidade,
       SUM(m.quantidade * NVL(req.vrcustounitario, 0)) AS custo_insumo
  FROM agricola.apontamentomaterial@erp_insumos m
  INNER JOIN agricola.apontamentoitem@erp_insumos i
    ON i.cod_grupoempresa = m.cod_grupoempresa AND i.cod_empresa = m.cod_empresa
   AND i.cod_filial = m.cod_filial AND i.ano_apontamento = m.ano_apontamento
   AND i.nr_apontamento = m.nr_apontamento AND i.item_apontamento = m.item_apontamento
  INNER JOIN agricola.apontamento@erp_insumos ap
    ON ap.cod_grupoempresa = m.cod_grupoempresa AND ap.cod_empresa = m.cod_empresa
   AND ap.cod_filial = m.cod_filial AND ap.ano_apontamento = m.ano_apontamento
   AND ap.nr_apontamento = m.nr_apontamento
  LEFT JOIN material.itensrequisicaomaterial@erp_insumos req
    ON req.nrrequisicao = m.nrrequisicao AND req.cod_material = m.cod_material AND req.item = m.item_requisicao
  LEFT JOIN material.material@erp_insumos mat ON mat.cod_material = m.cod_material
  LEFT JOIN rh.operacaoobjetocusto@erp_insumos d
    ON d.cod_operacaoagricola = i.cod_operacao AND d.data_termino IS NULL
  LEFT JOIN custo.objetocusto@erp_insumos oc
    ON oc.cod_objetocusto = NVL(i.cod_objetocusto, d.cod_objetocusto)
 WHERE i.cod_fazenda = :codFazenda AND i.cod_talhao = :codTalhao
   AND ap.data_apontamento >= TO_DATE(:dataInicio,'YYYY-MM-DD')
   AND ap.data_apontamento < TO_DATE(:dataFim,'YYYY-MM-DD')
 GROUP BY NVL(i.cod_objetocusto, d.cod_objetocusto), oc.atividade, TRIM(oc.descricao),
          m.cod_material, NVL(TRIM(mat.descricao), TO_CHAR(m.cod_material))
~',
    p_items_per_page => 0
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'equipamentos_atividade/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'equipamentos_atividade/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT ap.cod_equipamento, oc.atividade, TRIM(oc.descricao) AS atividade_descricao, d.cod_objetocusto,
       SUM(NVL(NULLIF(ap.tothoros_trabalhadas, 0), NVL(ap.dur_kmhs, 0))) AS horas
  FROM automotivo.itens_apontamento@erp_insumos ap
  LEFT JOIN rh.operacaoobjetocusto@erp_insumos d
    ON d.cod_operacaoagricola = ap.cod_operacaoagricola AND d.data_termino IS NULL
  LEFT JOIN custo.objetocusto@erp_insumos oc ON oc.cod_objetocusto = d.cod_objetocusto
 WHERE ap.cod_fazenda = :codFazenda AND ap.cod_talhao = :codTalhao
   AND ap.dt_apontamento >= TO_DATE(:dataInicio,'YYYY-MM-DD')
   AND ap.dt_apontamento < TO_DATE(:dataFim,'YYYY-MM-DD')
   AND INSTR(',' || :equipamentosCsv || ',', ',' || TO_CHAR(ap.cod_equipamento) || ',') > 0
 GROUP BY ap.cod_equipamento, oc.atividade, TRIM(oc.descricao), d.cod_objetocusto
~',
    p_items_per_page => 0
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'abastecimento/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'abastecimento/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
WITH custoMedioMaterial AS (
  SELECT cod_grupoempresa, cod_material, ano, mes, AVG(custo_medio) AS custo_medio
    FROM material.customedio@erp_insumos
   GROUP BY cod_grupoempresa, cod_material, ano, mes
),
abastecimentos AS (
  SELECT a.cod_equipamento, a.dtabastecimento AS data_abastecimento, a.qtdelitros AS qtde_litros,
         a.kmhs_rodados, (a.qtdelitros * NVL(cm.custo_medio, 0)) AS valor_total
    FROM automotivo.abastecimento@erp_insumos a
    LEFT JOIN custoMedioMaterial cm
      ON cm.cod_grupoempresa = a.cod_grupoempresa AND cm.cod_material = a.cod_material
     AND cm.ano = EXTRACT(YEAR FROM a.dtabastecimento) AND cm.mes = EXTRACT(MONTH FROM a.dtabastecimento)
   WHERE a.dtabastecimento >= TO_DATE(:dataInicio,'YYYY-MM-DD')
     AND a.dtabastecimento < TO_DATE(:dataFim,'YYYY-MM-DD')
     AND INSTR(',' || :equipamentosCsv || ',', ',' || TO_CHAR(a.cod_equipamento) || ',') > 0
  UNION ALL
  SELECT a.cod_equipamento, a.data, a.qtde_litros, a.kmhs_rodados,
         (a.qtde_litros * NVL(cm.custo_medio, 0))
    FROM posto.abastecimento@erp_insumos a
    LEFT JOIN custoMedioMaterial cm
      ON cm.cod_grupoempresa = a.cod_grupoempresa AND cm.cod_material = a.cod_material
     AND cm.ano = EXTRACT(YEAR FROM a.data) AND cm.mes = EXTRACT(MONTH FROM a.data)
   WHERE a.data >= TO_DATE(:dataInicio,'YYYY-MM-DD')
     AND a.data < TO_DATE(:dataFim,'YYYY-MM-DD')
     AND INSTR(',' || :equipamentosCsv || ',', ',' || TO_CHAR(a.cod_equipamento) || ',') > 0
),
detalhe AS (
  SELECT TO_CHAR(a.data_abastecimento, 'YYYYMM') AS anomes, a.cod_equipamento,
         NVL(a.kmhs_rodados, 0) AS kmhs_rodados, NVL(a.qtde_litros, 0) AS qtde_litros,
         NVL(a.valor_total, 0) AS valor_abastecimento, b.cod_fazenda, b.cod_talhao,
         SUM(NVL(a.kmhs_rodados, 0)) OVER (PARTITION BY TO_CHAR(a.data_abastecimento, 'YYYYMM'), a.cod_equipamento) AS kmhs_total
    FROM abastecimentos a
    LEFT JOIN LATERAL (
      SELECT ap.cod_fazenda, ap.cod_talhao
        FROM automotivo.itens_apontamento@erp_insumos ap
       WHERE ap.cod_equipamento = a.cod_equipamento AND ap.dt_apontamento <= a.data_abastecimento
       ORDER BY ap.dt_apontamento DESC
       FETCH FIRST 1 ROW ONLY
    ) b ON 1 = 1
)
SELECT anomes, cod_equipamento, SUM(kmhs_rodados) AS kmhs_rodados, SUM(qtde_litros) AS qtde_litros,
       SUM(valor_abastecimento) AS valor_abastecimento, MAX(kmhs_total) AS kmhs_total
  FROM detalhe
 WHERE cod_fazenda = :codFazenda AND cod_talhao = :codTalhao AND cod_equipamento IS NOT NULL
 GROUP BY anomes, cod_equipamento
~',
    p_items_per_page => 0
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'oficina/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'oficina/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
WITH custos AS (
  SELECT a.anomes, a.cod_objetocusto, a.cod_empenho, SUM(a.valor) AS valor
    FROM custo.lancamento_custo@erp_insumos a
   WHERE a.tipo = 'R'
     AND EXISTS (
       SELECT 1 FROM custo.objetocusto@erp_insumos b
        WHERE b.negocio = 3 AND b.processo = 1 AND b.subprocesso = 1 AND a.cod_objetocusto = b.cod_objetocusto
     )
     AND a.anomes >= :anomesInicio AND a.anomes <= :anomesFim
   GROUP BY a.anomes, a.cod_objetocusto, a.cod_empenho
),
ordens AS (
  SELECT cod_equipamento, TO_CHAR(dtabertura, 'YYYYMM') AS anomes,
         SUM((NVL(dtencerramento, SYSDATE) - dtabertura) * 24) AS horas_os
    FROM automotivo.ordemservico@erp_insumos
   WHERE dtencerramento IS NOT NULL
     AND dtabertura >= TO_DATE(:dataInicio,'YYYY-MM-DD')
     AND dtabertura < TO_DATE(:dataFim,'YYYY-MM-DD')
   GROUP BY cod_equipamento, TO_CHAR(dtabertura, 'YYYYMM')
),
horas_total AS (
  SELECT anomes, SUM(horas_os) AS horas_total FROM ordens GROUP BY anomes
),
rateio AS (
  SELECT c.anomes, o.cod_equipamento, o.horas_os, ht.horas_total,
         o.horas_os / ht.horas_total AS percentual_rateio,
         c.valor * (o.horas_os / ht.horas_total) AS custo_rateado
    FROM custos c
    INNER JOIN ordens o ON o.anomes = c.anomes
    INNER JOIN horas_total ht ON ht.anomes = o.anomes
   WHERE ht.horas_total > 0
     AND INSTR(',' || :equipamentosCsv || ',', ',' || TO_CHAR(o.cod_equipamento) || ',') > 0
)
SELECT anomes, cod_equipamento, MAX(horas_os) AS horas_os,
       MAX(percentual_rateio) AS percentual_rateio, SUM(custo_rateado) AS custo_rateado
  FROM rateio
 GROUP BY anomes, cod_equipamento
~',
    p_items_per_page => 0
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'insumos', p_pattern => 'material/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'insumos',
    p_pattern     => 'material/',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
WITH req AS (
  SELECT a.nrrequisicao, a.item, a.cod_material, a.quantidade, a.vrcustounitario,
         a.dataretirada, a.cod_equipamento, a.cod_objetocusto AS objetocustorequisicao,
         (a.quantidade * NVL(a.vrcustounitario, 0)) AS valor_total
    FROM material.itensrequisicaomaterial@erp_insumos a
   WHERE a.dataretirada IS NOT NULL
     AND a.dataretirada >= TO_DATE(:dataInicio,'YYYY-MM-DD')
     AND a.dataretirada < TO_DATE(:dataFim,'YYYY-MM-DD')
     AND INSTR(',' || :equipamentosCsv || ',', ',' || TO_CHAR(a.cod_equipamento) || ',') > 0
     AND NOT EXISTS (
       SELECT 1 FROM custo.objetocusto@erp_insumos oc_oficina
        WHERE oc_oficina.cod_objetocusto = a.cod_objetocusto
          AND oc_oficina.negocio = 3 AND oc_oficina.processo = 1
     )
     AND NOT EXISTS (
       SELECT 1 FROM agricola.apontamentomaterial@erp_insumos am
        WHERE am.nrrequisicao = a.nrrequisicao AND am.cod_material = a.cod_material AND am.item_requisicao = a.item
     )
     AND NOT EXISTS (
       SELECT 1 FROM material.material@erp_insumos mat
       INNER JOIN material.grupomaterial@erp_insumos gm
         ON mat.cod_familia = gm.cod_familia AND mat.cod_grupomaterial = gm.cod_grupomaterial
        WHERE mat.cod_material = a.cod_material AND mat.cod_familia = 29 AND mat.cod_grupomaterial IN (10, 11, 1, 4, 5)
     )
)
SELECT TO_CHAR(r.dataretirada, 'YYYYMM') AS anomes, r.cod_equipamento, SUM(NVL(r.valor_total, 0)) AS custo_material
  FROM req r
  LEFT JOIN LATERAL (
    SELECT ap.cod_fazenda, ap.cod_talhao
      FROM automotivo.itens_apontamento@erp_insumos ap
     WHERE ap.cod_equipamento = r.cod_equipamento AND ap.dt_apontamento <= r.dataretirada
     ORDER BY ap.dt_apontamento DESC
     FETCH FIRST 1 ROW ONLY
  ) b ON 1 = 1
 WHERE b.cod_fazenda = :codFazenda AND b.cod_talhao = :codTalhao
 GROUP BY TO_CHAR(r.dataretirada, 'YYYYMM'), r.cod_equipamento
~',
    p_items_per_page => 0
  );
END;
/

COMMIT;
