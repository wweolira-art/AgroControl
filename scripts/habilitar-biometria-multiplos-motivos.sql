-- Execute no Database Actions / SQL do schema ADMIN da API biométrica.
-- Cria e publica somente a tabela dos motivos por talhão/data.
-- Depois execute remover-coluna-motivotch-biometria.sql para migrar e remover a coluna antiga.
BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE admin.analisebiometrica_motivos (
      data VARCHAR2(10) NOT NULL,
      cod_fazenda NUMBER NOT NULL,
      cod_talhao NUMBER NOT NULL,
      cod_motivo NUMBER NOT NULL,
      CONSTRAINT pk_biometria_motivos PRIMARY KEY (data, cod_fazenda, cod_talhao, cod_motivo),
      CONSTRAINT ck_biometria_motivo CHECK (cod_motivo > 0 AND cod_motivo = TRUNC(cod_motivo)),
      CONSTRAINT ck_biometria_data CHECK (REGEXP_LIKE(data, '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'))
    )
  ]';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/


BEGIN
  ORDS.ENABLE_OBJECT(
    p_enabled => TRUE,
    p_schema => 'ADMIN',
    p_object => 'ANALISEBIOMETRICA_MOTIVOS',
    p_object_type => 'TABLE',
    p_object_alias => 'analisebiometrica_motivos',
    p_auto_rest_auth => FALSE
  );
END;
/
COMMIT;
