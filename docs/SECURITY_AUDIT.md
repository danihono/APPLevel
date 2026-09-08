# Auditoria de Segurança — APPLevel

**Data:** 2026-09-08 · **Escopo:** app web (`applevel-c5e73.web.app`), TWA Android
(`com.leveljiujitsu.app`), app iOS (Capacitor), Cloud Functions, Firestore, Storage e
configuração de infraestrutura do projeto `applevel-c5e73`.

**Autorização:** produção em **somente leitura**. Nenhuma escrita, exclusão ou alteração
de dados reais foi executada. Nenhum deploy foi feito — as correções estão na branch
`claude/security-audit-app-werafq` e só passam a valer após `firebase deploy`.

---

## Como ler este relatório

Cada achado é marcado com o **nível de evidência**, que é a distinção mais importante
aqui:

| Marca | Significado |
|---|---|
| ✅ **Testado** | Requisição real executada contra a infraestrutura, com a resposta registrada. |
| 🧪 **Provado em emulador** | Teste automatizado que **falha nas regras antigas e passa nas novas**. |
| 📖 **Revisado em código** | Confirmado na fonte, com `arquivo:linha`. Não executado contra o sistema. |
| ⏳ **Pendente** | Precisa de credenciais, de acesso de rede ou de aprovação para ser validado. |

---

## Resumo executivo

Foram encontrados **12 achados**: 3 críticos, 5 altos, 3 médios e 1 baixo. Os três
críticos são exploráveis por um usuário comum já autenticado, sem ferramenta especial.

**O mais grave é fraude de presença (V1).** O token do QR Code da aula era gravado em
texto puro no documento da aula, que as regras liberam para qualquer aluno da academia.
Um aluno lia o token pelo SDK e registrava presença sem estar no tatame — e presença
alimenta progressão de faixa e ranking. Ou seja: a integridade da graduação, que é o
produto, estava comprometida.

**Vale registrar o que está certo.** O núcleo de autorização do backend é sólido:
`getRequestContext` é um ponto único de checagem que deriva `role` e `academyId` do
Firestore, **nunca do payload da requisição**. Testei as 9 coleções principais sem token
e todas negaram. As 84 Cloud Functions foram auditadas uma a uma e **não existe** a falha
clássica de trocar o `academyId` na requisição para acessar outro tenant. Os problemas
estão nas bordas, não na arquitetura.

### Ordem recomendada de correção

| # | Ação | Por quê |
|---|---|---|
| 1 | Deploy das regras e das functions corrigidas | Fecha V1, V2, V3, V4, V5, V6, V7, V10 |
| 2 | `node scripts/purgeLegacySecrets.cjs --apply` | **Sem isso, V1 e V2 continuam abertos nos dados antigos** |
| 3 | Rotacionar as senhas expostas (V2) | Apagar o campo não invalida o que já vazou |
| 4 | Restringir a chave de API no Google Cloud (V12) | Console, 5 minutos, sem deploy |
| 5 | Planejar App Check (V7) | Exige coordenação; ver o roteiro no final |

---

## Achados

### V1 — Fraude de presença: token do QR legível por qualquer aluno
**Severidade: CRÍTICA** · 📖 Revisado em código + 🧪 Provado em emulador

O token do QR era gravado em texto puro no documento da aula:

- `functions/src/modules/classes.ts:316,390,593,644` — gravava `activeQrToken`
- `firestore.rules:115` — `allow read: if sameAcademy(resource.data.academyId)`
- `functions/src/modules/attendance.ts:239` — valida só o hash do token recebido

**Impacto.** Qualquer aluno da academia lia `activeQrToken` direto do Firestore e chamava
`registerAttendance` de casa. Presença falsa alimenta progressão de faixa, ranking e as
métricas de participação — quebra a integridade do produto e a confiança nas graduações.

**Correção aplicada.** O token passou para a subcoleção privada
`classes/{classId}/qr_private/current`, negada a **todos** os clientes em
`firestore.rules`; só o Admin SDK das Cloud Functions lê e escreve. O documento público da
aula mantém apenas `activeQrHash`. Removido o campo de `ClassDoc`
(`functions/src/domain/models.ts`) e o fallback em `views/CalendarView.tsx:1266`, que agora
depende só da resposta do callable `generateClassQrCode`. Adicionado teto de 240 min em
`qrDurationMinutes` (antes um professor podia emitir um QR praticamente eterno).

