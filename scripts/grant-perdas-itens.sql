-- Rode no schema AGRICOLA (ou DBA).
-- CSCLIENTE grava agricola.perdas, mas não enxerga agricola.perdas_itens.

GRANT SELECT, INSERT, UPDATE ON agricola.perdas_itens TO CSCLIENTE;
GRANT SELECT ON agricola.historico_tipoperda TO CSCLIENTE;
