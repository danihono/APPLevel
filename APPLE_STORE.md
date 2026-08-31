# Publicar o APPLevel na Apple App Store (sem ter um Mac)

Guia passo a passo. As mudanças de **código** já foram feitas (projeto iOS via Capacitor,
correção das Cloud Functions no app nativo, pipeline de build). Falta o que é
**manual / interativo**: conta Apple, chaves e a ficha da loja.

> Bundle ID: `com.leveljiujitsu.app` · Nome: `LEVEL JIUJITSU`
> Domínio: `https://applevel-c5e73.web.app`

## Como funciona sem Mac

O Xcode só roda em macOS, mas o Mac não precisa ser **seu**. O GitHub Actions liga um
Mac de verdade na nuvem, compila, assina e envia para a Apple — tudo pelo navegador.

```
git push / botão "Run workflow"
        ↓
  GitHub liga um Mac na nuvem
        ↓
  npm ci → npm run build → npx cap sync ios → xcodebuild → assina → envia
        ↓
  build aparece no TestFlight
        ↓
  Mac é destruído
```

Como o repositório é **público**, os minutos de macOS do GitHub são gratuitos e ilimitados.

---

## Passo 1 — Conta no Apple Developer Program

US$ 99/ano. Pelo **app "Apple Developer" no iPhone** é o caminho mais rápido: ele usa o
Face ID / documento do próprio aparelho para verificar sua identidade.

1. App Store → instale **Apple Developer**.
2. Aba **Account** → **Enroll**.
3. Tipo de entidade: **Individual / Sole Proprietor** (não precisa de D-U-N-S).
4. Pague e aguarde a aprovação — costuma sair em 24-48h, mas pode demorar mais.

> **Atenção:** em conta de pessoa física, o app aparece na loja com o **seu nome civil**,
> não com o nome da academia. Mudar isso depois exige uma conta de empresa (com CNPJ e
> número D-U-N-S) e a transferência do app.

Enquanto não aprova, você não consegue seguir para o Passo 2.

---

## Passo 2 — Anotar o Team ID

Acesse https://developer.apple.com/account → **Informações da assinatura**
(*Membership details*) → copie o **Team ID**, 10 caracteres.

Nesta conta ele é **`8CAAFT4F27`**, e já está fixo no workflow.

> **Antes de qualquer coisa:** se a página mostrar o aviso *"O contrato de licença do
> programa foi atualizado"*, clique em **Revisar contrato** e aceite. Enquanto ele
> estiver pendente, a Apple bloqueia Certificates/Identifiers/Profiles e a própria API
> do App Store Connect — e os builds falham com erros pouco claros.

---

## Passo 3 — Criar a App Store Connect API Key

É essa chave que substitui ter um Mac logado com sua senha e 2FA.

1. Acesse https://appstoreconnect.apple.com → **Users and Access** → aba **Integrations**
   → **App Store Connect API** → **Team Keys**.
2. Clique em **+** para gerar uma chave.
   - Nome: `github-actions`
   - Access (papel): **Admin** — precisa disso para criar certificados de distribuição.
3. Baixe o arquivo **`AuthKey_XXXXXXXXXX.p8`**.
   > O download só é permitido **uma vez**. Guarde o arquivo em local seguro.
4. Anote da tela:
   - **Key ID** (10 caracteres, está na linha da chave)
   - **Issuer ID** (um UUID longo, no topo da página)

Converta o `.p8` para base64 (PowerShell), que é o formato aceito nos secrets:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Downloads\AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
```

O valor já fica na área de transferência, pronto para colar.

---

## Passo 4 — Criar o repositório privado dos certificados

O `fastlane match` guarda o certificado e o provisioning profile **criptografados** num
repositório git separado, e reutiliza os mesmos em todo build. Isso evita estourar o
limite de certificados da Apple.

> Esse repositório precisa ser **PRIVADO**. Nunca use o `danihono/APPLevel`, que é público.

1. Crie no GitHub um repositório **privado** e **vazio**: `applevel-ios-certs`.
2. Gere um Personal Access Token para o CI acessá-lo:
   GitHub → Settings → Developer settings → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**
   - Repository access: apenas `applevel-ios-certs`
   - Permissions → Repository permissions → **Contents: Read and write**
3. Monte a credencial em base64 (troque o token):

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("danihono:github_pat_SEU_TOKEN_AQUI")) | Set-Clipboard
```