> **Limitação honesta.** Regras do Firestore não escondem um *campo* de quem pode ler o
> documento: `allow read` é tudo-ou-nada. A correção é de **modelo de dados**, não de
> regras — a subcoleção privada é defesa em profundidade. Por isso **toda aula criada
> antes desta correção continua expondo o token** até a purga de dados (passo 2 acima).
> O teste `tests/rules/firestore.rules.test.ts` documenta essa limitação explicitamente.

**Como validar.** `npm run test:rules` e, em produção após o deploy: iniciar uma aula, ler
o documento em `classes/{id}` como aluno e confirmar que não há `activeQrToken`; conferir
que o check-in por QR continua funcionando ponta a ponta.

---

### V2 — Senhas em texto puro no banco, exibidas na interface
**Severidade: CRÍTICA** · 📖 Revisado em código

`users.plainPassword` guardava a senha do usuário em texto puro:

- `functions/src/modules/auth.ts:840,894` (criação) e `:1832,1861` (edição)
- `firestore.rules:79` — `allow read` para `isAcademyStaff(...)`
- `components/InstructorEditModal.tsx:265-280` — campo **"Senha atual (visível)"** com
  botão de mostrar/ocultar
- `views/ManagementView.tsx:472` — o front enviava a senha para ser armazenada

**Impacto.** Todo professor da academia lia a senha de login em texto puro dos instrutores
daquela unidade; todo superadmin lia de toda a rede — e `subscribeToAllUsers`
(`services/firebase/data.ts:226`) carregava a coleção inteira no navegador. Como senhas são
reutilizadas entre serviços, o vazamento não se limita ao APPLevel. Violação direta de LGPD
e de qualquer baseline de proteção de credenciais.

**Correção aplicada.** `plainPassword` eliminado do backend, dos tipos
(`functions/src/domain/models.ts`, `services/firebase/models.ts`,
`services/firebase/functions.ts`) e da interface. A tela de edição agora explica que senhas
não podem ser exibidas e oferece apenas a redefinição. Cada edição de instrutor aplica
`FieldValue.delete()` no campo legado. O campo entrou na blocklist das regras, para não
poder voltar por escrita direta.

**Como validar.** `grep -rn "plainPassword" functions/src services views components` deve
retornar só os comentários de segurança. Depois do deploy: editar um instrutor e conferir
que o documento não tem mais o campo. **Rodar a purga e rotacionar as senhas afetadas.**

---

### V3 — Suspensão de aluno não bloqueava nada no servidor
**Severidade: CRÍTICA** · 📖 Revisado em código

`deactivateStudent` (`functions/src/modules/auth.ts:1650`) apenas gravava
`status: 'suspended'` no Firestore. `getRequestContext`
(`functions/src/lib/context.ts:41-67`) **nunca checava `status`**, e não havia revogação de
token. A única verificação existia em `validateSessionAccess` — uma chamada iniciada pelo
próprio cliente.

**Impacto.** Um aluno suspenso (inadimplente, desligado, expulso) com um ID token válido
continuava chamando qualquer callable: registrar presença, enviar vídeos, fazer quiz,
confirmar RSVP. Bastava não chamar a validação de sessão — ou seja, a suspensão era
puramente cosmética e contornável com um cliente modificado.

**Correção aplicada.** `getRequestContext` passou a recusar usuário suspenso, com uma
allowlist explícita (`allowSuspended`) para os três fluxos que o próprio suspenso precisa:
`validateSessionAccess`, `requestReactivation` e `deleteMyAccount`. `deactivateStudent`
agora chama `auth.revokeRefreshTokens` para derrubar as sessões já abertas.

> **Decisão de projeto.** Deliberadamente **não** usamos `disabled: true` no Firebase Auth.
> Isso impediria o aluno suspenso de fazer login para pedir reativação e quebraria o fluxo
> do produto. O bloqueio efetivo é a checagem de `status` no servidor.

**Como validar.** No emulador: suspender um aluno e confirmar que uma callable qualquer
retorna `permission-denied`, enquanto `requestReactivation` continua funcionando.

---

### V4 — Blocklist de `users` incompleta
**Severidade: ALTA** · 🧪 Provado em emulador

