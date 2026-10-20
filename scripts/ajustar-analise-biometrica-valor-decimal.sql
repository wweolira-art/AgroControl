-- Rode no schema ADMIN da ORDS onde fica LANCAMENTO_ANALISEBIOMETRICA.
-- Garante que os valores biométricos aceitem casas decimais.

ALTER TABLE admin.lancamento_analisebiometrica
  MODIFY (valor NUMBER(18,6));
