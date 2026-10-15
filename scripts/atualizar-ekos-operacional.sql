-- Rode no Database Actions (schema ADMIN) após habilitar-ekos-dados.sql.
-- Tabela dedicada de ordens de serviço, fazendas e campos extras em talhões/operações.
-- Depois: npm run sync:ekos

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE EKOS_FAZENDA (
      id_farm           NUMBER PRIMARY KEY,
      id_business_unit  NUMBER NOT NULL,
      nome              VARCHAR2(500),
      ativo             NUMBER(1) DEFAULT 1,
      sincronizado_em   TIMESTAMP DEFAULT SYSTIMESTAMP
    )
  ]';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE EKOS_ORDEM_SERVICO (
      id_ordem          NUMBER PRIMARY KEY,
      id_business_unit  NUMBER NOT NULL,
      numero_os         NUMBER,
      data_os           DATE,
      id_operacao       NUMBER,
      nome_operacao     VARCHAR2(500),
      id_equipe         NUMBER,
      nome_equipe       VARCHAR2(500),
      prescricao        CLOB,
      volume_total      NUMBER,
      area_ha           NUMBER,
      talhoes           VARCHAR2(4000),
      talhao_ids        VARCHAR2(4000),
      ativo             NUMBER(1) DEFAULT 1,
      sincronizado_em   TIMESTAMP DEFAULT SYSTIMESTAMP
    )
  ]';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE EKOS_TALHAO ADD (area_ha NUMBER, nome_fazenda VARCHAR2(500))';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE NOT IN (-1430, -904) THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE EKOS_OPERACAO ADD (tipo VARCHAR2(120))';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE NOT IN (-1430, -904) THEN RAISE; END IF;
END;
/