A regra de update de `users` (`firestore.rules:91-102`) bloqueava 28 campos de progressão
e identidade, mas deixava passar `status`, `email`, `cpf`, `plainPassword` e `fcmTokens`.
O cliente escreve direto nessa coleção (`services/firebase/mutations.ts:61`).

**Impacto.** Um professor reativava um aluno suspenso pelo SDK, sem passar por
`reactivateStudent` nem pelo fluxo de solicitação de reativação; injetava `fcmTokens`
arbitrários em qualquer usuário da academia (sequestro de push, já que
`sendSegmentedNotification` dispara para esses tokens); e alterava `email`/`cpf`,
dessincronizando o Firestore do Firebase Auth.

**Correção aplicada.** Os cinco campos entraram na blocklist. Verificado que não há
sobreposição com os campos legítimos que `updateUserProfile` escreve.

**Como validar.** `npm run test:rules` — 6 testes cobrem exatamente isso, incluindo um
que confirma que a edição legítima de perfil **continua funcionando**.

---

### V5 — `academies` sem restrição de campo; professor podia apagar a academia
**Severidade: ALTA** · 🧪 Provado em emulador

`firestore.rules:107-112` permitia `update` e `delete` para `isAdmin() && sameAcademy(...)`
**sem nenhuma restrição de campo** — e `isAdmin()` inclui `professor`.

**Impacto.** Um professor gravava `progressionRules` direto pelo SDK, burlando a callable
`upsertAcademyProgressionRules` e **rebaixando sozinho os limites de graduação da própria
academia** (ex.: exigir 1 aula por grau em vez de 40). Também podia **deletar o documento
da própria academia**.

**Correção aplicada.** Blocklist de `progressionRules`, `slug`, `ownerUserId`, `academyId`
e `createdAt` no update; `delete` restrito a superadmin. Os campos que
`updateAcademySettings` escreve legitimamente continuam liberados.

**Como validar.** `npm run test:rules`.

---

### V6 — Storage sem limite de tamanho ou tipo de arquivo
**Severidade: ALTA** · ✅ Testado (leitura) + 🧪 Provado em emulador

`storage.rules` **não tinha nenhuma checagem** de `request.resource.size` nem de
`contentType` no arquivo inteiro. `users/{userId}/**` é gravável pelo próprio usuário e
**legível por todos os autenticados de todos os tenants**.

**Impacto.** Qualquer aluno subia arquivos de tamanho e tipo arbitrários: DoS de custo de
armazenamento (Storage é cobrado por GB) e hospedagem de conteúdo arbitrário em um domínio
confiável, visível para toda a base.

**Correção aplicada.** Limites por caminho: foto de perfil só imagem até 5 MB; vídeo de
luta só `video/*` até 500 MB; assets de academia só imagem/vídeo/PDF até 200 MB.
`sameAcademy()` alinhado com a guarda `academyId() != ''` do Firestore. `site/faixas`
deixou de depender de um e-mail fixo não verificado e passou a exigir papel de superadmin.

> **Bug adicional encontrado pelos testes.** A exclusão da árvore de learning usava
> `allPaths.matches(...)`, mas `allPaths` é um `Path` e não tem `matches` — a regra lançava
> `EvaluationException` e **negava todo upload de staff em `academies/**`**. Falhava fechado,
> então provavelmente nunca foi notado. Corrigido usando `request.resource.name`.

**Evidência de teste ativo.** `site/faixas/` responde **HTTP 200 a listagem anônima** de
nomes de arquivo (confirma `allow read: if true`, que é intencional); `users/` e
`academies/` respondem **403** sem token, como esperado.

**Como validar.** `npm run test:rules:storage` — 11 testes, incluindo tentativas de subir
6 MB, `text/html` e `application/javascript`.

---

### V7 — Cadastro público sem limite e oráculo de enumeração de CPF
**Severidade: ALTA** · 📖 Revisado em código

`submitStudentSignup` (`functions/src/modules/auth.ts:623`) é público e cria uma conta real
no Firebase Auth, N documentos de solicitação e dispara push para todos os aprovadores.
Não havia **App Check, captcha nem rate limit em nenhuma function do projeto**.