4. Invente uma senha forte para criptografar os certificados e **guarde**. Se perder,
   é só apagar o repositório de certificados e rodar o `bootstrap` de novo.

---

## Passo 5 — Cadastrar os secrets no GitHub

No repositório `danihono/APPLevel` → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**. Crie os 6:

> O Team ID (`8CAAFT4F27`) ja esta fixo no workflow — nao e segredo, vai embutido
> em todo app publicado.

| Secret | Valor | Veio do |
|---|---|---|
| `ASC_KEY_ID` | ex.: `9A8B7C6D5E` | Passo 3 |
| `ASC_ISSUER_ID` | o UUID longo | Passo 3 |
| `ASC_KEY_P8_BASE64` | o base64 do `.p8` | Passo 3 |
| `MATCH_GIT_URL` | `https://github.com/danihono/applevel-ios-certs.git` | Passo 4 |
| `MATCH_PASSWORD` | a senha que você inventou | Passo 4 |
| `MATCH_GIT_BASIC_AUTHORIZATION` | o base64 `usuario:token` | Passo 4 |

> A config do Firebase **não** precisa de secret: ela vem do `.env` versionado no
> repositório, do mesmo jeito que no `npm run deploy:hosting`.

---

## Passo 6 — Registrar o app na Apple (uma única vez, no site)

Estas duas coisas são criadas **manualmente**. O CI não faz por você: a ação
`produce` do fastlane ainda exige Apple ID + senha e não aceita a App Store
Connect API Key, o que não funciona num robô sem 2FA.

### 6.1 — Criar o App ID

https://developer.apple.com/account/resources/identifiers/add/bundleId

1. Selecione **App IDs** → **Continue**
2. Tipo **App** → **Continue**
3. Preencha:
   - **Description:** `LEVEL JIUJITSU` (só letras, números e espaço)
   - **Bundle ID:** marque **Explicit** e digite `com.leveljiujitsu.app`
4. Não marque nenhuma *Capability* — o app não usa nenhuma por enquanto
5. **Continue** → **Register**

### 6.2 — Criar o app na App Store Connect

https://appstoreconnect.apple.com/apps → botão **+** → **Novo app**

| Campo | Valor |
|---|---|
| Plataformas | **iOS** |
| Nome | `LEVEL JIUJITSU` |
| Idioma principal | Português (Brasil) |
| Bundle ID | escolha `com.leveljiujitsu.app` na lista |
| SKU | `leveljiujitsu-ios` |
| Acesso de usuário | Acesso total |

> Se o nome estiver em uso por outro app na App Store, a Apple recusa. Escolha
> outro (`LEVEL Jiu-Jitsu`, `LEVEL JJ`) — isso muda só o nome na loja; o Bundle
> ID e o nome embaixo do ícone no celular continuam os mesmos.

## Passo 6.3 — Rodar o bootstrap

Cria o certificado de distribuição e o provisioning profile, e guarda os dois
criptografados no repositório de certificados.

1. Repositório → aba **Actions** → workflow **iOS · TestFlight** → **Run workflow**.
2. Em "O que fazer", escolha **bootstrap**. Rode.

Ao final, o repositório `applevel-ios-certs` deve ter recebido arquivos.

> Se falhar com erro de permissão, quase sempre é a API Key sem papel **Admin**
> (Passo 3). Gere outra chave com o papel certo.

---

## Passo 7 — Primeira build no TestFlight

Mesmo workflow, agora com a opção **beta**. Ele compila e envia.

Depois de rodar (10-20 min), a Apple ainda processa a build por mais 10-30 min. Quando
o status sair de "Processing" na aba **TestFlight** do App Store Connect:

1. TestFlight → **Internal Testing** → crie um grupo e adicione seu próprio Apple ID.
   > Teste interno **não passa por revisão** da Apple — libera na hora.
2. No iPhone, instale o app **TestFlight** e aceite o convite que chegou por e-mail.
3. Instale e teste de verdade:
   - Login e cadastro de aluno
   - **Leitura do QR Code de presença** (permissão de câmera)
   - Upload de foto de perfil
   - Telas de aulas, ranking, financeiro
   - Exportar PDF / Excel

> O ponto mais crítico é o login funcionar. Se as chamadas de backend falharem, o
> sintoma é o app abrir e travar na tela de login sem mensagem clara.

---

## Passo 8 — Preencher a ficha da App Store

Em App Store Connect → seu app → **Distribution**.

