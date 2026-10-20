-- Rode no Database Actions da Autonomous (schema ADMIN).
-- Cache local de operações e aplicação (água/calda) vindos do EKOS Jacto.
-- Depois execute: npm run sync:ekos

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE EKOS_UNIDADE (
      id_business_unit NUMBER PRIMARY KEY,
      id_client        NUMBER,
      nome             VARCHAR2(500),
      documento        VARCHAR2(50),
      localizacao      VARCHAR2(500),
      ativo            NUMBER(1) DEFAULT 1,
      sincronizado_em  TIMESTAMP DEFAULT SYSTIMESTAMP
    )
  ]';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE EKOS_OPERACAO (
      id_operacao       NUMBER PRIMARY KEY,
      id_business_unit  NUMBER NOT NULL,
      id_atividade      NUMBER,
      numero            NUMBER,
      nome              VARCHAR2(500),
      tipo              VARCHAR2(120),
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
    CREATE TABLE EKOS_MAQUINA (
      id_maquina        NUMBER PRIMARY KEY,
      id_business_unit  NUMBER NOT NULL,
      nome              VARCHAR2(500),
      serial            VARCHAR2(100),
      tipo              VARCHAR2(120),
      modelo            VARCHAR2(120),
      gps_int_x         NUMBER,
      gps_int_y         NUMBER,
      gps_ext_x         NUMBER,
      gps_ext_y         NUMBER,
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
    CREATE TABLE EKOS_APLICACAO_AGUA (
      id_ordem          NUMBER PRIMARY KEY,
      id_business_unit  NUMBER NOT NULL,
      numero_os         NUMBER,
      data_os           DATE,
      id_operacao       NUMBER,
      nome_operacao     VARCHAR2(500),
      prescricao        CLOB,
      volume_total      NUMBER,
      talhoes           VARCHAR2(4000),
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
    CREATE TABLE EKOS_TELEMETRIA_MONITORAMENTO (
      id_maquina        NUMBER PRIMARY KEY,
      id_business_unit  NUMBER NOT NULL,
      nome              VARCHAR2(500),
      latitude          NUMBER,
      longitude         NUMBER,
      status            VARCHAR2(120),
      modelo            VARCHAR2(120),
      alarme            NUMBER(1) DEFAULT 0,
      alerta_oper       NUMBER(1) DEFAULT 0,
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
    CREATE TABLE EKOS_CLIENTE (
      id_client       NUMBER PRIMARY KEY,
      nome            VARCHAR2(500),
      sincronizado_em TIMESTAMP DEFAULT SYSTIMESTAMP
    )
  ]';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE EKOS_ATIVIDADE (
      id_atividade      NUMBER PRIMARY KEY,
      id_business_unit  NUMBER NOT NULL,
      numero            NUMBER,
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
  EXECUTE IMMEDIATE q'[
    CREATE TABLE EKOS_TALHAO (
      id_field          NUMBER PRIMARY KEY,
      id_business_unit  NUMBER NOT NULL,
      id_farm           NUMBER,
      nome              VARCHAR2(500),
      cor               VARCHAR2(50),
      area_ha           NUMBER,
      nome_fazenda      VARCHAR2(500),
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
    CREATE TABLE EKOS_TELEMETRIA_PERIODO (
      id                NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      id_business_unit  NUMBER NOT NULL,
      init_date         NUMBER NOT NULL,
      end_date          NUMBER NOT NULL,
      data_inicio       DATE,
      data_fim          DATE,
      sincronizado_em   TIMESTAMP DEFAULT SYSTIMESTAMP,
      CONSTRAINT uq_ekos_tel_periodo UNIQUE (id_business_unit, init_date, end_date)
    )
  ]';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

CREATE OR REPLACE PROCEDURE EKOS_MERGE_UNIDADE(
  p_id_business_unit NUMBER,
  p_id_client        NUMBER,
  p_nome             VARCHAR2,
  p_documento        VARCHAR2,
  p_localizacao      VARCHAR2,
  p_ativo            NUMBER
) AS
BEGIN
  MERGE INTO EKOS_UNIDADE t
  USING (SELECT p_id_business_unit AS id_business_unit FROM dual) s
  ON (t.id_business_unit = s.id_business_unit)
  WHEN MATCHED THEN UPDATE SET
    id_client = p_id_client,
    nome = p_nome,
    documento = p_documento,
    localizacao = p_localizacao,
    ativo = NVL(p_ativo, 1),
    sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    id_business_unit, id_client, nome, documento, localizacao, ativo
  ) VALUES (
    p_id_business_unit, p_id_client, p_nome, p_documento, p_localizacao, NVL(p_ativo, 1)
  );
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

CREATE OR REPLACE PROCEDURE EKOS_MERGE_MAQUINA(
  p_id_maquina       NUMBER,
  p_id_business_unit NUMBER,
  p_nome             VARCHAR2,
  p_serial           VARCHAR2,
  p_tipo             VARCHAR2,
  p_modelo           VARCHAR2,
  p_gps_int_x        NUMBER,
  p_gps_int_y        NUMBER,
  p_gps_ext_x        NUMBER,
  p_gps_ext_y        NUMBER,
  p_ativo            NUMBER
) AS
BEGIN
  MERGE INTO EKOS_MAQUINA t
  USING (SELECT p_id_maquina AS id_maquina FROM dual) s
  ON (t.id_maquina = s.id_maquina)
  WHEN MATCHED THEN UPDATE SET
    id_business_unit = p_id_business_unit,
    nome = p_nome,
    serial = p_serial,
    tipo = p_tipo,
    modelo = p_modelo,
    gps_int_x = p_gps_int_x,
    gps_int_y = p_gps_int_y,
    gps_ext_x = p_gps_ext_x,
    gps_ext_y = p_gps_ext_y,
    ativo = NVL(p_ativo, 1),
    sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    id_maquina, id_business_unit, nome, serial, tipo, modelo,
    gps_int_x, gps_int_y, gps_ext_x, gps_ext_y, ativo
  ) VALUES (
    p_id_maquina, p_id_business_unit, p_nome, p_serial, p_tipo, p_modelo,
    p_gps_int_x, p_gps_int_y, p_gps_ext_x, p_gps_ext_y, NVL(p_ativo, 1)
  );
  COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE EKOS_MERGE_APLICACAO(
  p_id_ordem         NUMBER,
  p_id_business_unit NUMBER,
  p_numero_os        NUMBER,
  p_data_os          DATE,
  p_id_operacao      NUMBER,
  p_nome_operacao    VARCHAR2,
  p_prescricao       CLOB,
  p_volume_total     NUMBER,
  p_talhoes          VARCHAR2,
  p_ativo            NUMBER
) AS
BEGIN
  MERGE INTO EKOS_APLICACAO_AGUA t
  USING (SELECT p_id_ordem AS id_ordem FROM dual) s
  ON (t.id_ordem = s.id_ordem)
  WHEN MATCHED THEN UPDATE SET
    id_business_unit = p_id_business_unit,
    numero_os = p_numero_os,
    data_os = p_data_os,
    id_operacao = p_id_operacao,
    nome_operacao = p_nome_operacao,
    prescricao = p_prescricao,
    volume_total = p_volume_total,
    talhoes = p_talhoes,
    ativo = NVL(p_ativo, 1),
    sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    id_ordem, id_business_unit, numero_os, data_os, id_operacao, nome_operacao,
    prescricao, volume_total, talhoes, ativo
  ) VALUES (
    p_id_ordem, p_id_business_unit, p_numero_os, p_data_os, p_id_operacao, p_nome_operacao,
    p_prescricao, p_volume_total, p_talhoes, NVL(p_ativo, 1)
  );
  COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE EKOS_MERGE_CLIENTE(
  p_id_client NUMBER,
  p_nome      VARCHAR2
) AS
BEGIN
  MERGE INTO EKOS_CLIENTE t
  USING (SELECT p_id_client AS id_client FROM dual) s
  ON (t.id_client = s.id_client)
  WHEN MATCHED THEN UPDATE SET nome = p_nome, sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (id_client, nome) VALUES (p_id_client, p_nome);
  COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE EKOS_MERGE_ATIVIDADE(
  p_id_atividade     NUMBER,
  p_id_business_unit NUMBER,
  p_numero           NUMBER,
  p_nome             VARCHAR2,
  p_ativo            NUMBER
) AS
BEGIN
  MERGE INTO EKOS_ATIVIDADE t
  USING (SELECT p_id_atividade AS id_atividade FROM dual) s
  ON (t.id_atividade = s.id_atividade)
  WHEN MATCHED THEN UPDATE SET
    id_business_unit = p_id_business_unit,
    numero = p_numero,
    nome = p_nome,
    ativo = NVL(p_ativo, 1),
    sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    id_atividade, id_business_unit, numero, nome, ativo
  ) VALUES (
    p_id_atividade, p_id_business_unit, p_numero, p_nome, NVL(p_ativo, 1)
  );
  COMMIT;
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

