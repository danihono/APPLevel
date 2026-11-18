# CLAUDE.md

Orientações para o Claude Code (claude.ai/code) ao trabalhar neste repositório.

## Visão geral

**APPLevel** é uma plataforma SaaS **multi-tenant** de gestão de academias de Jiu-Jitsu.
Cobre: agendamento de aulas, registro de presença, progressão de faixa, gamificação
(missões e rankings), trilhas de aprendizado (learning) e gestão financeira.

- **Frontend:** React 19 + Vite + TypeScript
- **Backend:** Firebase — Firestore, Cloud Functions, Auth, Storage, Cloud Messaging (FCM)
- **Multi-tenant:** cada academia é um tenant. Praticamente todo dado é segmentado por
  `academyId`, e o `academyId` é gravado nos *custom claims* do JWT do usuário.

## Comandos

### Frontend (raiz do projeto)

| Comando | Descrição |
|---|---|
| `npm run dev` | Sobe o dev server (Vite) |
| `npm run build` | Build de produção → `dist/` |
| `npm run preview` | Pré-visualiza o build de produção |
| `npm run typecheck` | Type-check do frontend (`tsc --noEmit`) |
| `npm run i18n:check` | Confere se todo `t('...')` tem tradução en/es no catálogo |
| `npm run firebase:emulators` | Sobe todos os emuladores Firebase locais |
| `npm run functions:build` | Compila as Cloud Functions (delega para `functions/`) |
| `npm run firebase:deploy` | Deploy completo + corrige invokers |
| `npm run deploy:hosting` | Build + deploy apenas do hosting |
| `npm run firebase:bootstrap:tenant -- ...` | Cria o primeiro tenant/superadmin |
| `npm run face:aws-check` | Confere chaves/região/coleção do AWS Rekognition (chamada por foto) |

### Backend (`functions/`)

| Comando | Descrição |
|---|---|
| `npm --prefix functions run build` | Compila TypeScript → `functions/lib/` |
| `npm --prefix functions run lint` | Type-check das functions (`tsc --noEmit`) |
| `npm --prefix functions run clean` | Limpa `functions/lib/` |
| `npm --prefix functions run emulators` | Emuladores de functions, firestore, auth e storage |
| `npm --prefix functions run deploy` | Deploy só das functions + corrige invokers |

Bootstrap do primeiro tenant (exemplo):

```bash
npm run firebase:bootstrap:tenant -- \
  --superadminEmail=owner@academia.com \
  --superadminPassword=senha-forte \
  --firstName=Nome --lastName=Sobrenome \
  --academyName="Minha Academia" \
  --academySlug=minha-academia \
  --timezone=America/Sao_Paulo
```

> **Não há suíte completa de testes automatizados.** Há testes unitários de funções puras em
> `tests/` (`node --test --experimental-strip-types tests/*.test.ts`) e das functions em
> `functions/test/` (`npm --prefix functions test`); no mais, use
> `typecheck` / `lint` e os emuladores para validar mudanças.

## Estrutura de diretórios

```
applevel/
├── App.tsx                  # Componente raiz (~2800 linhas) — roteamento e estado global
├── index.tsx                # Entry point React
├── types.ts                 # Tipos globais do frontend
├── utils.ts                 # Funções utilitárias
├── beltCatalog.ts           # Catálogo de faixas de Jiu-Jitsu
├── calendarUtils.ts         # Utilitários de calendário
├── components/              # Componentes React reutilizáveis (UI, modais, cards)
├── views/                   # Páginas/telas completas (sufixo *View)
├── services/firebase/       # Camada de acesso ao Firebase (client SDK)
│   ├── client.ts            #   inicialização do Firebase
│   ├── auth.ts              #   autenticação
│   ├── data.ts              #   subscrições Firestore (subscribeTo*)
│   ├── functions.ts         #   chamadas às Cloud Functions
│   ├── mutations.ts         #   escritas e uploads
│   ├── models.ts            #   tipos dos documentos Firestore
│   ├── adapters.ts          #   conversão de dados
│   ├── notifications.ts     #   lógica de notificações
│   └── messaging.ts         #   Firebase Cloud Messaging
├── functions/src/           # Cloud Functions (Node 20, CommonJS)
│   ├── index.ts             #   registra e exporta todas as functions
│   ├── domain/models.ts     #   tipos de domínio compartilhados
│   ├── lib/                 #   utilitários (errors, firebase, security, payload, context)
│   ├── modules/             #   implementação das functions por domínio
│   ├── services/            #   serviços reutilizáveis entre functions
│   └── scripts/             #   bootstrapTenant.ts
├── scripts/fixFunctionInvokers.cjs   # pós-deploy: ajusta permissões de invocação
├── firebase.json            # config Firebase (hosting, functions, emuladores)
├── firestore.rules          # regras de segurança Firestore
├── firestore.indexes.json   # índices Firestore
└── storage.rules            # regras de segurança Storage
```

