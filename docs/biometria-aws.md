# Chamada por foto: configurar a AWS (passo a passo)

A chamada por foto usa o **AWS Rekognition**, o serviço de reconhecimento facial da Amazon.

- **Cadastro:** o aluno grava alguns segundos do rosto e o servidor manda 5 quadros para a AWS.
  A AWS guarda só o modelo numérico do rosto, nenhuma foto.
- **Chamada:** o professor tira uma foto da turma e o servidor pergunta à AWS quem é cada rosto.
  O professor sempre confirma antes de gravar a presença.

**Custo aproximado** (confira a tabela atual em <https://aws.amazon.com/rekognition/pricing/>):
cerca de US$ 0,001 por imagem analisada.

| Ação | Custo aproximado |
|---|---|
| Cadastro de um aluno (uma vez) | US$ 0,005 |
| Chamada de uma turma de 30 | US$ 0,03 |
| Armazenamento | US$ 0,00001 por rosto por mês |

Exemplo: 3 aulas por dia com 30 alunos dá uns US$ 3 por mês.

> ⚠️ **Importante para qualquer deploy das functions:** as functions da biometria declaram duas
> chaves secretas. Sem elas o `firebase deploy` das functions falha, **mesmo que a chamada por
> foto esteja desligada**. Faça o passo 4 antes do próximo deploy. Se ainda não for usar a AWS,
> grave qualquer texto como valor provisório.

## 1. Criar a conta AWS

1. Acesse <https://aws.amazon.com> → **Criar uma conta da AWS**. Pede cartão de crédito.
2. Entre no console como usuário raiz e ative a autenticação em dois fatores (MFA).

## 2. Criar um usuário só para o app (IAM)

1. Console → **IAM** → **Usuários** → **Criar usuário**, com o nome `applevel-rekognition`.
   **Sem** acesso ao console.
2. **Anexar políticas diretamente** → **Criar política** → aba **JSON** → cole o texto abaixo.
   Troque `SUA_CONTA` pelo número da conta (12 dígitos, no canto superior direito) e a região se
   não for `us-east-1`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ColecaoDoApp",
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateCollection",
        "rekognition:DescribeCollection",
        "rekognition:IndexFaces",
        "rekognition:ListFaces",
        "rekognition:DeleteFaces",
        "rekognition:CreateUser",
        "rekognition:DeleteUser",
        "rekognition:ListUsers",
        "rekognition:AssociateFaces",
        "rekognition:SearchUsers",
        "rekognition:SearchUsersByImage"
      ],
      "Resource": "arn:aws:rekognition:us-east-1:SUA_CONTA:collection/applevel-alunos"
    },
    {
      "Sid": "DeteccaoDeRostos",
      "Effect": "Allow",
      "Action": "rekognition:DetectFaces",
      "Resource": "*"
    }
  ]
}
```

3. Salve a política com o nome `applevel-rekognition`, anexe ao usuário e conclua.
4. Abra o usuário → **Credenciais de segurança** → **Criar chave de acesso** → escolha
   "Aplicação executada fora da AWS". Copie o **ID da chave** e a **chave secreta**. A chave
   secreta só aparece uma vez.

## 3. Proibir a AWS de usar as imagens para treinar os modelos dela

Por padrão, a AWS pode guardar e usar o conteúdo enviado ao Rekognition para melhorar o
serviço. Para dados biométricos de alunos, **desligue isso**:

1. Console → **AWS Organizations** → **Criar organização**. Se ainda não existir, a sua conta
   vira a conta de gerenciamento.
2. **Políticas** → **Políticas de recusa de serviços de IA** (*AI services opt-out policies*)
   → **Habilitar**.
3. **Criar política** com o conteúdo:

   ```json
   { "services": { "rekognition": { "opt_out_policy": { "@@assign": "optOut" } } } }
   ```

4. Anexe a política à **Raiz** (*Root*) da organização.

Os nomes das telas podem mudar. Se não achar, procure "AI services opt-out policies" na
documentação da AWS.

## 4. Conferir e gravar as chaves no Firebase

No terminal, na pasta do projeto:

```bash
npm --prefix functions install

# confere chave, região e permissões, sem enviar foto de ninguém
# (no Windows PowerShell: $env:AWS_REKOGNITION_ACCESS_KEY_ID="..." ; $env:AWS_REKOGNITION_SECRET_ACCESS_KEY="..." ; npm run face:aws-check)
AWS_REKOGNITION_ACCESS_KEY_ID=COLE_O_ID AWS_REKOGNITION_SECRET_ACCESS_KEY=COLE_O_SEGREDO npm run face:aws-check

# grava as chaves como segredos do Firebase (o comando pede o valor)
firebase functions:secrets:set AWS_REKOGNITION_ACCESS_KEY_ID --project applevel-c5e73
firebase functions:secrets:set AWS_REKOGNITION_SECRET_ACCESS_KEY --project applevel-c5e73
```

**Região:** o padrão é `us-east-1`, pois São Paulo tem Rekognition com operações limitadas. Para
usar outra região, crie `functions/.env` com `AWS_REKOGNITION_REGION=sa-east-1` (por exemplo) e
rode o `face:aws-check` com a mesma região antes.

## 5. Deploy

```bash
npm run firebase:deploy
```

Isso publica as functions, as regras do Firestore (o interruptor só pode ser ligado pelo
superadmin) e o app. A chamada por foto **continua desligada para todas as academias**.

## 6. Ligar para a academia de teste

Entre como **superadmin** → **Gestão** → escolha a academia → marque **Chamada por foto
(biometria facial)** → **Salvar academia**.

A partir daí, nessa academia:

- alunos maiores de 18 veem o convite na tela inicial e a seção em **Perfil → Biometria facial**;
- professores veem **Chamada por foto** na lista de presença da aula, com a aula ativa ou
  encerrada.

Para desligar, desmarque. Quem já tinha cadastrado continua podendo remover a biometria no Perfil.

## Ajustar a precisão

A tela do professor mostra a % de semelhança de cada sugestão. Os limites ficam em
`functions/src/services/faceMatching.ts`:

| Limite | Valor | Efeito |
|---|---|---|
| `FACE_MATCH_THRESHOLD` | 85 | abaixo disso, o rosto fica "não reconhecido" |
| `FACE_HIGH_CONFIDENCE_THRESHOLD` | 95 | a partir disso, a sugestão já vem marcada |

Se aparecer gente errada sugerida, suba os valores. Se pessoas cadastradas não forem
reconhecidas, desça um pouco.

## Testar sem a AWS (desenvolvimento)

Os emuladores usam uma AWS simulada (`functions/src/lib/fakeRekognition.ts`), que reconhece pela
cor da imagem e não por rosto de verdade. Crie:

- `functions/.env.local` com `FACE_AWS_FAKE=1`;
- `functions/.secret.local` com `AWS_REKOGNITION_ACCESS_KEY_ID=fake` e
  `AWS_REKOGNITION_SECRET_ACCESS_KEY=fake`.

Depois rode `npm run firebase:emulators`. Os dois arquivos já estão no `.gitignore`.