Pior: `ensureUniqueIdentity` (`:322-341`) devolvia mensagens **distintas** para e-mail e
para CPF já cadastrados.

**Impacto.** Um atacante não autenticado confirmava se um e-mail ou um **CPF** — dado
pessoal regulado pela LGPD — já existia na base, uma consulta por vez, sem limite. E o
endpoint servia como torneira aberta de spam: criação automatizada de contas, com custo de
Auth, Firestore e FCM, além de poluir a fila de aprovação dos professores.

**Correção aplicada.** Mensagem única e genérica para chamador anônimo (as mensagens
específicas continuam nos fluxos autenticados, onde são úteis e o chamador é conhecido).
Novo `functions/src/lib/rateLimit.ts` — janela fixa persistida no Firestore, coleção
`rate_limits` negada a todos os clientes — com quatro baldes no cadastro: por IP (5/h),
global (200/h), por e-mail (3/h) e por CPF (3/h). O `callableProxy` passou a encaminhar o
IP observado, que antes era descartado e cegava qualquer heurística por origem.

> **Limitação honesta.** Como todas as functions estão com `invoker: 'public'`, quem chamar
> a callable diretamente ainda pode forjar o cabeçalho de IP. **Por isso** existem os baldes
> por e-mail e por CPF, que dependem do dado submetido e não são falsificáveis — são eles
> que efetivamente limitam a enumeração. A defesa completa exige App Check (ver o roteiro).

**Como validar.** No emulador, chamar `submitStudentSignup` 4× com o mesmo CPF e confirmar
`resource-exhausted` na 4ª; confirmar que e-mail e CPF já existentes retornam a **mesma**
mensagem.

---

### V8 — Chave do Gemini seria embutida no bundle público
**Severidade: MÉDIA** · 📖 Revisado em código

`vite.config.ts:25-28` injetava `GEMINI_API_KEY` — **sem** o prefixo `VITE_` — em
`process.env.API_KEY` e `process.env.GEMINI_API_KEY`. Como `loadEnv(mode, '.', '')` carrega
*todas* as variáveis, uma chave que qualquer desenvolvedor assumiria ser de servidor seria
substituída literalmente no bundle. Nenhum código lia esses identificadores: era só uma
armadilha esperando alguém preencher a variável.

Agrava: o `.env` da raiz **é versionado** e não estava no `.gitignore`. Hoje
`VITE_GEMINI_API_KEY` e `VITE_FIREBASE_VAPID_KEY` estão vazias — o risco é o padrão.

**Impacto.** Uma chave do Gemini no bundle é extraível por qualquer visitante do site e por
qualquer pessoa que baixe o app das lojas, com custo faturado direto na conta do projeto.

**Correção aplicada.** Bloco `define` removido. Aviso explícito no `.gitignore` explicando
por que o `.env` continua versionado (o build iOS depende dele, conforme
`.github/workflows/ios-testflight.yml`) e que **nenhum segredo real** pode ir ali.
Chamadas ao Gemini devem passar por uma Cloud Function.

**Como validar.** Após `npm run build`, `grep -r "API_KEY" dist/assets/` não deve encontrar
valor algum.

---

### V9 — Sem cabeçalhos de segurança no hosting
**Severidade: MÉDIA** · ⏳ Pendente de validação em produção

`firebase.json` não tinha bloco `headers`: nenhum CSP, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy` ou `Permissions-Policy`. Como a versão Android é uma
TWA (WebView de confiança total sobre o site), toda fraqueza web vale igual dentro do app
publicado.

**Correção aplicada.** Bloco `headers` com `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restritiva e HSTS.

> **Não corrigido de propósito: CSP.** `index.html:52` carrega
> `https://cdn.tailwindcss.com` sem SRI — um script de terceiros, não fixado em versão, com
> acesso total ao DOM, executando no site, na WebView iOS e na TWA Android. É a maior
> exposição de cadeia de suprimentos do frontend. Adicionar CSP **sem** antes auto-hospedar
> o Tailwind quebraria o layout inteiro. Recomendação: migrar o Tailwind para build local e
> só então aplicar CSP.

**Como validar.** Após o deploy: `curl -I https://applevel-c5e73.web.app/` e conferir os
cabeçalhos. *Não pude testar nesta sessão — a política de egress bloqueou o domínio.*

---

