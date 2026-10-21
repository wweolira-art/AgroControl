# Motivos de não atingimento do TCH

O usuário seleciona vários motivos no final do formulário, depois da variedade. A seleção é compartilhada por fazenda + talhão + data (DD/MM/AAAA), independentemente de ponto, item ou variedade. O mesmo código não aparece duas vezes; motivos já gravados aparecem como “Já informado”, e novos podem ser removidos antes do envio.

O catálogo continua em `motivostch_analisebiometrica` (`cod_motivo`, `descricao`). Os lançamentos de motivos são armazenados exclusivamente em `analisebiometrica_motivos`, com colunas `data`, `cod_fazenda`, `cod_talhao`, `cod_motivo`. A chave primária composta impede repetir o código no mesmo contexto, inclusive entre dispositivos.

## Ativação no Oracle

Execute `scripts/habilitar-biometria-multiplos-motivos.sql` no Database Actions / SQL do schema ADMIN da API biométrica. O script cria a tabela e publica `/ords/admin/analisebiometrica_motivos/` seguindo o acesso REST usado pelo aplicativo. Depois de atualizar o aplicativo instalado e pausar os lançamentos, execute `scripts/remover-coluna-motivotch-biometria.sql`: ele migra os motivos antigos, confere se todos foram preservados e remove `lancamento_analisebiometrica.cod_motivotch`. Se encontrar dados que não conseguiu migrar, bloqueia a remoção. O DROP COLUMN tem COMMIT implícito no Oracle. As medições continuam na tabela original. Recarregue o aplicativo após a alteração. Não basta reiniciar o servidor Node: a alteração é no Oracle remoto.

A leitura e o envio usam somente `analisebiometrica_motivos`; nenhuma medição envia ou lê `cod_motivotch`. Se a tabela ainda não foi ativada (404), permite ler o histórico antigo, mas bloqueia o envio com motivos antes de gravar medições, indicando o script necessário. Outros erros de leitura são exibidos. Os códigos escolhidos são validados no catálogo antes de qualquer gravação do lote.

Cada motivo é inserido uma vez por contexto, sem multiplicar medições. A chave do banco e a releitura após uma falha de POST tratam inclusão concorrente do mesmo código. Um motivo diferente pode ser acrescentado depois. Motivos registrados não são removidos ao excluir pontos, pois pertencem ao talhão/data; a interface permite remover apenas seleções ainda não enviadas.

Os motivos são gravados antes das medições. São chamadas REST independentes: se uma medição falhar, os motivos já confirmados continuam registrados. Uma nova tentativa não duplica esses motivos; medições não possuem idempotência ou transação do lote e precisam ser conferidas em caso de falha parcial. A aplicação não duplica as linhas deliberadamente para representar motivos.

Os testes usam ORDS simulada, sem inserts reais. A execução do SQL e a validação integrada no Oracle remoto continuam necessárias para ativar o recurso.

O APK compilado antes desta alteração ainda envia a coluna antiga, mesmo com valor nulo. Gere e instale um novo APK antes de removê-la no Oracle. Não execute a remoção enquanto versões antigas estiverem lançando dados.
