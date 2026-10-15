-- Rode no Database Actions (schema ADMIN) DEPOIS de habilitar-ekos-dados.sql.
-- Adiciona datas legíveis nos períodos e posição GPS/status das máquinas.
-- Depois: npm run sync:ekos

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE EKOS_TELEMETRIA_PERIODO ADD (data_inicio DATE, data_fim DATE)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE NOT IN (-1430, -904) THEN RAISE; END IF;
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

UPDATE EKOS_TELEMETRIA_PERIODO
   SET data_inicio = DATE '1970-01-01' + init_date,
       data_fim    = DATE '1970-01-01' + end_date
 WHERE data_inicio IS NULL OR data_fim IS NULL;
COMMIT;
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
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE NOT IN (-942, -6550) THEN RAISE; END IF;
END;
/

COMMIT;
