# Guia para iniciantes — Testar as 4 formas de assinatura (sem dinheiro de verdade)

**Objetivo:** simular, de ponta a ponta, o que o seu cliente vai viver ao assinar a Plurima, nas 4 formas de pagamento, usando contas de teste do Mercado Pago (nenhum dinheiro real se move).

**Tempo estimado:** 1h30 na primeira vez.

**Você vai precisar:**
- Computador com Google Chrome (as **janelas anônimas** serão muito usadas: `Ctrl + Shift + N`)
- Acesso à sua conta do Mercado Pago (a real), ao GitHub e ao site `https://plurima.app`
- Um bloco de notas aberto para anotar usuários, senhas e códigos

> **Regra de ouro:** cada "pessoa" do teste usa a sua própria janela anônima. Feche a janela anônima ao terminar cada etapa, para o navegador não misturar contas.

---

## Visão geral: quem é quem no teste

Você vai criar **5 contas de teste** no Mercado Pago: **1 vendedor** (faz o papel da Plurima, que recebe) e **4 compradores** (fazem o papel dos clientes, um para cada forma de pagamento).

| Conta de teste | Papel | O que vai testar |
|---|---|---|
| Vendedor | A "Plurima" que recebe | — |
| Comprador 1 | Cliente | **Cartão mensal** — R$ 129,90 todo mês (e o cancelamento) |
| Comprador 2 | Cliente | **Cartão anual** — 12x de R$ 109,90 |
| Comprador 3 | Cliente | **Pix mensal** — R$ 109,90 |
| Comprador 4 | Cliente | **Pix anual** — R$ 1.078,80 |

E cada comprador terá **uma conta na Plurima criada com o mesmo e-mail** da conta de teste dele. Assim o Mercado Pago reconhece quem está pagando.

---

## Parte 1 — Criar as 5 contas de teste no Mercado Pago

1. Entre normalmente (janela comum) na sua conta **real** do Mercado Pago e abra: **https://www.mercadopago.com.br/developers/panel/app**
2. Clique na aplicação da Plurima. Se não existir nenhuma, clique em **Criar aplicação**, dê o nome "Plurima", escolha **Pagamentos online** e conclua.
3. No menu lateral da aplicação, clique em **Contas de teste**.
4. Clique em **+ Criar conta de teste** e preencha:
   - **Descrição:** `Vendedor`
   - **País:** Brasil
   - Clique em **Criar conta de teste**.
5. Repita o passo 4 mais quatro vezes, com as descrições `Comprador 1 - cartao mensal`, `Comprador 2 - cartao anual`, `Comprador 3 - pix mensal` e `Comprador 4 - pix anual`.
   - Se o formulário pedir um valor "em conta" para os compradores, coloque `5000`.
6. Para cada conta criada, o painel mostra **Usuário**, **Senha** e **User ID**. Anote os três de cada uma no bloco de notas. Você vai precisar deles.

> **Código de verificação:** quando for entrar numa conta de teste e o Mercado Pago pedir um código enviado por e-mail, use os **últimos 6 dígitos do User ID** daquela conta (ou o código exibido no próprio painel de contas de teste).

---

## Parte 2 — Descobrir o e-mail de cada comprador

O e-mail é o que liga o comprador do Mercado Pago à conta dele na Plurima.

1. Abra uma **janela anônima** e entre em **https://www.mercadopago.com.br** com o **Usuário** e a **Senha** do **Comprador 1**.
2. Clique no seu nome/foto (canto superior direito) → **Meu perfil** (ou **Dados pessoais**) e anote o **e-mail** exibido (algo como `test_user_123456@testuser.com`).
3. Feche a janela anônima.
4. Repita os passos 1 a 3 para os Compradores 2, 3 e 4.

---

## Parte 3 — Preparar o "vendedor de teste" (a Plurima de mentira)

1. Abra uma **janela anônima** e entre no Mercado Pago com o **Usuário** e a **Senha** do **Vendedor**.
2. Na mesma janela, abra **https://www.mercadopago.com.br/developers/panel/app** e clique em **Criar aplicação**:
   - **Nome:** `Plurima Teste`
   - Tipo de solução: **Pagamentos online**; se perguntar sobre plataforma, escolha que **não** usa plataforma de e-commerce (integração própria).
   - Produto: **Checkout Pro**; se a tela oferecer **Assinaturas**, marque também.
   - Conclua a criação.
3. Dentro da aplicação, no menu lateral, abra **Credenciais de produção**.
   - Se pedir para ativar, preencha: setor **Software/Serviços**, site `https://plurima.app`, aceite e clique em **Ativar credenciais de produção**.
   - Copie o **Access Token**, que começa com `APP_USR-`, e guarde no bloco de notas como **TOKEN DE TESTE**.
   - Pode estranhar, mas é assim mesmo: as credenciais "de produção" de uma conta **de teste** não movimentam dinheiro real.
