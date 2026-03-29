# APPLevel

Backend Firebase multi-tenant para gestão operacional, performance de atleta e gamificação em academias de Jiu-Jitsu, com suporte para app mobile e painel web.

## Stack

- Firebase Authentication
- Cloud Firestore
- Cloud Functions
- Firebase Storage
- Firebase Messaging
- Vite + React no frontend atual

## Estrutura adicionada

```text
firebase.json
.firebaserc.example
firestore.rules
firestore.indexes.json
storage.rules
functions/
services/firebase/
```

## Modelo multi-tenant

Todos os documentos operacionais usam `academyId` como chave de segmentação.

Roles suportadas:

- `student`
- `professor`
- `admin`
- `superadmin`

Coleções principais:

- `users`
- `academies`
- `classes`
- `attendances`
- `graduations`
- `missions`
- `user_missions`
- `rankings`
- `competitions`
- `fights`
- `store_items`
- `notifications`

## Cloud Functions implementadas

### Auth / Users

- `createAcademy`
- `createUserWithRole`
- `assignUserToAcademy`
- `setUserRole`
- `validateSessionAccess`

### Classes

- `upsertClassSchedule`
- `startClassSession`
- `finishClassSession`
- `generateClassQrCode`

### Presença

- `registerAttendance`
- Trigger `onAttendanceCreated`
- Trigger `onAttendanceDeleted`

### Progressão

- `upsertAcademyProgressionRules`
- `evaluateUserProgression`
- `rebuildUserDerivedState`

### Ranking

- `recalculateUserRanking`
- `recalculateAcademyRankings`
- Trigger `onFightWritten`

### Missões

- `upsertMission`
- `syncUserMissionProgress`

### Notificações

- `registerDeviceToken`
- `sendSegmentedNotification`
- `markNotificationRead`

## Regras importantes já cobertas

- Check-in só entra com aula ativa.
- QR Code é dinâmico por aula e expira por tempo.
- Duplicação de presença é bloqueada por transação.
- Progressão é recalculada automaticamente após presença.
- Ranking e missões são recalculados automaticamente a partir de presença e lutas.
- Firestore e Storage usam escopo por `academyId`.
- Regras de segurança usam autenticação, role e vínculo de academia.

## Frontend

Foi adicionada a camada base em `services/firebase/` para:

- inicialização do app Firebase
- Auth
- Functions callable
- Storage
- Messaging web

Crie um `.env.local` a partir de `.env.example`.

Para vincular o projeto Firebase, copie `.firebaserc.example` para `.firebaserc` e substitua pelo seu `projectId`.

## Como instalar

### Frontend

```bash
npm install
npm install firebase
```

### Functions

```bash
cd functions
npm install
```

## Como rodar com emuladores

```bash
npm run firebase:emulators
```

## Bootstrap do primeiro tenant

Depois de configurar o projeto e as credenciais do Admin SDK, rode:

```bash
npm run firebase:bootstrap:tenant -- \
  --superadminEmail=owner@academy.com \
  --superadminPassword=senha-forte \
  --firstName=Nome \
  --lastName=Sobrenome \
  --academyName="Minha Academia" \
  --academySlug=minha-academia \
  --timezone=America/Sao_Paulo
```

O script:

- cria ou atualiza o usuário no Firebase Auth
- cria ou atualiza a academia pelo `academySlug`
- cria ou atualiza o documento em `users`
- define os custom claims `role=superadmin` e `academyId`

## Como buildar

```bash
npm run build
npm run functions:build
```

## Deploy

Defina o projeto Firebase antes do deploy:

```bash
copy .firebaserc.example .firebaserc
firebase use --add
```

Depois:

```bash
npm run firebase:deploy
```

## Observações

- O frontend atual ainda usa dados mockados; a base Firebase já está pronta para substituição gradual.
- Os IDs de documentos continuam automáticos nas coleções operacionais.
- A lógica crítica ficou centralizada em Cloud Functions para evitar fraude no client.