CREATE OR REPLACE PROCEDURE EKOS_MERGE_FAZENDA(
  p_id_farm          NUMBER,
  p_id_business_unit NUMBER,
  p_nome             VARCHAR2,
  p_ativo            NUMBER
) AS
BEGIN
  MERGE INTO EKOS_FAZENDA t
  USING (SELECT p_id_farm AS id_farm FROM dual) s
  ON (t.id_farm = s.id_farm)
  WHEN MATCHED THEN UPDATE SET
    id_business_unit = p_id_business_unit,
    nome = p_nome,
    ativo = NVL(p_ativo, 1),
    sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (id_farm, id_business_unit, nome, ativo)
  VALUES (p_id_farm, p_id_business_unit, p_nome, NVL(p_ativo, 1));
  COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE EKOS_MERGE_OPERACAO(
  p_id_operacao      NUMBER,
  p_id_business_unit NUMBER,
  p_id_atividade     NUMBER,
  p_numero           NUMBER,
  p_nome             VARCHAR2,
  p_tipo             VARCHAR2,
  p_ativo            NUMBER
) AS
BEGIN
  MERGE INTO EKOS_OPERACAO t
  USING (SELECT p_id_operacao AS id_operacao FROM dual) s
  ON (t.id_operacao = s.id_operacao)
  WHEN MATCHED THEN UPDATE SET
    id_business_unit = p_id_business_unit,
    id_atividade = p_id_atividade,
    numero = p_numero,
    nome = p_nome,
    tipo = p_tipo,
    ativo = NVL(p_ativo, 1),
    sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    id_operacao, id_business_unit, id_atividade, numero, nome, tipo, ativo
  ) VALUES (
    p_id_operacao, p_id_business_unit, p_id_atividade, p_numero, p_nome, p_tipo, NVL(p_ativo, 1)
  );
  COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE EKOS_MERGE_TALHAO(
  p_id_field         NUMBER,
  p_id_business_unit NUMBER,
  p_id_farm          NUMBER,
  p_nome             VARCHAR2,
  p_cor              VARCHAR2,
  p_area_ha          NUMBER,
  p_nome_fazenda     VARCHAR2,
  p_ativo            NUMBER
) AS
BEGIN
  MERGE INTO EKOS_TALHAO t
  USING (SELECT p_id_field AS id_field FROM dual) s
  ON (t.id_field = s.id_field)
  WHEN MATCHED THEN UPDATE SET
    id_business_unit = p_id_business_unit,
    id_farm = p_id_farm,
    nome = p_nome,
    cor = p_cor,
    area_ha = p_area_ha,
    nome_fazenda = p_nome_fazenda,
    ativo = NVL(p_ativo, 1),
    sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    id_field, id_business_unit, id_farm, nome, cor, area_ha, nome_fazenda, ativo
  ) VALUES (
    p_id_field, p_id_business_unit, p_id_farm, p_nome, p_cor, p_area_ha, p_nome_fazenda, NVL(p_ativo, 1)
  );
  COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE EKOS_MERGE_ORDEM_SERVICO(
  p_id_ordem         NUMBER,
  p_id_business_unit NUMBER,
  p_numero_os        NUMBER,
  p_data_os          DATE,
  p_id_operacao      NUMBER,
  p_nome_operacao    VARCHAR2,
  p_id_equipe        NUMBER,
  p_nome_equipe      VARCHAR2,
  p_prescricao       CLOB,
  p_volume_total     NUMBER,
  p_area_ha          NUMBER,
  p_talhoes          VARCHAR2,
  p_talhao_ids       VARCHAR2,
  p_ativo            NUMBER
) AS
BEGIN
  MERGE INTO EKOS_ORDEM_SERVICO t
  USING (SELECT p_id_ordem AS id_ordem FROM dual) s
  ON (t.id_ordem = s.id_ordem)
  WHEN MATCHED THEN UPDATE SET
    id_business_unit = p_id_business_unit,
    numero_os = p_numero_os,
    data_os = p_data_os,
    id_operacao = p_id_operacao,
    nome_operacao = p_nome_operacao,
    id_equipe = p_id_equipe,
    nome_equipe = p_nome_equipe,
    prescricao = p_prescricao,
    volume_total = p_volume_total,
    area_ha = p_area_ha,
    talhoes = p_talhoes,
    talhao_ids = p_talhao_ids,
    ativo = NVL(p_ativo, 1),
    sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    id_ordem, id_business_unit, numero_os, data_os, id_operacao, nome_operacao,
    id_equipe, nome_equipe, prescricao, volume_total, area_ha, talhoes, talhao_ids, ativo
  ) VALUES (
    p_id_ordem, p_id_business_unit, p_numero_os, p_data_os, p_id_operacao, p_nome_operacao,
    p_id_equipe, p_nome_equipe, p_prescricao, p_volume_total, p_area_ha, p_talhoes, p_talhao_ids, NVL(p_ativo, 1)
  );
  COMMIT;
END;
/

BEGIN
  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'ordens/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'ordens/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT id_ordem, id_business_unit, numero_os, data_os, id_operacao, nome_operacao,
       id_equipe, nome_equipe, volume_total, area_ha, talhoes, talhao_ids, ativo, sincronizado_em
  FROM EKOS_ORDEM_SERVICO
 WHERE (:id_business_unit IS NULL OR id_business_unit = :id_business_unit)
 ORDER BY data_os DESC NULLS LAST, numero_os DESC
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'fazendas/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'fazendas/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT id_farm, id_business_unit, nome, ativo, sincronizado_em
  FROM EKOS_FAZENDA
 WHERE (:id_business_unit IS NULL OR id_business_unit = :id_business_unit)
 ORDER BY nome
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/fazenda/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/fazenda/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~BEGIN EKOS_MERGE_FAZENDA(:id_farm, :id_business_unit, :nome, :ativo); END;~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/ordem/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/ordem/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~
BEGIN
  EKOS_MERGE_ORDEM_SERVICO(
    :id_ordem, :id_business_unit, :numero_os,
    CASE WHEN :data_os IS NULL OR TRIM(:data_os) IS NULL THEN NULL ELSE TO_DATE(:data_os,'YYYY-MM-DD') END,
    :id_operacao, :nome_operacao, :id_equipe, :nome_equipe,
    :prescricao, :volume_total, :area_ha, :talhoes, :talhao_ids, :ativo
  );
END;
~'
  );
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE NOT IN (-942, -6550) THEN RAISE; END IF;
END;
/

COMMIT;