## Arquitetura

### Frontend → Backend
O frontend chama as Cloud Functions de duas formas: *callable* direto via SDK e um
**proxy HTTP** exposto em `/api/callable` (rewrite no `firebase.json` → função
`callableProxy`). A camada `services/firebase/functions.ts` centraliza essas chamadas.

### Autenticação e papéis
Firebase Auth com *custom claims* no JWT contendo `role` e `academyId`. Papéis:
`student`, `professor`, `admin`, `superadmin`. O fluxo de login passa por
`validateSessionAccess` para validar o acesso à academia.

### Tempo real
O estado é sincronizado via listeners do Firestore — funções `subscribeTo*` em
`services/firebase/data.ts` retornam uma função de *unsubscribe*.

### Cloud Functions por domínio (`functions/src/modules/`)
Todas as functions são registradas e re-exportadas em `functions/src/index.ts`.
Região global: `southamerica-east1`; `maxInstances: 10`.

| Módulo | Responsabilidade |
|---|---|
| `auth.ts` | Academias, criação de usuários, papéis, signup, perfis, graduações |
| `classes.ts` | Agendamento de aulas, sessões de aula, QR code dinâmico |
| `attendance.ts` | Registro/solicitação/aprovação de presença (+ triggers) |
| `progression.ts` | Avaliação e reconstrução da progressão de faixa do usuário |
| `ranking.ts` | Recálculo de rankings de usuários e academias |
| `missions.ts` | Missões gamificadas e progresso do usuário |
| `learning.ts` | Trilhas, cursos, lições, blocos e quizzes |
| `finance.ts` | Produtos, serviços, vendas, pagamentos, despesas, receitas, estoque |
| `fightVideos.ts` | Submissão e moderação de vídeos de luta |
| `notifications.ts` | Tokens de dispositivo, notificações segmentadas, leitura |
| `rsvp.ts` | Confirmação de presença em aulas (`toggleClassRsvp`) |
| `faceBiometrics.ts` | Biometria facial (AWS Rekognition): cadastro/revogação do aluno e sugestão de presença por foto |
| `proxy.ts` | `callableProxy` — proxy HTTP para as functions callable |

### Triggers do Firestore
- `onAttendanceCreated` / `onAttendanceDeleted` — recalculam progressão e ranking
- `onFightWritten` — recalcula ranking quando uma luta é gravada

### Fluxos-chave
- **Login:** autenticação → `validateSessionAccess` → custom claims → acesso à academia
- **Presença:** `registerAttendance` → trigger `onAttendanceCreated` → progressão + ranking
- **Aula:** `startClassSession` + QR dinâmico (`generateClassQrCode`) → `finishClassSession`
- **Chamada por foto:** aluno 18+ aceita o termo e cadastra o rosto (`enrollFaceBiometrics`) →
  professor fotografa a turma → `suggestClassAttendanceFromFaces` **sugere** → professor confirma →
  `registerAttendance` com `sourceDevice: 'face_photo'`
- **Learning:** trilhas → cursos → lições → blocos/quizzes (`submitLessonQuiz`)
- **Finanças:** produtos/serviços → vendas → pagamentos → receitas/despesas

## Coleções Firestore

Todas segmentadas por `academyId`:

`users`, `academies`, `classes`, `attendances`, `graduations`, `missions`,
`rankings`, `competitions`, `fights`, `notifications`,
`learning_*` (tracks, courses, lessons, quizzes, progress),
`finance_*` (products, services, sales, payments, revenues, expenses),
`inventory_movements`.

Exceção: `face_biometrics/{uid}` (ids dos rostos no Rekognition) e `face_consent_logs` (aceite/revogação) —
dado sensível, lido e gravado **somente** pelas Cloud Functions (regras negam todo cliente).

## Convenções de código

- Componentes React **funcionais** com hooks; hooks customizados começam com `use*`.
- Modelos de documentos Firestore usam o sufixo `Record` (ex.: `UserRecord`,
  `ClassRecord`); entidades são embrulhadas em `FirestoreEntity<T>`.
- Operações de dados seguem os prefixos `subscribe*` / `create*` / `update*` / `delete*`.
- Páginas usam o sufixo `*View`; modais usam o sufixo `*Modal`.
- Cloud Functions tipam entrada/saída como `PayloadType` / `ResultType`.
- TypeScript em **strict mode** (frontend e backend).
- Path alias do frontend: `@/*` → raiz do projeto.
- Strings de UI e logs ficam em **português** — e toda string de UI passa por `t()`
  (ver *Idiomas* abaixo).
