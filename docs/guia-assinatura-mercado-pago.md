# Guia — Plano único, trial de 7 dias e Mercado Pago

## Como funciona (já implementado)

| Situação | O que o usuário pode fazer |
|---|---|
| **Trial** (7 dias após o cadastro, sem cartão) | Tudo |
| **Assinante** (pagamento aprovado) | Tudo |
| **Carência** (assinatura venceu há até 7 dias) | Tudo + aviso "regularizar pagamento" |
| **Somente leitura** (trial acabou sem assinatura, ou carência expirou) | Ver e exportar; não cria nem edita nada |

- O bloqueio é **no banco** (gatilho `exigir_assinatura`), então nem uma chamada direta à API consegue gravar sem assinatura.
- Quatro formas de pagamento (mesmo plano, muda só como paga):

  | Forma | Preço | Como funciona no Mercado Pago |
  |---|---|---|
  | Cartão mensal | R$ 129,90/mês | Assinatura recorrente (/preapproval): cobra todo mês até o cliente cancelar (botão "Cancelar assinatura no cartão" na página Assinatura) |
  | Cartão anual | 12x de R$ 109,90 (R$ 1.318,80) | Pagamento único parcelado (Checkout Pro); libera 12 meses |
  | Pix mensal | R$ 109,90 | Pagamento único; libera 1 mês. Aviso de renovação 5 dias antes de vencer |
  | Pix anual | R$ 1.078,80 à vista (R$ 89,90/mês) | Pagamento único; libera 12 meses |

- Pagamentos novos somam ao período vigente. Se quem paga no cartão mensal fizer um Pix ou o anual, a recorrência é cancelada sozinha no MP (não cobra em dobro).
- O banco recusa pagamento único abaixo do preço (proteção contra valor adulterado).
- Contas que já existiam ganharam 7 dias de trial a partir de 23/11/2026 (data da migração).
- Sem limite de representadas, clientes, oportunidades ou PDFs. Proteções de uso justo:
  - PDFs: até 3 em geração ao mesmo tempo, 15 a cada 10 min, 60 por hora e 300 por dia;
  - WhatsApp: 1.500 conversas/mês (custo da Meta).
- Anti-robô no cadastro e no login: campo-isca invisível, recusa de e-mails temporários e Cloudflare Turnstile (ativo quando as chaves existirem).

## 1. Mercado Pago — credenciais de produção

1. Acesse **mercadopago.com.br/developers → Suas integrações** e abra a aplicação da Plurima (ou crie uma, produto "Assinaturas").
2. Em **Credenciais de produção**, ative-as (o MP pede dados do negócio e o site `https://plurima.app`).
3. Copie o **Access Token de produção** (começa com `APP_USR-`).
4. No GitHub (**repo → Settings → Secrets and variables → Actions**):
   - troque `MP_ACCESS_TOKEN` pelo token de produção;
   - **apague** `MP_TEST_PAYER_EMAIL`. Com ele preenchido, o checkout só aceita o comprador de teste.
5. Faça o mesmo no `.env` local apenas se for testar em produção a partir da sua máquina (o normal é o `.env` local seguir com credenciais de teste).

> Depois de apagar o secret no GitHub, remova-o também do Cloudflare (o deploy só envia os secrets preenchidos e não apaga os antigos):
> `cd apps/web; npx wrangler secret delete MP_TEST_PAYER_EMAIL`

## 1b. Mercado Pago — parcelamento sem juros (obrigatório para o "12x de R$ 109,90")

Sem isso o cliente vê 12x **com juros** (parcela maior que R$ 109,90).
1. No painel do Mercado Pago: **Seu negócio → Custos** (ou **Configurações → Parcelamento**).
2. Ative **Oferecer parcelamento sem juros** até **12 parcelas** para pagamentos online. O custo do parcelamento passa a ser descontado de você.
3. Confira a taxa e o prazo de recebimento escolhidos (na hora ou em 14/30 dias), que mudam o custo.

## 2. Mercado Pago — webhook

1. Em **Suas integrações → (aplicação) → Webhooks → Configurar notificações**, aba **Modo produção**.
2. URL: `https://plurima.app/api/webhooks/mercadopago`
3. Eventos: marque **Pagamentos** e **Planos e assinaturas** (`subscription_preapproval` e `subscription_authorized_payment`).
4. Salve e copie a **Assinatura secreta** → secret `MP_WEBHOOK_SECRET` no GitHub.
5. Use o botão **Simular** do painel: o app deve responder 200. Uma assinatura inválida é recusada com 401 (é o esperado na simulação sem a chave certa).

## 3. Teste ponta a ponta (antes de abrir para clientes)

1. Ainda com credenciais **de teste**: em **Suas integrações → Contas de teste**, crie um *vendedor* e um *comprador*.
2. Use o Access Token do vendedor de teste em `MP_ACCESS_TOKEN` e o e-mail do comprador em `MP_TEST_PAYER_EMAIL`.
3. Crie uma conta nova na Plurima → em **Assinatura**, teste as 4 opções: cartão mensal e cartão anual com um cartão de teste (titular `APRO`) e Pix (no ambiente de teste o Pix fica pendente; aprove pelo painel de testes ou use o botão "Já paguei — verificar pagamento").
4. Confira: volta para `/app/configurar?retorno=mp`, a situação vira **Assinatura ativa** e a validade fica em +1 mês (ou +12 meses no anual).
5. Para testar o modo leitura sem esperar 7 dias, rode no SQL Editor do Supabase:
   `update usuarios set trial_fim = now() - interval '1 minute' where email = '<e-mail da conta de teste>';`
6. Depois troque para as credenciais de produção (passo 1) e faça uma assinatura real sua; dá para cancelar e estornar pelo painel do MP.

## 4. Cloudflare Turnstile (anti-robô)

1. **dash.cloudflare.com → Turnstile → Add widget**: nome "Plurima", domínios `plurima.app` e `localhost`, modo **Managed**.
2. Copie o **Site Key** → secret `TURNSTILE_SITE_KEY`; o **Secret Key** → secret `TURNSTILE_SECRET_KEY` (ambos no GitHub; opcionalmente no `.env` local).
3. No próximo deploy o desafio aparece no cadastro e no login. Sem as chaves, o app segue funcionando só com o campo-isca.
4. Recomendado: em **Security → WAF → Rate limiting rules**, limite `POST /signup` a ~5 por minuto por IP.

## 5. Supabase (reforços contra farm de trial)

- **Authentication → Providers → Email**: hoje a conta nasce confirmada (sem e-mail de verificação). Para exigir confirmação, é preciso SMTP próprio configurado (**Authentication → SMTP**) e ajustar o cadastro — peça quando quiser ativar.
- **Authentication → Attack Protection**: ative a *Leaked password protection* (pendência antiga).
- **Authentication → Rate Limits**: mantenha os padrões.

## 6. Checklist final

- [ ] `MP_ACCESS_TOKEN` de produção no GitHub
- [ ] `MP_TEST_PAYER_EMAIL` removido (GitHub + `wrangler secret delete`)
- [ ] Webhook de produção com `MP_WEBHOOK_SECRET` atualizado
- [ ] `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` no GitHub
- [ ] Push na main (o deploy envia os secrets)
- [ ] Assinatura real de teste aprovada e acesso liberado