4. No menu lateral, abra **Webhooks** → **Configurar notificações** → aba **Modo produção**:
   - **URL:** `https://plurima.app/api/webhooks/mercadopago`
   - **Eventos:** marque **Pagamentos** e **Planos e assinaturas**
   - Clique em **Salvar**.
   - Copie a **Assinatura secreta** (clique no ícone de olho para revelar) e guarde como **SEGREDO DE TESTE**.
5. **Opcional, mas recomendado:** ainda logado como Vendedor, ative o parcelamento sem juros. No menu do Mercado Pago, abra **Seu negócio → Custos** (ou **Configurações → Parcelamento**), ative **parcelamento sem juros até 12x** e salve.
   - Se a opção não existir na conta de teste, tudo bem: no teste, o 12x pode aparecer "com juros". Na conta real, você ativa.
6. Feche a janela anônima.

---

## Parte 4 — Colocar as chaves de teste na Plurima

1. Abra o GitHub → repositório **novocrm** → **Settings** (engrenagem) → no menu lateral, **Secrets and variables** → **Actions**.
2. Em **Repository secrets**, ajuste:
   - **`MP_ACCESS_TOKEN`:** clique no lápis ✏️ (ou em **New repository secret** se não existir), cole o **TOKEN DE TESTE** e clique em **Update secret**.
   - **`MP_WEBHOOK_SECRET`:** cole o **SEGREDO DE TESTE** e clique em **Update secret**.
   - **`MP_TEST_PAYER_EMAIL`:** se existir, **apague** (ícone da lixeira). Não é mais necessário, porque cada conta da Plurima usará o e-mail do próprio comprador.
3. Publique as chaves: no topo do repositório, clique em **Actions**, abra a execução mais recente (a primeira da lista) e clique em **Re-run all jobs** (canto superior direito). Aguarde ficar verde ✅ (cerca de 5 a 10 minutos).
4. Me avise quando terminar. Eu confiro no servidor se o `MP_TEST_PAYER_EMAIL` antigo ainda está lá e removo, se for o caso.
5. **Teste da ligação:** volte (janela anônima, logado como **Vendedor**) em Webhooks e clique em **Simular**. Escolha o evento **Pagamentos** e envie. O resultado esperado é **200**.
   - Se aparecer **401**, o segredo não confere: refaça o passo 2 com a **Assinatura secreta** e depois o passo 3.

---

## Parte 5 — Criar as 4 contas de cliente na Plurima

Para cada comprador (1 a 4):

1. Abra uma **janela anônima** e acesse **https://plurima.app/signup**.
2. Preencha:
   - **Nome:** `Teste Cartão Mensal` (2: `Teste Cartão Anual`, 3: `Teste Pix Mensal`, 4: `Teste Pix Anual`)
   - **E-mail:** **o e-mail do comprador** anotado na Parte 2
   - **Senha:** uma senha sua, por exemplo `Teste@2026` (anote)
3. Clique em **Criar conta**. Você entra direto, no período de **teste grátis de 7 dias**.
4. Feche a janela anônima.

**Opcional — ver o paywall (modo somente leitura) antes de pagar:** me envie o e-mail de uma dessas contas e eu encerro o teste grátis dela. Ao entrar, ela verá a faixa vermelha "Sua conta está em modo somente leitura" e não conseguirá criar nada até pagar.

---

## Parte 6 — Os 4 testes

Em **todos** os testes, use **duas abas na mesma janela anônima**:
- **Aba A:** Mercado Pago, logado como o **comprador** daquele teste
- **Aba B:** Plurima, logada com a conta de mesmo e-mail

**Dados do cartão de teste** (cartão público de testes do Mercado Pago):

| Campo | Valor |
|---|---|
| Número | `5031 4332 1540 6351` (Mastercard) |
| Código de segurança | `123` |
| Validade | `11/30` |
| Nome do titular | **`APRO`** (pagamento aprovado). Use `OTHE` para simular recusa |
| CPF | `12345678909` |

### Teste 1 — Cartão mensal (Comprador 1)
1. **Aba A:** entre no Mercado Pago como **Comprador 1**.
2. **Aba B:** entre na Plurima (`https://plurima.app/login`) com a conta do Comprador 1 → no menu lateral, clique em **Configurações** (abre a página **Assinatura**).
3. No card **Mensal**, em **Cartão de crédito – R$ 129,90/mês**, clique em **Assinar no cartão**.
4. Na tela do Mercado Pago, pague com o cartão de teste (titular **APRO**) e confirme.
5. Você volta para a Plurima. **Resultado esperado:**
   - Situação **"Assinatura ativa"**, forma **Cartão mensal**
   - **Próxima cobrança** em cerca de 1 mês
   - Botão **"Cancelar assinatura no cartão"** visível