### V10 — `markNotificationRead` sem checagem de tenant
**Severidade: MÉDIA** · 📖 Revisado em código

`functions/src/modules/notifications.ts:416-428` checava papel e destinatário, mas **não**
`academyId` — ao contrário do helper irmão `canDeleteNotification`, logo acima, que checa.

**Impacto.** Um professor de qualquer academia marcava como lida qualquer notificação da
base inteira. Só integridade (os IDs são aleatórios e nada é devolvido), mas é uma quebra
do isolamento multi-tenant e uma inconsistência com o padrão do próprio módulo.

**Correção aplicada.** Checagem de `academyId` adicionada, preservando o acesso global do
superadmin.

---

### V11 — Achados menores corrigidos
**Severidade: BAIXA** · 📖 Revisado em código

| Item | Correção |
|---|---|
| `missions.ts:91` e `ranking.ts:31` passavam `actor.academyId` em vez do alvo — errado quando um superadmin opera sobre usuário de outra unidade | Usa `targetUser.academyId` |
| `syncOwnUserEmail` (`auth.ts:1182`) gravava qualquer e-mail do payload sem sincronizar com o Auth — permitia registrar o e-mail de terceiro e envenenar as checagens de unicidade | Exige que o e-mail já esteja no Firebase Auth |
| Cache de fotos de perfil sobrevivia ao `logout()` em dispositivo compartilhado | `clearAvatarCache()` no logout |
| `user.academyId.trim()` lançava `TypeError` → HTTP 500 se o campo faltasse | Checagem segura de tipo |

---

### V12 — Chave de API do Firebase sem restrição de aplicativo
**Severidade: MÉDIA** · ✅ **Testado**

```
GET https://identitytoolkit.googleapis.com/v1/projects?key=<VITE_FIREBASE_API_KEY>
```
Executado **de um servidor, sem cabeçalho `Referer`**, fora dos domínios autorizados:

```
HTTP 200
{"projectId":"649939154549","authorizedDomains":["localhost",
 "applevel-c5e73.firebaseapp.com","applevel-c5e73.web.app"]}
```

**Impacto.** A chave web do Firebase é pública por definição e não é um segredo — mas
deveria ter restrição de referrer/API no Google Cloud. Sem ela, qualquer um usa a chave de
qualquer origem para consumir a cota do Identity Toolkit do projeto (tentativas de
`signInWithPassword`, `signUp`). Combinado com a ausência de App Check e de rate limit no
Auth, é a superfície de abuso mais acessível do sistema. `authorizedDomains` limita apenas
redirecionamento de OAuth — não protege login por senha.

**Correção: manual, no console.** Google Cloud Console → APIs & Services → Credentials →
a chave do navegador → *Application restrictions* → **HTTP referrers**, com
`applevel-c5e73.web.app/*` e `applevel-c5e73.firebaseapp.com/*`; e *API restrictions*
limitando às APIs realmente usadas. **Atenção:** restrição por referrer não se aplica aos
apps nativos (iOS/Android), que usam a mesma chave sem `Referer` — valide o app das lojas
depois de aplicar.

---

## O que foi testado, e o que não foi

### ✅ Executado contra a infraestrutura real (somente leitura)

| Teste | Resultado |
|---|---|
| Firestore REST sem token em `academies`, `users`, `classes`, `attendances`, `finance_sales`, `finance_payments`, `graduations`, `notifications`, `learning_tracks` | **403 PERMISSION_DENIED nas 9** — o deny anônimo funciona |
| Storage anônimo: `users/`, `academies/`, listagem do bucket | **403** |
| Storage anônimo: `site/faixas/` | **200 com listagem de nomes** (leitura pública intencional) |
| Chave de API via `identitytoolkit`, sem `Referer` | **200** → V12 |

### 🧪 Provado em emulador

28 testes de regras. A prova não é que passam — é que **falham nas regras antigas**:

| Suíte | Regras antigas | Regras corrigidas |
|---|---|---|
| `tests/rules/firestore.rules.test.ts` | 7 falhas | **17/17 passam** |
| `tests/rules/storage.rules.test.ts` | 4 falhas | **11/11 passam** |
| `tests/*.test.ts` (existentes) | — | 9/9 passam, sem regressão |

### ⏳ Não testado — e por quê

