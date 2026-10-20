-- geojson já é VARCHAR2. O POST ainda falha porque GEOMETRIA continua NOT NULL.
-- O ORDS não consegue gravar SDO_GEOMETRY; o trigger preenche depois do INSERT.
-- Rode como Run Script (F5).

BEGIN
  FOR c IN (
    SELECT uc.constraint_name
    FROM user_constraints uc
    JOIN user_cons_columns ucc
      ON uc.constraint_name = ucc.constraint_name
     AND uc.owner = ucc.owner
    WHERE uc.table_name = 'MAPA_TALHAO'
      AND ucc.column_name = 'GEOMETRIA'
      AND uc.constraint_type = 'C'
  ) LOOP
    EXECUTE IMMEDIATE 'ALTER TABLE MAPA_TALHAO DROP CONSTRAINT ' || c.constraint_name;
  END LOOP;
END;
/

ALTER TABLE MAPA_TALHAO MODIFY geometria NULL;

CREATE OR REPLACE TRIGGER TRG_MAPA_TALHAO_GEOJSON
BEFORE INSERT OR UPDATE ON MAPA_TALHAO
FOR EACH ROW
BEGIN
  IF :NEW.geojson IS NOT NULL THEN
    :NEW.geometria := SDO_UTIL.FROM_GEOJSON(:NEW.geojson, NULL, 4326);
  END IF;
  IF :NEW.GEOMETRIA IS NULL THEN
    RAISE_APPLICATION_ERROR(-20001, 'Informe o GeoJSON do talhao (campo geojson).');
  END IF;
END;
/

COMMIT;

SELECT column_name, nullable, data_type, data_length
FROM user_tab_columns
WHERE table_name = 'MAPA_TALHAO'
ORDER BY column_id;
