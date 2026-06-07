# Publicar o APPLevel na Google Play Store (TWA / Bubblewrap)

Guia passo a passo. As mudanças no **código** já foram feitas (ícones, push, assetlinks,
política de privacidade). Falta o que é **manual / interativo**: deploy, gerar o app Android
e configurar a Play Store.

> Domínio: `https://applevel-c5e73.web.app` · Package sugerido: `com.applevel.app`

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
mkdir C:\Users\vorat\applevel-android
cd C:\Users\vorat\applevel-android
bubblewrap init --manifest https://applevel-c5e73.web.app/manifest.json
```

Responda às perguntas assim:

| Pergunta | Resposta |
|---|---|
| Application ID / Package | `com.applevel.app` (IMUTÁVEL depois de publicar) |
| App name | `APPLevel` |
| Launcher name | `APPLevel` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar color | `#0A0A0A` |
| Theme/nav color | `#0A0A0A` |
| Splash color | `#0A0A0A` |
| Icon URL | aceitar (usa o `icon-512.png` do manifest) |
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