| Item | Motivo |
|---|---|
| Cabeçalhos HTTP, bundle publicado, `callableProxy` sem token, `getPublicSignupAcademies` | A política de egress desta sessão bloqueia `web.app` e `cloudfunctions.net` (`CONNECT 403`) |
| Escalada de privilégio e vazamento entre tenants com login real | As credenciais de teste (`student`, `admin/professor`) não foram fornecidas |
| `submitStudentSignup` sem captcha | **Recusado deliberadamente**: criaria conta real em produção |
| Brute force de login | **Recusado deliberadamente**: seria abuso do serviço em produção |
| Upload de arquivo grande (V6) | **Recusado deliberadamente**: consumiria armazenamento real. Coberto por emulador |
| App Check | Não habilitado — exige coordenação de deploy (ver abaixo) |

---

## Riscos do deploy

**As regras do Firestore e do Storage valem no instante do `firebase deploy`.** Uma regra
errada tira o sistema do ar. Recomendo `npm run test:rules && npm run test:rules:storage`
antes, e deploy de regras separado do de functions, para isolar a causa se algo quebrar.

Duas decisões foram tomadas **para não quebrar produção**, e ficam registradas:

1. **Não desabilitamos a conta no Auth ao suspender** (V3) — impediria o aluno de logar
   para pedir reativação.
2. **Não fechamos a leitura de `academies`** — alunos assinam a coleção inteira
   (`App.tsx:934,950`) para o seletor de academias. Fechar quebraria o recurso. Qualquer
   usuário autenticado ainda enumera nome, fuso e limites de todas as unidades da rede.
   **Correção adequada, como trabalho futuro:** migrar o seletor para a callable
   `listSignupAcademies`, que já devolve apenas `academyId`/`name`/`timezone` das ativas, e
   então restringir a regra para `sameAcademy(academyDocId)`. Está anotado no próprio
   `firestore.rules`.

---

## Checklist pós-deploy

- [ ] Deploy das regras e das functions
- [ ] `node scripts/purgeLegacySecrets.cjs` (dry-run) e depois `--apply`
- [ ] **Rotacionar a senha de todas as contas que tinham `plainPassword`** — apagar o campo
      não invalida o que já foi exposto
- [ ] Restringir a chave de API no Google Cloud (V12) e revalidar o app das lojas
- [ ] Conferir os cabeçalhos com `curl -I https://applevel-c5e73.web.app/`
- [ ] Validar o fluxo do QR ponta a ponta e a suspensão/reativação de um aluno

---

## Trabalho futuro recomendado

**App Check** é a defesa que falta contra bots e clientes modificados, e a única que
resolve V7 de forma completa. **Não foi habilitado nesta auditoria de propósito:** ligar App
Check às cegas derruba todos os clientes em produção. O caminho seguro:

1. Registrar reCAPTCHA Enterprise (web), DeviceCheck/App Attest (iOS) e Play Integrity
   (Android/TWA).
2. Inicializar no cliente (`services/firebase/client.ts`) — hoje não há nenhuma inicialização.
3. Rodar semanas em **modo monitoramento**, acompanhando a taxa de requisições verificadas.
4. Só então exigir (`enforceAppCheck: true`) nas callables, começando pelas públicas.

Outros itens, por ordem de valor:

- **Auto-hospedar o Tailwind** e então aplicar CSP (V9).
- **Fechar a leitura de `academies`** após migrar o seletor (acima).
- **Restringir o `invoker`** das callables ao service account do proxy, em vez de `public`.
  Hoje `scripts/fixFunctionInvokers.cjs` reaplica IAM público a cada deploy, o que remove a
  defesa em profundidade: a única barreira entre a internet e cada function é o
  `getRequestContext` no código.
- **Auditoria de mudanças de papel** — `setUserRole` não registra histórico. Um professor
  pode promover alunos da própria academia a professor (lateral, aparentemente intencional),
  mas sem rastro.
- **CI de qualidade** — hoje só existe o workflow do iOS. Rodar `typecheck`, `lint` e os
  testes de regras em cada PR evitaria que uma regra permissiva chegasse a produção.
- **Dependências** — `html5-qrcode` (não mantido, processa entrada de câmera) e
  `file-saver`; functions ainda em Node 20, que sai de suporte em abril de 2026.
