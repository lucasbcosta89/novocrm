# Guia: login com Google, Facebook e LinkedIn na Plurima

Para quem não é programador. Você cria três "apps de login" (um em cada empresa) e cola as
chaves no Supabase. Nenhuma chave precisa ser enviada no chat: elas vão **só** para o Supabase.

> Este guia é a **Parte C** do [guia-cadastro.md](guia-cadastro.md). Comece por lá: ele explica que
> a configuração é feita **uma vez só** e vale para todas as páginas, para o cadastro e para o login.

Tempo estimado: Google 15 min · Facebook 20 min · LinkedIn 20 min (+ página da empresa, se não tiver).

---

## Antes de começar: dois endereços que você vai usar

**1. Endereço de retorno do Supabase** (é o mesmo nos três apps — copie exatamente):

```
https://axgbsafbevhzvasbkrkf.supabase.co/auth/v1/callback
```

**2. Endereço da plataforma** (onde você faz login hoje). Para achar:
Cloudflare → **Workers & Pages** → clique em **crm-multimarcas** → o endereço aparece no topo
(algo como `https://crm-multimarcas.SEU-NOME.workers.dev`). Anote-o; abaixo ele aparece como
`ENDEREÇO-DA-PLATAFORMA`.

A política de privacidade já existe em: `ENDEREÇO-DA-PLATAFORMA/politica-de-privacidade`.

---

## Passo 0 — Supabase: dizer para onde voltar depois do login (5 min)

1. Entre em **supabase.com** → abra o projeto da Plurima.
2. Menu da esquerda: **Authentication** → **URL Configuration**.
3. **Site URL:** cole `ENDEREÇO-DA-PLATAFORMA`.
4. **Redirect URLs** → **Add URL** e adicione as duas linhas abaixo (uma de cada vez):
   - `ENDEREÇO-DA-PLATAFORMA/**`
   - `http://localhost:3000/**` (usado só nos testes no computador)
5. **Save**.

---

## Passo 1 — Google (15 min)

1. Entre em **console.cloud.google.com** com a conta Google que vai ser dona do app.
2. No topo, ao lado do logo do Google Cloud, clique no seletor de projeto → **Novo projeto** →
   nome **Plurima** → **Criar**. Confirme que o projeto Plurima está selecionado no topo.
3. Menu (☰) → **APIs e serviços** → **Tela de consentimento OAuth** (pode aparecer como
   **Google Auth Platform**) → **Começar**.
   - Nome do app: **Plurima**
   - E-mail de suporte: seu e-mail
   - Público: **Externo**
   - E-mail de contato: seu e-mail → aceite os termos → **Criar**.
   - **Não envie logotipo agora** (logotipo exige uma revisão do Google que pode levar dias).
4. Ainda ali, vá em **Clientes** → **Criar cliente**:
   - Tipo de aplicativo: **Aplicativo da Web**
   - Nome: **Plurima web**
   - **Origens JavaScript autorizadas** → Adicionar URI: `ENDEREÇO-DA-PLATAFORMA`
   - **URIs de redirecionamento autorizados** → Adicionar URI: o endereço de retorno do Supabase
     (`https://axgbsafbevhzvasbkrkf.supabase.co/auth/v1/callback`)
   - **Criar**.
5. Aparece uma janela com **ID do cliente** e **Chave secreta do cliente**. Deixe aberta.
6. Em **Público**, clique em **Publicar app** → confirme. (Sem isso, só e-mails de teste conseguem entrar.)
7. Em outra aba, no **Supabase**: **Authentication** → **Sign In / Providers** → **Google** →
   ligue **Enable** → cole o **ID do cliente** em *Client IDs* e a **chave secreta** em
   *Client Secret* → **Save**.

---

## Passo 2 — Facebook / Meta (20 min)

1. Entre em **developers.facebook.com** com seu Facebook → **Meus apps** → **Criar app**.
   (Se pedir, aceite virar desenvolvedor da Meta.)
