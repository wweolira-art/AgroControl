-- Rode no ERP como AGRICOLA ou DBA.
-- CONSULTA le os dados; CSCLIENTE grava os apontamentos de irrigacao.

GRANT SELECT ON agricola.tmp_irrigacaoapontitem TO CONSULTA;
GRANT SELECT ON agricola.tmp_irrigacaoapontinsumo TO CONSULTA;
GRANT SELECT ON agricola.tmp_irrig_fazenda TO CONSULTA;

GRANT SELECT, INSERT, UPDATE ON agricola.tmp_irrigacaoapontitem TO CSCLIENTE;
GRANT SELECT, INSERT, UPDATE ON agricola.tmp_irrigacaoapontinsumo TO CSCLIENTE;
GRANT SELECT, INSERT, UPDATE ON agricola.tmp_irrig_fazenda TO CSCLIENTE;
