-- Execute no schema ADMIN, após habilitar-biometria-multiplos-motivos.sql.
-- Use o aplicativo atualizado antes de executar: APKs anteriores ainda enviam a coluna.
-- Pausar lançamentos durante esta migração evita escritas na coluna antiga.
-- DDL do Oracle faz COMMIT implícito; a remoção da coluna não tem ROLLBACK.
DECLARE
  l_coluna NUMBER;
  l_pendentes NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_coluna FROM all_tab_columns
  WHERE owner = 'ADMIN' AND table_name = 'LANCAMENTO_ANALISEBIOMETRICA'
    AND column_name = 'COD_MOTIVOTCH';
  IF l_coluna = 0 THEN RETURN; END IF;

  -- Impede que novos apontamentos sejam inseridos entre a migração e a conferência.
  EXECUTE IMMEDIATE 'LOCK TABLE admin.lancamento_analisebiometrica IN EXCLUSIVE MODE';
  EXECUTE IMMEDIATE q'[
    MERGE INTO admin.analisebiometrica_motivos t
    USING (
      SELECT DISTINCT TRIM(data) AS data, cod_fazenda, cod_talhao, cod_motivotch AS cod_motivo
      FROM admin.lancamento_analisebiometrica
      WHERE cod_motivotch > 0 AND cod_motivotch = TRUNC(cod_motivotch)
        AND cod_fazenda IS NOT NULL AND cod_talhao IS NOT NULL
        AND REGEXP_LIKE(TRIM(data), '^[0-9]{2}/[0-9]{2}/[0-9]{4}$')
    ) s
    ON (t.data = s.data AND t.cod_fazenda = s.cod_fazenda
      AND t.cod_talhao = s.cod_talhao AND t.cod_motivo = s.cod_motivo)
    WHEN NOT MATCHED THEN INSERT (data, cod_fazenda, cod_talhao, cod_motivo)
    VALUES (s.data, s.cod_fazenda, s.cod_talhao, s.cod_motivo)
  ]';
  EXECUTE IMMEDIATE q'[
    SELECT COUNT(*) FROM admin.lancamento_analisebiometrica l
    WHERE l.cod_motivotch IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM admin.analisebiometrica_motivos m
      WHERE m.data = TRIM(l.data) AND m.cod_fazenda = l.cod_fazenda
        AND m.cod_talhao = l.cod_talhao AND m.cod_motivo = l.cod_motivotch
    )
  ]' INTO l_pendentes;
  IF l_pendentes > 0 THEN
    RAISE_APPLICATION_ERROR(-20001, 'Há motivos antigos não migrados. Corrija os registros antes de remover a coluna.');
  END IF;
  EXECUTE IMMEDIATE 'ALTER TABLE admin.lancamento_analisebiometrica DROP COLUMN cod_motivotch';
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