**Screenshots** (obrigatório): a App Store Connect deste app pede **iPhone de 6,5"** —
`1242 × 2688` ou `1284 × 2778` px (ou os mesmos deitados). De 3 a 10 imagens; só as
3 primeiras aparecem na busca.

> Confira sempre o tamanho que a própria tela pede: a Apple muda essa exigência com o
> tempo e por app. O valor está escrito dentro da área de arrastar arquivos.

Tire os prints no seu próprio iPhone pelo TestFlight (Volume+ e botão lateral juntos).
Se o seu iPhone tiver outro tamanho de tela, redimensione: a proporção dos iPhones
recentes é praticamente idêntica, então um resize simples para `1242 × 2688` passa
sem distorção visível.

**Textos:**

| Campo | Conteúdo |
|---|---|
| Nome | `LEVEL JIUJITSU` |
| Subtítulo | até 30 caracteres |
| Descrição | o que o app faz: aulas, presença por QR, graduação, ranking, financeiro |
| Palavras-chave | separadas por vírgula, 100 caracteres no total |
| URL de suporte | obrigatório — uma página ou e-mail de contato |
| URL de privacidade | `https://applevel-c5e73.web.app/privacidade/` (a mesma do Android) |
| Categoria | Health & Fitness (ou Sports) |
| Classificação etária | responda o questionário |

**App Privacy** (aba separada, obrigatória): declare o que você coleta — e-mail, nome,
foto, dados de uso. É um questionário, não um upload.

**Conta de demonstração** (em "App Review Information"): a Apple **exige** um login de
teste, já que o app é todo protegido por autenticação. Crie um aluno de demonstração numa
academia de teste e informe e-mail e senha ali. Sem isso o app é rejeitado sem análise.

---

## Passo 9 — Enviar para revisão

Com a ficha preenchida e a build selecionada, rode o workflow com a opção **release** —
ou simplesmente clique em **Add for Review** / **Submit** no próprio site, que dá no mesmo.

A primeira revisão costuma levar de 24h a alguns dias.

---

## Manutenção depois de publicado

> **Diferença importante em relação ao Android.** No Android o app é um TWA: ele carrega
> `applevel-c5e73.web.app` ao vivo, então um `npm run deploy:hosting` atualiza o app
> sozinho. **No iOS não.** O código web fica embutido dentro do app, então:

| Mudou o quê? | O que fazer |
|---|---|
| Telas / lógica (web) | `npm run deploy:hosting` atualiza a web e o Android. Para o iOS, rode o workflow **beta** e envie uma versão nova para a loja. |
| Ícone, nome, permissões | Igual acima, e incremente a versão. |

Para publicar uma versão nova, rode o workflow **beta** informando o campo
**"Versao visivel na loja"** (ex.: `1.1.0`). O número de build interno é calculado
sozinho, a partir do que já existe na Apple.

Para testar localmente antes (precisa de Mac): `npm run ios:sync` e depois `npm run ios:open`.

---

## Armadilhas conhecidas

- **Guideline 4.2 (Minimum Functionality).** A Apple rejeita apps que são só um site
  embrulhado. O nosso mitiga isso porque o código fica embutido (abre offline) e usa a
  câmera nativa para o QR Code. Se ainda assim vier rejeição, o caminho é reforçar
  recursos nativos — notificações push nativas são o mais convincente.

- **Notificações push não funcionam no iOS hoje.** O app usa push da web (FCM +
  service worker), que a WKWebView do Capacitor não suporta. Para ter push no iPhone é
  preciso adicionar o plugin `@capacitor/push-notifications`, o SDK nativo do Firebase e
  uma APNs Key. Não é obrigatório para publicar, mas o recurso fica ausente no iOS.

- **O app depende de `cdn.tailwindcss.com`** para o estilo. Se o revisor abrir o app numa
  rede ruim, ele pode aparecer sem formatação. Compilar o Tailwind no build eliminaria
  esse risco.

- **Só iPhone.** O projeto está com `TARGETED_DEVICE_FAMILY = "1"`. Para suportar iPad,
  volte para `"1,2"` em `ios/App/App.xcodeproj/project.pbxproj` — mas aí a Apple revisa
  no iPad e você precisa de um segundo jogo de screenshots.

- **O `.p8`, a `MATCH_PASSWORD` e o repositório de certificados** são o que te permite
  atualizar o app. Perdeu tudo? Dá para recriar, mas é chato. Guarde.
