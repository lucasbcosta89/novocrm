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
- [x] Fase 4 — Oportunidades e desafios por cliente + plano de ação
  - [x] Bloco "Oportunidades e Desafios" na página do cliente (+ Novo, tabela tipo/título/prioridade/status/data/ações)
  - [x] Plano de ação em /app/clientes/:id/oportunidades/:opId (adicionar, concluir, editar, excluir ações)
  - [x] Atualização de status do item (lista e plano) + API /api/oportunidades, /api/acoes
  - [x] Checks de domínio no banco + RLS da representada opcional
  - [x] Critério verificado (cria item, abre plano, 2 ações, conclui 1)
- [x] Fase 5 — Comissão por produto
  - [x] Pedido + itens (API /api/pedidos + UI /app/pedidos/novo e /app/pedidos/:id), função SQL atômica criar_pedido
  - [x] Comissão por produto (produtos.comissao); snapshot % e R$ por item na confirmação; 1 linha em comissoes (vence fim do mês)
  - [x] /app/comissoes: resumo por representada, lançamentos, marcar recebida/atrasada, alerta de atrasadas
  - [x] Job diário pg_cron (06:00 BRT) marca a_receber vencida como atrasada
  - [x] Critério verificado (A R$600×5% + B R$400×10% = R$70 na representada; página bate)
- [x] Fase 6 — Planos, limites e assinatura Mercado Pago (checkout MP adiado — ver Pendências)
  - [x] Quota: usage mantido por triggers (inc/dec, mensais por YYYY-MM) + bloqueio no banco; verificarLimite nos POST (403 LIMITE_ATINGIDO, upgrade:true)
  - [x] GET /api/usage; banners "limite atingido — upgrade" + botões desabilitados + modal de planos
  - [x] /app/configurar: plano, uso/limites, checkout MP (POST /preapproval → init_point)
  - [x] Webhook /api/webhooks/mercadopago: x-signature, 200 imediato, fila webhook_events, worker (GET /v1/payments), idempotência, carência 7d (pg_cron)
  - [x] Seed de preços 49/89/149; usuário não altera o próprio plano
  - [ ] Configurar MP: MP_WEBHOOK_SECRET + webhook no painel + credenciais de teste → adiado (Pendências)
  - [ ] Critério: assinatura aprovada libera / modal leva ao checkout → adiado (deu "Mercado Pago indisponível")
- [x] Fase 7 — PDFs (relatórios e catálogos)
  - [x] Lib PDF (pdfmake, fontes Roboto embutidas): cabeçalho com logo, tabela com cabeçalho repetido, quebra de página, rodapé
  - [x] Relatório mensal (visitas, pedidos, comissões, positivação) e de comissões do período; catálogo com imagens, categorias e página por marca
  - [x] hash_cache (não regenera nem consome quota se nada mudou); geração em segundo plano (after); download autenticado
  - [x] /app/relatorios com quota pdf_mes; imagem e categoria de produto
  - [x] R2: bucket crm-arquivos + binding ARQUIVOS (arquivos antigos seguem lidos do Supabase Storage)
  - [x] Critério verificado (gera mensal e catálogo, baixa, regenera com cache)
- [ ] Fase 8 — WhatsApp, catálogo público e app offline
  - [x] Catálogo público /c/[slug] (abas por marca, categorias, carrinho) → pedido origem catalogo_web (rascunho no CRM)
  - [x] Meta Cloud API: webhook (hub.challenge + X-Hub-Signature-256), templates, janela 24h, conversas_whatsapp → quota conversas_mes
  - [x] Fluxos: envio de catálogo por marca, confirmação de pedido, follow-up pós-visita 15d (pg_cron → tarefa → WhatsApp); 3 templates no seed
  - [x] Fallback wa.me quando a Cloud API não está configurada
  - [x] App Expo (expo-sqlite) local-first: clientes, visitas, pedidos offline; sync push/pull por updated_at, UUID no cliente, LWW
  - [x] EAS: eas.json (perfil preview → APK)
  - [ ] Meta: credenciais WHATSAPP_* + templates aprovados no WhatsApp Manager
  - [ ] Build Android EAS (APK) → opcional: testes via Expo Go; builds de loja (Play/App Store) ficam para a publicação
  - [ ] Critério verificado (envia catálogo; pedido público chega no CRM; visita offline sincroniza)

## Pendências (fazer após a tag fase-8)
- [ ] Mercado Pago: corrigir "Mercado Pago indisponível" no checkout (ver log do POST /preapproval), configurar
      MP_WEBHOOK_SECRET + webhook no painel (eventos Pagamentos e Planos e assinaturas), secrets MP_* no GitHub,
      credenciais/usuários de teste (MP_TEST_PAYER_EMAIL) e validar: assinatura aprovada libera o plano.

Como rodar (toda sessão):
1. Terminal na pasta do projeto → digite: claude
2. Cole o preâmbulo + o prompt da fase atual
3. Leia o relatório final e confira o critério de pronto
4. Peça: "faça o commit e marque a fase no PROGRESSO.md"