- **Layouts desktop e mobile:** várias telas têm duas renderizações separadas
  (ex.: em `NotificationsView.tsx` os cards de graduação aparecem na versão
  desktop e na versão `notice-mobile__*`). Ao alterar UI/comportamento de um
  card/lista/ação, aplique a mudança nas **duas** versões — a menos que o
  usuário peça explicitamente para mexer só em uma.

## Idiomas (i18n)

A interface suporta **pt-BR (padrão)**, **inglês** e **espanhol**; cada usuário escolhe no
Perfil (salvo em `users/{uid}.language` e no `localStorage`). Sem biblioteca externa:

- `i18n/index.tsx` — `t('Texto em português', { vars })`, `getLocale()`, `createDateFormatter()`,
  `tKey()`, `LanguageProvider`/`useI18n()`. A **chave é o próprio texto pt-BR**; sem tradução,
  cai no português.
- `i18n/messages/<area>.ts` — catálogo `{ 'texto pt': { en, es } }`.
- Ao criar/alterar texto de UI: envolva em `t()` (plural = duas frases, variáveis com `{nome}`),
  adicione `en`/`es` no catálogo e rode `npm run i18n:check`.
- **Nunca** chame `t()` em escopo de módulo (constantes): guarde o texto pt (ou `tKey`) e traduza
  no render com `t(valor)`. Valores gravados no banco (categorias, status, `'Adulto'`/`'Kids'`)
  não são traduzidos — só o rótulo exibido.
- Datas/números: `getLocale()` em vez de `'pt-BR'` fixo.
- Push/notificações e mensagens geradas pelas Cloud Functions continuam em pt-BR; erros do
  backend só saem traduzidos se o texto estiver no catálogo.

## Biometria facial

- O reconhecimento é feito pelo **AWS Rekognition** no servidor (`functions/src/services/faceRecognition.ts`;
  cliente e segredos em `functions/src/lib/rekognition.ts`). Coleção única `applevel-alunos`, com
  `UserId` = uid; o isolamento entre academias é feito no servidor, filtrando pelos alunos da aula.
- No aparelho (`services/faceEngine.ts`, `@vladmandic/human`) só existe a **guia do cadastro por
  vídeo** (`components/FaceVideoCapture.tsx`): detecção + ângulo da cabeça, sem reconhecimento.
- **Liga/desliga por academia:** `academies/{id}.faceAttendanceEnabled`, que só o superadmin altera
  (regra no `firestore.rules` + interruptor em Gestão). Desligado, nada de biometria aparece no app.
- Opcional, só **alunos maiores de 18**, termo versionado (`FACE_CONSENT_VERSION` em
  `faceBiometricsRules.ts` **e** em `functions/src/modules/faceBiometrics.ts` — mude nos dois).
- Limiares e atribuição 1-para-1: `functions/src/services/faceMatching.ts` (puro, testado em
  `tests/faceMatching.test.ts`). Módulo da AWS testado com mock em `functions/test/` (`npm --prefix functions test`).
- **Segredos obrigatórios no deploy das functions:** `AWS_REKOGNITION_ACCESS_KEY_ID` e
  `AWS_REKOGNITION_SECRET_ACCESS_KEY` (ver `docs/biometria-aws.md`).
- Emulador sem AWS: `functions/.env.local` com `FACE_AWS_FAKE=1` + `functions/.secret.local` com
  chaves falsas usa `functions/src/lib/fakeRekognition.ts` (reconhece por cor, não por rosto).
- O modal de cadastro é montado na raiz (`components/FaceEnrollmentHost.tsx`): o App remonta as
  telas a cada atualização do perfil, e um modal dentro de uma tela sumiria ao salvar.
- Os modelos da guia (~2 MB) não ficam no git: `scripts/copyFaceModels.cjs` copia de `node_modules`
  para `public/models/human/` nos hooks `predev`/`prebuild`.

## Ambiente

- Copie `.env.example` → `.env` e preencha as chaves `VITE_FIREBASE_*`,
  `VITE_GEMINI_API_KEY`, `VITE_FIREBASE_FUNCTIONS_REGION`, etc.
- Copie `.firebaserc.example` → `.firebaserc`.
- As Cloud Functions exigem **Node 20**.
- Frontend e backend têm `package.json` e `tsconfig.json` **separados** — rode
  `npm install` na raiz **e** em `functions/`.

## Armadilhas / notas

- Após `firebase deploy`, o script `scripts/fixFunctionInvokers.cjs` corrige as
  permissões de invocação das functions — por isso `firebase:deploy` o executa
  automaticamente. Se fizer deploy manual, rode `npm run firebase:fix-invokers`.
- `App.tsx` é grande (~2800 linhas) e concentra roteamento e estado global.
- Emuladores: auth `9099`, functions `5001`, firestore `8080`, storage `9199`.
