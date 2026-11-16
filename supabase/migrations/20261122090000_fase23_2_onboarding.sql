-- FASE 23.2 — Passo a passo do primeiro login: só o estado de progresso do onboarding (nenhum dado de negócio).
-- Decisões: progresso no BANCO (usuarios), para não repetir em outro navegador; tour próprio e leve (sem dependência);
-- os passos navegam para as rotas reais. RLS existente de usuarios (própria linha); grants por coluna.
alter table usuarios
  add column onboarding_concluido boolean not null default false,
  add column onboarding_etapa int not null default 0 constraint usuarios_onboarding_etapa_check check (onboarding_etapa between 0 and 6),
  add column onboarding_pulado boolean not null default false,
  add column onboarding_visto_em timestamptz;
grant select (onboarding_concluido, onboarding_etapa, onboarding_pulado, onboarding_visto_em),
      update (onboarding_concluido, onboarding_etapa, onboarding_pulado, onboarding_visto_em) on usuarios to authenticated;