6. **Teste do cancelamento:** clique em **Cancelar assinatura no cartão**. **Resultado esperado:** mensagem "Assinatura cancelada. Seu acesso continua até…", e a conta segue funcionando até a data mostrada.

### Teste 2 — Cartão anual 12x (Comprador 2)
1. **Aba A:** Mercado Pago como **Comprador 2**. **Aba B:** Plurima com a conta do Comprador 2 → menu **Configurações** (página **Assinatura**).
2. No card **Anual**, em **Cartão de crédito – 12x R$ 109,90**, clique em **Pagar no cartão**.
3. No Mercado Pago, use o cartão de teste e **escolha 12 parcelas**.
   - Confira se aparecem 12x de R$ 109,90 (sem juros) ou um valor maior (com juros, caso o parcelamento sem juros não esteja ativo na conta de teste).
4. Confirme. **Resultado esperado:** situação **"Assinatura ativa"**, forma **Cartão anual**, **Acesso pago até** cerca de 12 meses à frente.

### Teste 3 — Pix mensal (Comprador 3)
1. **Aba A:** Mercado Pago como **Comprador 3**. **Aba B:** Plurima com a conta do Comprador 3 → menu **Configurações** (página **Assinatura**).
2. No card **Mensal**, em **Pix – R$ 109,90**, clique em **Pagar com Pix**.
3. **Resultado esperado:** o Mercado Pago mostra o **QR Code Pix** e o código "copia e cola" de **R$ 109,90**.
4. **Atenção:** em ambiente de teste, o Pix **não pode ser pago de verdade**, então ele fica "pendente". Isso é normal.
5. Para concluir a simulação, me envie o e-mail desta conta. Eu simulo a aprovação do Pix no sistema e você confere na página **Assinatura**:
   - situação **"Assinatura ativa"**, forma **Pix mensal**, acesso pago por cerca de 1 mês;
   - quando faltarem 5 dias para vencer, aparece no topo o aviso **"Seu acesso pago termina em N dias – Renovar"**.

### Teste 4 — Pix anual (Comprador 4)
1. Igual ao Teste 3, mas com o **Comprador 4**, no card **Anual**, em **Pix – R$ 89,90/mês**.
2. **Resultado esperado:** QR Code de **R$ 1.078,80**.
3. Me envie o e-mail. Depois que eu simular a aprovação, a página deve mostrar a forma **Pix anual**, com acesso pago por cerca de 12 meses.

### Teste extra (opcional) — Pagamento recusado
- Com qualquer comprador de cartão, repita o pagamento usando **`OTHE`** como nome do titular.
- **Resultado esperado:** o Mercado Pago mostra que o pagamento foi recusado e a conta na Plurima **não** é liberada.

---

## Parte 7 — Checklist do teste

- [ ] Simular webhook retornou **200**
- [ ] Teste 1: cartão mensal ativou e o cancelamento funcionou
- [ ] Teste 2: cartão anual ativou com 12 meses
- [ ] Teste 3: QR Code Pix de R$ 109,90 apareceu (e a aprovação simulada liberou 1 mês)
- [ ] Teste 4: QR Code Pix de R$ 1.078,80 apareceu (e a aprovação simulada liberou 12 meses)
- [ ] Teste extra: pagamento recusado não liberou acesso

Se algo der diferente do "resultado esperado", me mande um **print da tela** e diga **em qual teste e em qual passo** aconteceu.

---

## Parte 8 — Depois dos testes: virar a chave para o real

1. Na sua conta **real** do Mercado Pago (janela comum): aplicação Plurima → **Credenciais de produção** → copie o **Access Token** real.
2. Na mesma aplicação real → **Webhooks** → **Modo produção**:
   - URL `https://plurima.app/api/webhooks/mercadopago`
   - eventos **Pagamentos** e **Planos e assinaturas**
   - salve e copie a **Assinatura secreta** real.
3. Ative o **parcelamento sem juros até 12x** na conta real.
4. No GitHub → Secrets, troque `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` pelos valores **reais** e faça **Re-run all jobs** em Actions.
5. Faça uma compra real sua de **Pix mensal (R$ 109,90)** para confirmar. Depois, estorne pelo painel do Mercado Pago (**Atividade → o pagamento → Devolver dinheiro**).
6. Me avise: eu apago as 4 contas de cliente de teste da Plurima.
