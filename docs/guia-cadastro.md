# Guia: como o cadastro da Plurima funciona e o que configurar

Para quem não é programador. Este guia explica o cadastro da página inicial e das oito landing
pages, o que **você** configura e o que **eu** (Claude) construo.

---

## As duas respostas mais importantes

**1. Preciso configurar o cadastro para cada página? Não.**
A configuração é feita **uma única vez** e vale para a página inicial, para as oito landing pages
e para qualquer página que for criada depois. Todas usam o mesmo cadastro, que mora na plataforma.
Cada página só "avisa" de onde a pessoa veio — isso é automático, você não configura nada por página.

**2. Preciso configurar o login separado do cadastro? Não.**
É a mesma configuração. Na primeira vez que a pessoa clica em "Google" (ou Facebook, ou LinkedIn),
a conta é criada — isso é o cadastro. Nas próximas vezes, o mesmo botão faz o login. O mesmo vale
para o e-mail.

---

## Como funciona (sem termos técnicos)

```
 Página inicial ou landing page          Plataforma (app.seudominio.com.br)
 ───────────────────────────────         ──────────────────────────────────
 1. A pessoa escolhe "Onde conheceu"  →  3. A plataforma cria a conta (Supabase)
 2. Clica em Google / Facebook /         4. Guarda de onde ela veio:
    LinkedIn, ou preenche o e-mail          página, variante A/B, "onde conheceu"
                                             e a campanha (UTMs)
                                          5. A pessoa entra no teste de 7 dias
```

- **Um cadastro só, em um lugar só:** a plataforma. As páginas são a porta de entrada.
- **Um único conjunto de chaves:** um app no Google, um na Meta e um no LinkedIn, ligados ao
  mesmo projeto do Supabase. Não existe chave por página.
- **"Login" no site** leva para a tela de entrada da plataforma, com os mesmos botões.

### O que cada página envia (automático)

| Página | Identificação enviada | Variante |
|---|---|---|
| Página inicial | `home` | — |
| Comissão | `comissao` | A ou B |
| Custo do território | `custo-territorio` | A ou B |
| Carteira e visitas | `carteira` | A ou B |
| CRM que não funcionou | `crm` | A ou B |

Junto vão a resposta de "Onde você conheceu a Plurima?" e, se a visita veio de anúncio, os dados da
campanha (UTMs). Assim você sabe qual página, qual variante e qual canal trouxe cada cliente.

---

## O que você configura (uma vez só)

Faça na ordem. Cada parte tem o tempo estimado.

### Parte A — Domínio da plataforma (5 min)
Recomendado antes de tudo, para não refazer depois.
1. Cloudflare → **Workers & Pages** → **crm-multimarcas** → **Settings** → **Domains & Routes**
   → **Add** → **Custom domain**.
2. Digite `app.seudominio.com.br` → **Add domain**. Aguarde alguns minutos.
3. Abra `https://app.seudominio.com.br/login` e confirme que a plataforma aparece.

### Parte B — Supabase: para onde voltar depois do cadastro (5 min)
1. **supabase.com** → projeto da Plurima → **Authentication** → **URL Configuration**.
2. **Site URL:** `https://app.seudominio.com.br`
3. **Redirect URLs** → **Add URL**, uma de cada vez:
   - `https://app.seudominio.com.br/**`
   - o endereço antigo `workers.dev` seguido de `/**` (para nada quebrar na troca)
   - `http://localhost:3000/**` (testes no computador)
4. **Save**.

### Parte C — Login com Google, Facebook e LinkedIn (55 min)
Siga o guia **[guia-login-social.md](guia-login-social.md)** (Passos 1, 2 e 3). Onde ele diz
`ENDEREÇO-DA-PLATAFORMA`, use `https://app.seudominio.com.br`.

