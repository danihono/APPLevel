# Publicar o APPLevel na Google Play Store (TWA / Bubblewrap)

Guia passo a passo. As mudanças no **código** já foram feitas (ícones, push, assetlinks,
política de privacidade). Falta o que é **manual / interativo**: deploy, gerar o app Android
e configurar a Play Store.

> Domínio: `https://applevel-c5e73.web.app` · Package publicado: `com.leveljiujitsu.app`
>
> ⚠️ O package **real** do app publicado é `com.leveljiujitsu.app` — é o que está no
> [public/.well-known/assetlinks.json](public/.well-known/assetlinks.json) e no `appId` do
> `capacitor.config.ts`. Versões antigas deste guia sugeriam `com.applevel.app`; usar esse
> valor cria um app **diferente**, que a Play não aceita como atualização do que está no ar.

---

## Passo 1 — Deploy do site (seguro para os clientes)

As mudanças de código são aditivas e não alteram telas. Faça o deploy normal:

```powershell
npm run deploy:hosting
```

Depois confira que estes 2 arquivos estão no ar:

- `https://applevel-c5e73.web.app/.well-known/assetlinks.json` → deve abrir o JSON.
- `https://applevel-c5e73.web.app/privacidade/` → deve abrir a política de privacidade.

> O `assetlinks.json` ainda está com um fingerprint **placeholder**. Ele será atualizado no
> Passo 4, depois de gerar a chave de assinatura.

---

## Passo 2 — Conta no Google Play Console

1. Acesse https://play.google.com/console e crie a conta de desenvolvedor (US$25, uma vez).
2. A verificação da conta pode levar de horas a alguns dias — **comece por aqui**.

---

## Passo 3 — Gerar o app Android com Bubblewrap

Instale o CLI (precisa de Node, já instalado). Na primeira execução o Bubblewrap baixa o
JDK e o Android SDK sozinho.

```powershell
npm install -g @bubblewrap/cli
```

Crie uma pasta SEPARADA, fora do projeto do app, e rode o init apontando para o manifest:

```powershell
mkdir $env:USERPROFILE\applevel-android
cd $env:USERPROFILE\applevel-android
bubblewrap init --manifest https://applevel-c5e73.web.app/manifest.json
```

Responda às perguntas assim:

| Pergunta | Resposta |
|---|---|
| Application ID / Package | `com.leveljiujitsu.app` (IMUTÁVEL depois de publicar) |
| App name | `APPLevel` |
| Launcher name | `APPLevel` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar color | `#0A0A0A` |
| Theme/nav color | `#0A0A0A` |
| Splash color | `#0A0A0A` |
| Icon URL | aceitar (usa o `icon-512.png` do manifest) |
| Maskable icon URL | aceitar (usa o `icon-512-maskable.png`) — sem isso o Android encolhe o ícone dentro de um círculo branco |
| Include support for Play Billing? | `No` (não vende digital no app) |
| Request notification permission? / Push | `Yes` |
| Signing key — criar nova | `Yes` |
| Senha do keystore | escolha uma e **GUARDE** |

> **Importante:** o arquivo `android.keystore` e as senhas geradas são insubstituíveis.
> Guarde-os com segurança (não suba no git). Sem eles você não atualiza o app.

Gere os pacotes:

```powershell
bubblewrap build
```

Saídas:
- `app-release-bundle.aab` → é o que sobe na Play Store.
- `app-release-signed.apk` → para instalar e testar no celular.

Teste no celular (USB com depuração ativada, ou copie o .apk):
```powershell
adb install app-release-signed.apk
```
Abra o app. Nesta etapa ele provavelmente ainda mostra a barra do Chrome — isso some após
o Passo 4 (Asset Links). Teste login, QR (câmera) e navegação.

> Alternativa sem CLI: https://www.pwabuilder.com → cole a URL da PWA → baixe o pacote Android.

---

## Passo 4 — Vincular app ↔ site (Digital Asset Links)

1. Pegue o fingerprint SHA-256 da sua chave:
   ```powershell
   bubblewrap fingerprint list
   ```
   (ou veja o `assetlinks.json` que o Bubblewrap gera na pasta do projeto Android).

2. No projeto do app, edite [public/.well-known/assetlinks.json](public/.well-known/assetlinks.json)
   e substitua `SUBSTITUA_PELO_SHA256_DA_CHAVE_DE_ASSINATURA` pelo fingerprint real
   (formato `AA:BB:CC:...`).

3. Redeploy:
   ```powershell
   npm run deploy:hosting
   ```

4. Valide no gerador oficial:
   https://developers.google.com/digital-asset-links/tools/generator

> **Atenção — Play App Signing:** ao enviar o `.aab`, o Google re-assina o app com a própria
> chave. Depois de enviar (Passo 5), vá em **Play Console → Configurações → Integridade do app
> → App signing** e copie o **SHA-256 da "App signing key"**. Adicione esse fingerprint
> também ao `assetlinks.json` (pode ter vários na lista) e faça novo deploy. Sem isso, o app
> baixado da loja abrirá com a barra do Chrome.

