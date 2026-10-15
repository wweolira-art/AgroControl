-- Rode no ERP (SQL Developer / Database Actions) conectado como AGRICOLA ou DBA.
-- Sem isto o Elejotaagro não consegue gravar agricola.tmp_osmateriallote
-- (CSCLIENTE já tem INSERT nas demais tmp_os*).

GRANT SELECT, INSERT ON agricola.tmp_osmateriallote TO CSCLIENTE;
GRANT SELECT ON material.lote TO CSCLIENTE;
