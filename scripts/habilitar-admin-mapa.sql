-- Uma vez no Database Actions / SQL da Autonomous (schema ADMIN).
-- Libera importação, edição e exclusão de talhões pelo app (API mapa_talhao).
-- A coluna GEOMETRIA (SDO) não aceita GeoJSON direto no REST; o trigger converte.

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE MAPA_TALHAO ADD geojson CLOB';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

CREATE OR REPLACE TRIGGER TRG_MAPA_TALHAO_GEOJSON
BEFORE INSERT OR UPDATE ON MAPA_TALHAO
FOR EACH ROW
BEGIN
  IF :NEW.geojson IS NOT NULL THEN
    :NEW.geometria := SDO_UTIL.FROM_GEOJSON(:NEW.geojson, NULL, 4326);
  END IF;
  IF :NEW.geometria IS NULL THEN
    RAISE_APPLICATION_ERROR(-20001, 'Informe o GeoJSON do talhao (campo geojson).');
  END IF;
END;
/

BEGIN
  DELETE FROM USER_SDO_GEOM_METADATA
  WHERE TABLE_NAME = 'MAPA_TALHAO' AND COLUMN_NAME = 'GEOMETRIA';
  INSERT INTO USER_SDO_GEOM_METADATA (TABLE_NAME, COLUMN_NAME, DIMINFO, SRID)
  VALUES (
    'MAPA_TALHAO',
    'GEOMETRIA',
    SDO_DIM_ARRAY(
      SDO_DIM_ELEMENT('LONGITUDE', -180, 180, 0.0000001),
      SDO_DIM_ELEMENT('LATITUDE',  -90,  90,  0.0000001)
    ),
    4326
  );
END;
/

BEGIN
  ORDS.ENABLE_OBJECT(
    p_enabled      => TRUE,
    p_schema       => 'ADMIN',
    p_object       => 'MAPA_TALHAO',
    p_object_type  => 'TABLE',
    p_object_alias => 'mapa_talhao'
  );
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
/

COMMIT;