2. Detalhes: nome **Plurima**, e-mail de contato → **Avançar**.
3. Caso de uso: **Autenticar e solicitar dados de usuários com o Login do Facebook** → **Avançar**.
4. Portfólio empresarial: pode escolher **Não quero conectar um portfólio agora** → **Avançar** →
   **Criar app** (vai pedir sua senha do Facebook — digite você mesmo).
5. No painel do app: **Casos de uso** → em *Login do Facebook*, clique em **Personalizar**:
   - Em **Permissões**, adicione **email** (o *public_profile* já vem).
   - Em **Configurações**: **URIs de redirecionamento do OAuth válidos** → cole o endereço de
     retorno do Supabase → **Salvar alterações**.
6. **Configurações do app** → **Básico**:
   - **URL da Política de Privacidade:** `ENDEREÇO-DA-PLATAFORMA/politica-de-privacidade`
   - **URL das instruções de exclusão de dados:** o mesmo endereço da política
   - **Categoria:** Negócios e páginas → **Salvar alterações**.
   - Copie o **ID do app** e clique em **Mostrar** para ver a **Chave secreta do app**.
7. No topo do painel, mude o **Modo do app** de *Desenvolvimento* para **Ao vivo** (ou
   **Publicar**). Sem isso, só você consegue entrar.
8. No **Supabase**: **Authentication** → **Sign In / Providers** → **Facebook** → **Enable** →
   *Client ID* = **ID do app**, *Client Secret* = **Chave secreta do app** → **Save**.

### Facebook não aceita os endereços? Siga esta lista, na ordem

A Meta confere os endereços em **quatro lugares diferentes**. Se faltar um, ela recusa. Vá de um em
um e marque.

**1. Os endereços em si (o erro mais comum)**
- Comece sempre com `https://` (com o **s**).
- Sem espaço no começo ou no fim. Dica: cole primeiro no Bloco de Notas, apague os espaços e copie
  de lá.
- Sem barra no fim do endereço de retorno. O certo é exatamente:
  `https://axgbsafbevhzvasbkrkf.supabase.co/auth/v1/callback`
- Teste a política de privacidade: abra `ENDEREÇO-DA-PLATAFORMA/politica-de-privacidade` numa
  **janela anônima** do navegador. Se a página não abrir para você, a Meta também não consegue.

**2. Domínios do app** — *Configurações do app* → **Básico**
- No campo **Domínios do app**, digite e tecle Enter depois de cada um (cada domínio vira uma
  "etiqueta"):
  - `axgbsafbevhzvasbkrkf.supabase.co`
  - o domínio da plataforma **sem** `https://` e sem nada depois da barra
    (ex.: `app.seudominio.com.br` ou `crm-multimarcas.seu-nome.workers.dev`)
- Role até o fim da página → **+ Adicionar plataforma** → **Site** → em **URL do site**, cole
  `ENDEREÇO-DA-PLATAFORMA` (com `https://`).
- Confira também **URL da Política de Privacidade** e **URL das instruções de exclusão de dados**
  (passo 6 acima) → **Salvar alterações** no rodapé.

**3. Endereço de retorno** — *Casos de uso* → **Autenticação e criação de conta** (pode aparecer
como "Login do Facebook") → **Personalizar** → **Configurações** (na lateral, ou em
"Ir para as configurações")
- **Login no OAuth do cliente:** Sim
- **Login do OAuth na Web:** Sim
- **Forçar HTTPS:** Sim
- **URIs de redirecionamento do OAuth válidos:** cole o endereço de retorno do Supabase e tecle
  **Enter** (ele precisa virar uma "etiqueta"; se ficar só como texto, não salva).
- **Salvar alterações** no rodapé da página.
- Opcional, para conferir: no **Validador de URI de redirecionamento**, na mesma tela, cole o
  endereço de retorno → **Verificar URI**. Tem que aparecer em verde.

**4. Modo do app** — topo do painel
- Mude de **Desenvolvimento** para **Ao vivo** (ou clique em **Publicar**). Se a Meta não deixar
  publicar, ela mostra o que falta — quase sempre é a política de privacidade, a categoria ou o ícone
  do app (envie `assets/brand/plurima-simbolo-positivo.webp` em *Configurações do app → Básico →
  Ícone do app*).

