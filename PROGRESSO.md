# PROGRESSO.md — CRM Multimarcas

Regra: só marcar [x] quando o critério de pronto da fase estiver verificado.
Toda fase termina com commit + tag no GitHub.

- [x] Fase 1 — Infra e esqueleto (conta, dashboard vazio, deploy automático)
  - [x] Monorepo pnpm (apps/web Next.js 16, apps/mobile Expo esqueleto)
  - [x] Auth Supabase email/senha + /app protegida por middleware
  - [x] Dashboard vazio + sidebar (6 seções)
  - [x] schema.sql aplicado no Supabase (RLS em todas as tabelas) + seed dos 3 planos
  - [x] CI (lint+tests) e deploy OpenNext → Cloudflare em .github/workflows/ci.yml
  - [x] Remote GitHub + secrets do Actions configurados e 1º deploy verde
  - [x] Signup/login verificados em produção
- [x] Fase 2 — Modelo multimarcas (representada, cliente, vínculo N:N, catálogo)
  - [x] Tabelas confirmadas + RLS por dono, slug único, CPF/CNPJ único por usuário, preço padrão único por produto
  - [x] CRUD representada (API /api/representadas + UI), slug automático, verificarLimite
  - [x] CRUD cliente (API /api/clientes + UI), verificarLimite
  - [x] Vincular cliente ↔ representadas (PUT /api/clientes/:id/representadas + UI multi-seleção)
  - [x] CRUD produto + tabela de preço padrão (/api/representadas/:id/produtos, /api/produtos/:id)
  - [x] Critério verificado em produção (A e B, cliente X vinculado às duas, sem duplicar)
- [x] Fase 3 — Carteira de clientes e gestão da representada (páginas separadas)
  - [x] /app/clientes/[id]: informações, vincular/desvincular, visitas, pedidos e oportunidades (leitura)
  - [x] /app/representadas/[id]: visão geral, catálogo, tabela de preços, pedidos, botão catálogo digital (placeholder)
  - [x] CRUD de visitas (UI + /api/clientes/:id/visitas, /api/visitas/:id)
  - [x] RLS por dono em todas as tabelas (billing/quota só leitura; webhook_events só service role)
  - [x] Critério verificado (cria cliente, abre, vincula a 2 representadas, registra visita)
- [ ] Fase 4 — Oportunidades e desafios por cliente + plano de ação
  - [x] Bloco "Oportunidades e Desafios" na página do cliente (+ Novo, tabela tipo/título/prioridade/status/data/ações)
  - [x] Plano de ação em /app/clientes/:id/oportunidades/:opId (adicionar, concluir, editar, excluir ações)
  - [x] Atualização de status do item (lista e plano) + API /api/oportunidades, /api/acoes
  - [x] Checks de domínio no banco + RLS da representada opcional
  - [ ] Critério verificado (cria item, abre plano, 2 ações, conclui 1)
- [ ] Fase 5 — Comissão por representada
- [ ] Fase 6 — Planos, limites e assinatura Mercado Pago
- [ ] Fase 7 — PDFs (relatórios e catálogos)
- [ ] Fase 8 — WhatsApp, catálogo público e app offline

Como rodar (toda sessão):
1. Terminal na pasta do projeto → digite: claude
2. Cole o preâmbulo + o prompt da fase atual
3. Leia o relatório final e confira o critério de pronto
4. Peça: "faça o commit e marque a fase no PROGRESSO.md"