---

## Passo 5 — Publicar na Play Store

1. No Play Console, **Criar app** (nome: APPLevel, idioma: pt-BR, gratuito).
2. Faça upload do `app-release-bundle.aab` em **Teste interno** primeiro (libera rápido).
3. Preencha a ficha da loja:
   - Ícone 512×512 (use o `public/icon-512.png`).
   - Feature graphic 1024×500 (criar uma arte).
   - 2 a 8 screenshots de celular (capturar do app rodando).
   - Descrição curta (≤80 caracteres) e completa.
   - URL da privacidade: `https://applevel-c5e73.web.app/privacidade/`.
4. Preencha os formulários: **Data safety**, **Content rating**, público-alvo, anúncios (não).
5. Faça o Passo 4 (atualizar assetlinks com a App signing key) e teste pela faixa interna.
6. Promova para **Produção**. A primeira revisão do Google costuma levar alguns dias.

---

## Manutenção depois de publicado

- Mudou **só o conteúdo web** (telas, lógica)? → `npm run deploy:hosting`. **Não** precisa
  reenviar nada na loja; o app atualiza sozinho.
- Mudou ícone, nome, ou config do TWA? → incremente `appVersionCode`/`appVersionName` no
  `twa-manifest.json`, rode `bubblewrap build` e envie o novo `.aab`.

### Trocar o ícone do app

O ícone fica **assado dentro do `.aab`**: mudar os PNGs do repositório e fazer deploy do site
**não** atualiza o ícone de quem instalou pela Play Store. São dois lugares distintos:

| Onde aparece | Como atualizar |
|---|---|
| Ícone na tela de início do celular | Rebuild do `.aab` (passos abaixo) |
| Ícone na página do app na Play Store | Upload manual: Play Console → Presença na loja → Ficha da loja principal → Ícone do app (use `public/icon-512.png`) |
| Ícone da PWA (adicionar à tela de início pelo navegador) | Só `npm run deploy:hosting` |
| Ícone do app iOS | `npx cap sync ios` + build no Xcode |

Para regerar a arte a partir de `public/logo3.png`:

```powershell
pip install Pillow
python scripts/generateAppIcons.py
```

Depois, para o Android:

```powershell
npm run deploy:hosting            # publica os ícones novos no manifest
cd $env:USERPROFILE\applevel-android
bubblewrap update                 # rebaixa os ícones a partir do manifest
# edite twa-manifest.json: incremente appVersionCode (+1) e appVersionName
bubblewrap build
```

Confira que a arte nova entrou olhando `app/src/main/res/mipmap-xxxhdpi/` antes de subir o
`.aab`. O Firebase Hosting serve estáticos com cache de ~1h — se vier a arte antiga, espere um
pouco e rode o `bubblewrap update` de novo.

---

## Recuperar o projeto num computador novo

O projeto Bubblewrap (`applevel-android`) **não** faz parte deste repositório — ele vive numa
pasta separada da máquina de quem publicou. Ao trocar de computador, procure por ele antes de
recriar:

```powershell
Get-ChildItem C:\ -Recurse -Filter twa-manifest.json -ErrorAction SilentlyContinue | Select FullName
Get-ChildItem C:\ -Recurse -Include *.keystore,*.jks -ErrorAction SilentlyContinue | Select FullName
```

Se não achar nada, dá para reconstruir tudo — o projeto é inteiramente derivável da URL do
manifest. Refaça o **Passo 3**, atenção a três pontos:

1. **Package:** obrigatoriamente `com.leveljiujitsu.app`. Qualquer outro valor vira um app novo.
2. **`appVersionCode`:** precisa ser **maior** que o da versão em produção hoje (veja em
   Play Console → Versões → Produção). A Play rejeita código igual ou menor.
3. **Chave de assinatura:** veja abaixo.

### Perdi o `android.keystore`

Como o app usa **Assinatura de apps do Google Play** (Play App Signing), a chave que os
celulares verificam fica guardada no Google — perder o keystore local **não** impede
atualizações. O que se perde é a *chave de upload*, e ela é redefinível:

1. Gere uma chave nova (o `bubblewrap init` faz isso ao responder `Yes` em "criar nova").
2. Play Console → Configurações → Integridade do app → Assinatura de apps →
   **Solicitar redefinição da chave de upload**, enviando o certificado da chave nova.
3. A aprovação do Google não é instantânea — pode levar alguns dias.
4. Depois de aprovada, acrescente o SHA-256 da nova chave de upload à lista de
   `sha256_cert_fingerprints` em [public/.well-known/assetlinks.json](public/.well-known/assetlinks.json)
   (**mantenha os que já estão lá**) e rode `npm run deploy:hosting`.

> O que realmente não se recupera é o acesso à conta do Play Console. Isso está no login
> Google, não na máquina.
