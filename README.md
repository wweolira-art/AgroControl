# Elejotaagro

Aplicativo de operações agrícolas com Expo, React Native e API Node.js: mapas de talhões, apontamentos, perdas de colheita, análise biométrica e integração Oracle/ORDS.

## Requisitos

- Node.js 24 LTS e npm.
- Expo Go compatível com o SDK 57 ou um build Android.
- Oracle/ORDS configurado para as operações de banco. Oracle Instant Client somente no servidor quando o banco exigir modo Thick.
- Conta Expo e EAS CLI para gerar APK. ngrok é opcional para desenvolvimento e acesso ao servidor local.

## Instalação

Na pasta que contém este README:

```powershell
npm ci
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
```

Preencha os arquivos locais com os endereços do seu ambiente. Valores `EXPO_PUBLIC_*` ficam visíveis no aplicativo compilado e devem conter apenas configuração pública. Senhas, tokens ORDS e credenciais EKOS pertencem somente ao servidor.

Configure a autenticação conforme [docs/autenticacao.md](docs/autenticacao.md), incluindo o perfil explícito do primeiro administrador e o privilégio ORDS do cadastro de usuários. A nova autenticação falha de forma fechada enquanto essa configuração não estiver concluída. Não basta iniciar o aplicativo para concluir a migração do banco.

## Executar

```powershell
npm run api:mock   # API local, porta 3001; usa Oracle/ORDS conforme server/.env
npm start          # em outro terminal: Expo Go na rede local
```

Apesar do nome histórico `api:mock`, a API pode consultar e gravar dados reais conforme sua configuração. Use um banco de desenvolvimento para testar operações de gravação.

`npm run dev` inicia API e Expo juntos. `npm run web` abre a versão web; o mapa web atual apresenta um painel de coordenadas, enquanto o Android usa o mapa em WebView. Configure a URL da API na rede acessível ao aparelho. O login aceita HTTP em rede local somente em desenvolvimento; use HTTPS em builds distribuídos.

Para executar somente a API em outro computador, copie a pasta `server`, execute `npm install` nela e configure seu `.env`. `npm run start` inicia a API; `npm run public` também inicia/reutiliza um túnel ngrok, se instalado e autenticado nesse computador.

## Verificar e gerar APK

```powershell
npm run typecheck
npm test
npx expo export --platform android --output-dir .expo/android-check
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

O perfil `preview` gera um APK para instalação interna. O projeto está vinculado a uma conta Expo existente em `app.json`; para uma cópia independente, configure seu próprio projeto EAS. Alterar `.env` depois de gerar o APK não muda as variáveis já incorporadas: gere outro build.

O GitHub Actions executa a checagem de tipos, testes de autenticação e mapas, e exportação Android. Os testes usam dados fictícios e não acessam Oracle, Expo ou EKOS.

## Organização

- `app/`: telas e navegação.
- `src/`: componentes, tipos, mapas, estado e serviços do aplicativo.
- `server/`: API, autenticação e acesso ao Oracle.
- `scripts/`: importações, diagnósticos e manutenção SQL; revise antes de executar em produção.
- `tests/`: testes automatizados de autenticação, autorização e cálculos espaciais.

## Publicação no GitHub

Os arquivos `.env`, dependências, certificados, APKs e saídas de build são ignorados pelo Git. Os exemplos usam valores fictícios. Confira `git status` e o diff antes de criar o commit.

Foram removidas credenciais fixas de scripts de diagnóstico. **Troque essas credenciais no serviço de origem antes de publicar.** Se estiverem em commits anteriores, removê-las dos arquivos atuais não as retira do histórico. Não publique o histórico sem revisá-lo.

O código e os mapas ainda contêm endereços e identificadores do ambiente existente. Para um repositório público, revise a autorização para divulgar esses dados, os arquivos de mapas e a marca. Um repositório privado é adequado para a revisão inicial. Consulte os limites de implantação em [docs/autenticacao.md](docs/autenticacao.md).

Nenhum repositório remoto é escolhido automaticamente. Depois de criar o destino na sua conta, configure-o com `git remote add origin URL_DO_REPOSITORIO`, revise o commit e faça o push para a branch desejada.