### Parte D — E-mail de envio (20 min) — necessário para o cadastro por e-mail
Por que: o e-mail que vem pronto no Supabase **só envia para os membros da sua equipe** no
Supabase e tem limite de poucos e-mails por hora. Para que qualquer pessoa receba o e-mail de
confirmação do cadastro, é preciso um serviço de envio. Recomendo o **Resend** (grátis até
3.000 e-mails por mês).

1. Crie a conta em **resend.com** (pode entrar com o Google).
2. **Domains** → **Add Domain** → digite `seudominio.com.br` → região mais próxima (ex.: São Paulo,
   se aparecer) → **Add**.
3. Clique em **Auto configure** (ou "Sign in to Cloudflare") e autorize — o Resend coloca os
   registros no Cloudflare sozinho. Se essa opção não aparecer, copie cada registro mostrado e crie
   igual no Cloudflare em **DNS** → **Records** → **Add record**.
4. Espere o domínio ficar **Verified** (alguns minutos).
5. **API Keys** → **Create API Key** → nome **Supabase** → permissão **Sending access** → **Add**.
   Copie a chave (ela aparece uma vez só).
6. No **Supabase**: **Authentication** → **Emails** → aba **SMTP Settings** → ligue
   **Enable custom SMTP** e preencha:
   - Sender email: `nao-responda@seudominio.com.br`
   - Sender name: `Plurima`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: a chave copiada no item 5
   - **Save**.
7. Na mesma área (**Emails** → **Templates**), os textos dos e-mails vêm em inglês. Eu escrevo as
   versões em português no tom da marca; você só cola cada uma (confirmação de cadastro, link de
   acesso e troca de senha).

### Parte E — Me avise
Mande só: "configurei domínio, Supabase, Google, Facebook, LinkedIn e e-mail" (ou o que já estiver
pronto). **Não envie nenhuma chave.**

---

## O que eu construo (sem ação sua)

1. Botões Google, Facebook e LinkedIn nas telas de **cadastro** e **login** da plataforma.
2. O retorno do login, que cria a conta na primeira vez e entra nas seguintes.
3. O registro da origem de cada cadastro: página, variante, "onde conheceu" e UTMs — guardado no
   banco da plataforma, pronto para comparar as variantes.
4. A ligação das páginas com a plataforma: o formulário do fim de cada página e os botões
   "Testar grátis", "Cadastro" e "Login" passam a levar para o cadastro, já com a origem.
5. O cadastro por e-mail: a pessoa preenche nome, e-mail e WhatsApp na página, recebe um e-mail de
   confirmação e, ao clicar, entra na plataforma e define a senha.
6. Os modelos de e-mail em português (Parte D, item 7).

---

## Teste final (fazemos juntos)

Para cada caminho, eu confiro no banco se a origem foi gravada certo:

- [ ] Página inicial → Google → conta criada, origem `home`
- [ ] Landing page de comissão, variante A → Facebook → origem `comissao`, variante `A`
- [ ] Landing page de carteira, variante B → LinkedIn → origem `carteira`, variante `B`
- [ ] Qualquer página → e-mail → e-mail chega, link funciona, senha criada
- [ ] Botão **Login** do site → entrar com a conta criada acima, sem criar outra
- [ ] Mesmo e-mail por Google e por e-mail → continua sendo uma conta só

---

## Perguntas frequentes

**Se eu criar uma landing page nova, preciso configurar algo?**
Não. A página nova já nasce com o cadastro ligado. Ela só ganha uma identificação nova (ex.:
`lp=nova-dor`), que eu coloco ao gerar a página.

**Se eu mudar o domínio no futuro?**
Atualiza em três lugares: Supabase (Parte B), Google e LinkedIn (endereço da plataforma) e
Facebook (política de privacidade). O endereço de retorno do Supabase não muda.

**E se a pessoa se cadastrar pelo Google e depois tentar pelo e-mail?**
O Supabase reconhece o mesmo e-mail e mantém uma conta só.

**As chaves ficam onde?**
Só no painel do Supabase (e a do Resend, só no Supabase também). Nunca no site, no código ou no chat.