CREATE OR REPLACE PROCEDURE EKOS_MERGE_PERIODO(
  p_id_business_unit NUMBER,
  p_init_date        NUMBER,
  p_end_date         NUMBER
) AS
BEGIN
  MERGE INTO EKOS_TELEMETRIA_PERIODO t
  USING (
    SELECT p_id_business_unit AS id_business_unit,
           p_init_date AS init_date,
           p_end_date AS end_date,
           DATE '1970-01-01' + p_init_date AS data_inicio,
           DATE '1970-01-01' + p_end_date AS data_fim
      FROM dual
  ) s
  ON (t.id_business_unit = s.id_business_unit
      AND t.init_date = s.init_date
      AND t.end_date = s.end_date)
  WHEN MATCHED THEN UPDATE SET
    data_inicio = s.data_inicio,
    data_fim = s.data_fim,
    sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    id_business_unit, init_date, end_date, data_inicio, data_fim
  ) VALUES (
    p_id_business_unit, p_init_date, p_end_date, s.data_inicio, s.data_fim
  );
  COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE EKOS_MERGE_MONITORAMENTO(
  p_id_maquina        NUMBER,
  p_id_business_unit  NUMBER,
  p_nome              VARCHAR2,
  p_latitude          NUMBER,
  p_longitude         NUMBER,
  p_status            VARCHAR2,
  p_modelo            VARCHAR2,
  p_alarme            NUMBER,
  p_alerta_oper       NUMBER
) AS
BEGIN
  MERGE INTO EKOS_TELEMETRIA_MONITORAMENTO t
  USING (SELECT p_id_maquina AS id_maquina FROM dual) s
  ON (t.id_maquina = s.id_maquina)
  WHEN MATCHED THEN UPDATE SET
    id_business_unit = p_id_business_unit,
    nome = p_nome,
    latitude = p_latitude,
    longitude = p_longitude,
    status = p_status,
    modelo = p_modelo,
    alarme = NVL(p_alarme, 0),
    alerta_oper = NVL(p_alerta_oper, 0),
    sincronizado_em = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    id_maquina, id_business_unit, nome, latitude, longitude,
    status, modelo, alarme, alerta_oper
  ) VALUES (
    p_id_maquina, p_id_business_unit, p_nome, p_latitude, p_longitude,
    p_status, p_modelo, NVL(p_alarme, 0), NVL(p_alerta_oper, 0)
  );
  COMMIT;
