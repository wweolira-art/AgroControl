# Lançamento de mão de obra

A tela Mão de obra no menu grava em `CSINTEGRACAO.APONTAMENTO_APP` usando a conexão de gravação `CSCLIENTE`. Reutiliza o mapeamento da rotina já existente em `AgroControl-api-public/apontamento.ts`.

Campos do formulário: turma e data obrigatórias, fazenda, talhão, funcionário, serviço/item da tabela de preço, quantidade fixa em 1 e observação. A turma é selecionada em RH.AGENCIADOR e enviada em COD_AGENCIADOR; o servidor confere existência e grupo da fazenda. Não infere a turma de um apontamento anterior. Os cadastros locais fornecem fazendas, talhões e funcionários. Serviços vêm de RH.ITEMTABELAPRECO, com descrição em RH.TIPOSERVICO, na tabela mais recente válida para o grupo/empresa da fazenda e a data informada. Usa COD_ITEMTABELAPRECO em COD_ATIVIDADE, como a procedure de integração espera. O envio exige internet e uma sessão válida.

Rotas:

- `GET /api/apontamento/mao-de-obra/servicos?codFazenda=CODIGO&data=AAAA-MM-DD`
- `GET /api/apontamento/mao-de-obra/turmas`
- `POST /api/apontamento/mao-de-obra`

O servidor obtém o identificador em `CSCLIENTE.SEQ_APONTAMENTO_APP`, completa empresa/filial/zona com o contexto existente e busca a tabela de preço vigente da atividade. Usa binds e uma transação, com rollback se falhar. Não cria a tabela, sequences nem privilégios automaticamente.

A lista é recarregada ao mudar fazenda/data e limpa o serviço anterior. A tela mostra tabela de preço e valor unitário. O POST revalida o item usando a mesma consulta da lista; não recorre a uma tabela antiga se o item estiver ausente na mais recente. Em consulta real para uma fazenda do grupo/empresa 1/1 em 20/10/2026, retornaram 154 itens da tabela 15; o item 1 (ADUBAÇÃO MANUAL - PL) retornou 55,26231, conforme o cadastro no ERP.

O usuário de gravação precisa de INSERT na tabela de integração e acesso às consultas de contexto e preço já usadas pela rotina. As credenciais ficam no servidor. A tabela de destino e o usuário Oracle não são editáveis pelo app.

## Validação no ambiente

Após configurar o host próprio deste PC e corrigir o caminho do Oracle Instant Client, a conexão Thick com CSCLIENTE funcionou. Em 20/10/2026 foram confirmadas no catálogo as 27 colunas da tabela, a chave primária, a sequence CSCLIENTE.SEQ_APONTAMENTO_APP e os privilégios SELECT, INSERT e UPDATE de CSCLIENTE. O mapeamento do INSERT usa colunas existentes. A trigger TR_APONT_APPCS_BIUD registra alterações na tabela de log; não gera o identificador. Nenhum registro de teste foi criado. A gravação completa e as consultas de contexto/preço ainda precisam ser validadas no primeiro lançamento real.

O script `node scripts/inspect-apontamento-app.mjs CAMINHO_DO_ENV` permite consultar apenas as colunas da tabela com CSCLIENTE quando o Oracle estiver acessível. Não imprime credenciais nem lê lançamentos.

A cópia local de `AgroControl-api-public` recebeu o módulo e a importação atualizados, com backup do index. Uma cópia independente no outro PC precisa receber `mao-de-obra.ts` e o ajuste correspondente de importação no index, ou ser sincronizada com essa pasta. Reinicie a API nesse PC para carregar a alteração.

## Turmas armazenadas no aparelho

A tela Mão de Obra lê as turmas de `cadastros-apontamento.json` (localStorage no navegador), sem consultar a API de turmas ao abrir ou retornar à tela. A importação pela aba Cadastros inclui turmas quando o usuário tem acesso à Mão de Obra. Atualize a importação uma vez após instalar esta versão e sempre que precisar renovar as turmas. Se a importação das turmas falhar, o arquivo anterior é preservado. Limpar cadastros locais também remove as turmas. Serviços e preços por fazenda/data e o envio continuam online.

## Vários funcionários

Digite ou escolha o funcionário e toque em Adicionar funcionário. O formulário mantém uma lista sem códigos duplicados, com opção Remover. O envio utiliza os mesmos dados para todos e quantidade 1 para cada funcionário. Cada registro é enviado separadamente, em sequência, usando a API existente. Após cada confirmação, o funcionário sai da lista. Em falha, o lote para e mantém os demais; se faltar resposta, confira o funcionário indicado no ERP antes de repetir, pois o servidor pode ter gravado. O lote não é uma transação única.