**Se não achar "Login do Facebook":** o app pode ter sido criado como tipo **Empresa** (aparece
"Login do Facebook para empresas", com outras opções). Nesse caso é mais rápido criar um app novo:
**Meus apps → Criar app → caso de uso "Autenticar e solicitar dados de usuários com o Login do
Facebook"** e repetir o Passo 2. Depois, apague o app antigo em *Configurações do app → Avançado →
Excluir app*.

**Qual mensagem você vê?**
| Mensagem | Onde resolver |
|---|---|
| "Não é possível carregar a URL: o domínio dessa URL não está incluído nos domínios do app" | Item 2 (Domínios do app e plataforma Site) |
| "URL bloqueada: o redirecionamento falhou porque o URI não está na lista de permissões" | Item 3 (URIs de redirecionamento) |
| "URL inválida" ao salvar a política de privacidade | Item 1 (abrir a página em janela anônima) |
| "O app não está ativo" / "Recurso indisponível" ao testar com outra conta | Item 4 (modo Ao vivo) |
| Funciona para você, mas não para outras pessoas | Item 4 (modo Ao vivo) |

---

## Passo 3 — LinkedIn (20 min)

O LinkedIn exige uma **Página de empresa** da Plurima. Se ainda não tiver:
LinkedIn → **Para empresas** (ícone de grade, canto superior direito) → **Criar uma página da
empresa** → Empresa → nome **Plurima**, endereço `linkedin.com/company/plurima` (ou o disponível)
→ crie. Você precisa ser administrador dela.

1. Entre em **linkedin.com/developers** → **Create app**.
   - App name: **Plurima**
   - LinkedIn Page: escolha a página **Plurima**
   - Privacy policy URL: `ENDEREÇO-DA-PLATAFORMA/politica-de-privacidade`
   - App logo: envie o símbolo da Plurima (arquivo `assets/brand/plurima-simbolo-positivo.webp`)
   - Marque o termo → **Create app**.
2. Aba **Settings** → em *App settings*, clique em **Verify** → **Generate URL** → abra o link
   gerado (logado como administrador da página) → **Verify**.
3. Aba **Products** → em **Sign In with LinkedIn using OpenID Connect**, clique em
   **Request access** → aceite. (É liberado na hora.)
4. Aba **Auth**:
   - Em **OAuth 2.0 settings** → **Authorized redirect URLs for your app** → lápis ✏️ →
     **Add redirect URL** → cole o endereço de retorno do Supabase → **Update**.
   - Copie o **Client ID** e o **Primary Client Secret** (ícone de olho para ver).
5. No **Supabase**: **Authentication** → **Sign In / Providers** → **LinkedIn (OIDC)** →
   **Enable** → cole o *Client ID* e o *Client Secret* → **Save**.

---

## Quando terminar

Me avise só com "configurei Google / Facebook / LinkedIn" (sem colar nenhuma chave). Do meu lado:
- coloco os botões na tela de login e cadastro da plataforma;
- crio o retorno do login e o registro da origem do cadastro (`lp`, `variante`, `origem`, UTMs);
- ligo os botões do site e das landing pages à plataforma;
- testo cada provedor com você.

## Se algo der errado

| Mensagem | O que fazer |
|---|---|
| "redirect_uri_mismatch" (Google) | O endereço de retorno no Google está diferente do Supabase. Copie de novo, sem espaço no fim. |
| "URL bloqueada" / "Can't load URL" (Facebook) | Falta o endereço de retorno em *URIs de redirecionamento do OAuth válidos*. |
| "The redirect_uri does not match" (LinkedIn) | Falta o endereço de retorno na aba **Auth**. |
| Só você consegue entrar | Faltou **Publicar app** (Google) ou mudar para **Ao vivo** (Facebook). |
| Volta para a página errada depois do login | Revise o **Passo 0** no Supabase. |

Segurança: as chaves secretas ficam só no Supabase. Não envie por chat, e-mail ou WhatsApp.
Se alguma vazar, gere outra no próprio site (Google, Meta ou LinkedIn) e atualize o Supabase.