END;
/

BEGIN
  ORDS.DELETE_MODULE(p_module_name => 'ekos_dados');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
/

BEGIN
  ORDS.DEFINE_MODULE(
    p_module_name    => 'ekos_dados',
    p_base_path      => 'ekos_dados/',
    p_items_per_page => 0,
    p_status         => 'PUBLISHED',
    p_comments       => 'Cache EKOS: operações, máquinas/GPS e aplicação (água/calda)'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'unidades/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'unidades/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~SELECT id_business_unit, id_client, nome, documento, localizacao, ativo, sincronizado_em FROM EKOS_UNIDADE ORDER BY nome~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'operacoes/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'operacoes/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT id_operacao, id_business_unit, id_atividade, numero, nome, tipo, ativo, sincronizado_em
  FROM EKOS_OPERACAO
 WHERE (:id_business_unit IS NULL OR id_business_unit = :id_business_unit)
 ORDER BY nome
~'
  );

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

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'maquinas/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'maquinas/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT id_maquina, id_business_unit, nome, serial, tipo, modelo,
       gps_int_x, gps_int_y, gps_ext_x, gps_ext_y, ativo, sincronizado_em
  FROM EKOS_MAQUINA
 WHERE (:id_business_unit IS NULL OR id_business_unit = :id_business_unit)
 ORDER BY nome
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'agua/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'agua/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT id_ordem, id_business_unit, numero_os, data_os, id_operacao, nome_operacao,
       volume_total, talhoes, prescricao, ativo, sincronizado_em
  FROM EKOS_APLICACAO_AGUA
 WHERE (:id_business_unit IS NULL OR id_business_unit = :id_business_unit)
 ORDER BY data_os DESC NULLS LAST, numero_os DESC
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'periodos/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'periodos/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT id, id_business_unit, init_date, end_date,
       TO_CHAR(data_inicio, 'YYYY-MM-DD') AS data_inicio,
       TO_CHAR(data_fim, 'YYYY-MM-DD') AS data_fim,
       sincronizado_em
  FROM EKOS_TELEMETRIA_PERIODO
 WHERE (:id_business_unit IS NULL OR id_business_unit = :id_business_unit)
 ORDER BY init_date DESC
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'telemetria/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'telemetria/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT id, id_business_unit, init_date, end_date,
       TO_CHAR(data_inicio, 'YYYY-MM-DD') AS data_inicio,
       TO_CHAR(data_fim, 'YYYY-MM-DD') AS data_fim,
       sincronizado_em
  FROM EKOS_TELEMETRIA_PERIODO
 WHERE (:id_business_unit IS NULL OR id_business_unit = :id_business_unit)
 ORDER BY data_inicio DESC NULLS LAST, init_date DESC
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'monitoramento/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'monitoramento/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT id_maquina, id_business_unit, nome, latitude, longitude,
       status, modelo, alarme, alerta_oper, sincronizado_em
  FROM EKOS_TELEMETRIA_MONITORAMENTO
 WHERE (:id_business_unit IS NULL OR id_business_unit = :id_business_unit)
 ORDER BY nome
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'clientes/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'clientes/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~SELECT id_client, nome, sincronizado_em FROM EKOS_CLIENTE ORDER BY nome~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'atividades/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'atividades/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT id_atividade, id_business_unit, numero, nome, ativo, sincronizado_em
  FROM EKOS_ATIVIDADE
 WHERE (:id_business_unit IS NULL OR id_business_unit = :id_business_unit)
 ORDER BY nome
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'talhoes/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'talhoes/', p_method => 'GET',
    p_source_type => ORDS.source_type_collection_feed,
    p_source      => q'~
