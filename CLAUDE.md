# CLAUDE.md — CRM Multimarcas (contexto global)

## Projeto
SaaS B2C brasileiro: CRM para representante comercial multimarcas (profissional liberal).
Stack: Next.js + TypeScript (web/API), React Native + Expo (app mobile), Supabase
(Postgres+Auth+Storage), BullMQ (filas), pdfmake (PDF), Meta Cloud API (WhatsApp),
Mercado Pago (assinaturas), Cloudflare (deploy/R2/domínio), GitHub (versionamento/CI).

## Serviços (contas ativas do usuário)
- GitHub: repo lucasbcosta89/novocrm. CI via GitHub Actions no push da main.
- Supabase: projeto ativo. Chaves em .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
- Cloudflare: domínio + R2 (bucket de arquivos/PDFs, egress grátis) + Pages (deploy do web/API
  com o adapter oficial do Next.js). CLI `wrangler` autenticado. R2 usa credenciais S3-compatíveis em .env.
- Mercado Pago: ACCESS_TOKEN e MP_WEBHOOK_SECRET em .env. Assinaturas via /preapproval (Fase 6).

## Regras permanentes
- TypeScript estrito. Valide input com Zod. API em rotas do Next.js.
- Toda credencial via .env (nunca hard-code; .env no .gitignore).
- Fonte única do banco: schema.sql na raiz. Alterou schema? `supabase db push`.
- Recurso limitado por plano SEMPRE passa pelo quota service (middleware verificarLimite) — nunca só pelo front.
- Todo webhook de pagamento: valida x-signature, responde 200 na hora, processa em fila com idempotência
  (PK em webhook_events).
- Fim de cada fase: commit + tag fase-N. Só avança quando o critério de pronto da fase está verde.
- Não pergunte ao usuário; execute com defaults sensatos. Responda apenas: arquivos alterados, erros, critério de pronto.

## Design (marca Plurima)
- Fonte única: docs/design/DESIGN.md. Leia antes de criar/alterar qualquer página pública
  (site, blog, landing, preços, cadastro) ou tela do produto.
- Resumo: promessa única "a Plurima consolida o que está disperso"; peso empresarial com
  execução leve (tipografia firme, muito branco, zero ornamento); telas reais > ilustrações;
  azul = ação, verde = dinheiro positivo, nenhuma outra cor com significado.
- Novas diretrizes de design do usuário vão para DESIGN.md, não para arquivos soltos.
- Nome da marca: "Plurima", sempre sem acento (mesmo onde o Brand Blueprint escreve "Plúrima").
- Favicon (símbolo preto, fundo transparente) em todas as páginas: apps/web/src/app/favicon.ico
  + icon.svg (convenção do Next — vale para toda rota nova sem código). Não remover, não duplicar
  com <link> manual ou metadata.icons. Mestres em assets/brand/. Detalhes em DESIGN.md › Marca.

## Comandos
- dev web: npm run dev | migração: supabase db push | status: supabase status
- deploy: push na main (GitHub Actions → Cloudflare Pages) | webhook local: wrangler tunnel (ou cloudflared)
- testes: npm test (vitest) — rode os da fase antes de declarar pronto.