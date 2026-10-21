# Liberação de abas por e-mail

O app lê as próprias liberações diretamente em `https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/app_acesso_aba/`, filtrando pelo e-mail da sessão. Essa leitura não usa o ngrok nem envia o token da sessão ao Oracle. A administração e a proteção das operações continuam no servidor, que usa ORDS_ACESSO_ABA_URL (por padrão, o mesmo endpoint). Cada linha tem somente email e aba; uma linha significa liberação. E-mails são salvos em minúsculas e sem espaços. Cadastros e Apontamentos salvos são abas obrigatórias para todo usuário autenticado, mesmo sem linhas na tabela. Somente as demais abas dependem de liberação.

Em Administração → Acesso por e-mail, informe o e-mail cadastrado, consulte, marque as abas e salve. Cadastros e Apontamentos salvos aparecem marcados e não podem ser desmarcados; a API mantém ambas as liberações no salvamento. A consulta de importação exige sessão mas não depende de consultar a tabela de permissões. Também é possível selecionar um e-mail com liberações existentes. A configuração vale em qualquer aparelho em que a conta entrar. Não concede perfil administrativo: essas telas ainda exigem perfil admin na sessão. A própria configuração permanece sempre disponível para administradores.

Os identificadores válidos são mapa, cadastros, insumos, mao-de-obra, salvos, perdas, biometria, talhoes-admin, usuarios e conexao. O servidor valida esses identificadores e usa o e-mail autenticado, nunca um e-mail informado pelo operador, nas consultas de acesso próprio.

Rotas da API do app:

- GET /api/acesso/abas: rota de liberações da sessão mantida no servidor, mas não usada pelo leitor de abas do app.
- GET /api/acessos/abas: lista de liberações, somente administrador.
- GET /api/acessos/abas/EMAIL: consulta administrativa.
- PUT /api/acessos/abas/EMAIL: corpo com abas, somente administrador.

As leituras percorrem todas as páginas da ORDS. O salvamento remove somente as linhas revogadas desse e-mail e inclui somente as novas. Confirma o resultado por leitura. São chamadas REST individuais, não uma transação única; em falha parcial a tela recarrega o estado efetivamente salvo. Chamadas de atualização do mesmo e-mail são serializadas na instância da API. Múltiplas instâncias exigem controle transacional no banco para evitar concorrência.

O menu e as rotas do app respeitam as liberações. As rotas operacionais mapeadas da API também consultam a tabela. As integrações ORDS diretas existentes continuam dependendo dos privilégios próprios do serviço/banco.

As permissões são atualizadas no login, ao voltar ao primeiro plano e a cada 30 segundos enquanto o app está ativo. Essas atualizações consultam diretamente o Oracle. O cache offline é separado por e-mail e URL da coleção ORDS; dados de outro usuário ou do antigo modelo por dispositivo não são reutilizados. Uma revogação reflete no aparelho quando ele voltar a consultar a API; nas chamadas protegidas a API verifica o estado atual.

O antigo arquivo dispositivos.json não é mais consultado. As liberações antigas por aparelho não são migradas automaticamente, pois não possuem e-mail. Nenhum usuário real foi liberado automaticamente durante a integração.

## Configuração e segurança da ORDS

A leitura direta usa a constante URL_ACESSO_ABAS em src/services/acesso-abas-ords.ts. Se mudar a coleção, atualize também essa constante e gere outro APK. Configure ORDS_ACESSO_ABA_URL no .env da API para as operações do servidor. ORDS_ACESSO_ABA_TOKEN é opcional no código e fica apenas no servidor quando usado.

No teste real, o endpoint aceitou POST e DELETE sem autenticação. É necessário restringir a escrita da ORDS à credencial da API para garantir que apenas o administrador possa alterar permissões também fora do app; a validação de perfil na API do app não protege um endpoint ORDS público contra chamadas diretas. Nenhuma alteração de privilégios ORDS foi feita automaticamente.

O teste scripts/test-acesso-aba.mjs cria um e-mail técnico aleatório em example.invalid, confirma inclusão/leitura/revogação e remove suas linhas ao terminar. Não altera usuários reais. Não executa testes no cadastro operacional ou na folha.