SELECT id_field, id_business_unit, id_farm, nome, cor, area_ha, nome_fazenda, ativo, sincronizado_em
  FROM EKOS_TALHAO
 WHERE (:id_business_unit IS NULL OR id_business_unit = :id_business_unit)
 ORDER BY nome
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

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/unidade/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/unidade/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~
BEGIN
  EKOS_MERGE_UNIDADE(
    :id_business_unit, :id_client, :nome, :documento, :localizacao, :ativo
  );
END;
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/operacao/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/operacao/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~
BEGIN
  EKOS_MERGE_OPERACAO(
    :id_operacao, :id_business_unit, :id_atividade, :numero, :nome, :tipo, :ativo
  );
END;
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/maquina/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/maquina/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~
BEGIN
  EKOS_MERGE_MAQUINA(
    :id_maquina, :id_business_unit, :nome, :serial, :tipo, :modelo,
    :gps_int_x, :gps_int_y, :gps_ext_x, :gps_ext_y, :ativo
  );
END;
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/agua/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/agua/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~
BEGIN
  EKOS_MERGE_APLICACAO(
    :id_ordem, :id_business_unit, :numero_os,
    CASE WHEN :data_os IS NULL OR TRIM(:data_os) IS NULL THEN NULL ELSE TO_DATE(:data_os,'YYYY-MM-DD') END,
    :id_operacao, :nome_operacao, :prescricao, :volume_total, :talhoes, :ativo
  );
END;
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/periodo/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/periodo/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~
BEGIN
  EKOS_MERGE_PERIODO(:id_business_unit, :init_date, :end_date);
END;
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/cliente/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/cliente/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~BEGIN EKOS_MERGE_CLIENTE(:id_client, :nome); END;~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/atividade/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/atividade/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~
BEGIN
  EKOS_MERGE_ATIVIDADE(:id_atividade, :id_business_unit, :numero, :nome, :ativo);
END;
~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/talhao/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/talhao/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~
BEGIN
  EKOS_MERGE_TALHAO(
    :id_field, :id_business_unit, :id_farm, :nome, :cor, :area_ha, :nome_fazenda, :ativo
  );
END;
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

  ORDS.DEFINE_TEMPLATE(p_module_name => 'ekos_dados', p_pattern => 'sync/monitoramento/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'ekos_dados', p_pattern => 'sync/monitoramento/', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source      => q'~
BEGIN
  EKOS_MERGE_MONITORAMENTO(
    :id_maquina, :id_business_unit, :nome, :latitude, :longitude,
    :status, :modelo, :alarme, :alerta_oper
  );
END;
~'
  );
END;
/

COMMIT;
