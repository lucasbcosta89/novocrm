# DESIGN.md — Sistema de design da Plurima (site, blog e páginas públicas)

> Fonte única das decisões de design. Toda página pública (site, landing pages, blog,
> preços, cadastro, materiais) e toda tela do produto seguem este documento.
> Em caso de conflito entre gosto e este documento, vale o documento.
> Lente de trabalho: webdesigner experiente em ferramentas de uso intensivo —
> clareza, velocidade de leitura e previsibilidade acima de estética.

## Resumo (do usuário)
- O documento define princípios, cores, tipografia, espaçamento, componentes, estrutura de
  página, voz e restrições — o suficiente para qualquer página nova nascer consistente.
- As três regras que mais protegem a consistência: **azul só em ação, verde só em dinheiro,
  uma família tipográfica**.
- A estrutura de página é **fixa em ordem, variável em blocos** — páginas internas trocam o hero
  por `--fs-h1` e mantêm cabeçalho e rodapé idênticos.
- O **vocabulário do setor é obrigatório** e o vocabulário de software é proibido.

Referências: logos em `assets/brand/`, template em `docs/design/template-pagina-interna.html`.

## Objetivo das estruturas públicas
Atrair, reter e converter o maior número de leads (representantes comerciais multimarcas).
Cada página tem **um** objetivo de conversão principal e no máximo um secundário.

## Princípios que governam todas as decisões

### 1. Um produto, uma promessa
Toda página comunica a mesma coisa: **a Plurima consolida o que está disperso.**
- Se uma página nova não reforça essa promessa, ela está fora do sistema — não publica.
- Teste antes de publicar: "o que estava disperso e agora está junto?" precisa ter resposta
  visível nesta página (clientes, pedidos, representadas, comissões, catálogos, WhatsApp…).

### 2. Peso empresarial, execução leve
O representante é uma empresa, mas trabalha sozinho. A interface transmite solidez sem complexidade.
- Tipografia firme (pesos fortes em títulos, hierarquia nítida, poucos tamanhos).
- Muito espaço branco.
- **Nenhum ornamento**: sem gradientes decorativos, texturas, blobs, sombras dramáticas,
  ilustrações de enfeite ou elementos que não carregam informação.

### 3. O produto é o herói visual
- Telas reais do sistema valem mais que ilustrações.
- Ícones só entram quando não há tela que resolva.
- Screenshots usam dados realistas em pt-BR (nomes, CNPJs fictícios, valores em R$),
  nunca "Lorem ipsum" ou dados de demonstração genéricos.

### 4. Cor é função, não decoração
- **Azul = ação** (botões, links, elementos clicáveis, estado ativo). O foco de teclado é navy.
- **Verde = dinheiro positivo e confirmação** (comissão recebida, faturamento, crescimento,
  saldo positivo; "pedido enviado", "pagamento confirmado").
- **Nenhuma outra cor carrega significado.** Todo o resto é escala de neutros.
- Consequências práticas:
  - Azul não aparece em nada que não seja clicável.
  - Verde não aparece em nada que não seja valor monetário positivo (nem como "sucesso" genérico).
  - Alertas/erros obrigatórios do produto (ex.: validação de formulário) são exceção funcional
    mínima, a definir nas diretrizes de elementos — nunca usados em páginas de marketing como decoração.

## O que nunca fazer

### Lista (fonte da verdade — definida pelo usuário)
| # | Proibição | O que fazer no lugar | Como verificar |
|---|---|---|---|
| 1 | Gradiente em qualquer elemento | Cor sólida; separar por espaço ou alternância `--surface`/`--surface-alt`. Vale também para sombras coloridas, overlays e "fade" sobre screenshots | Buscar `gradient` no CSS/JSX: zero ocorrências |
| 2 | Mais de duas faixas navy na mesma página | O rodapé já é uma; sobra no máximo **uma** faixa navy no corpo (e nunca vizinha do rodapé — por isso o CTA final é `--surface-alt`) | Contar `.on-navy` + rodapé ≤ 2 |
| 3 | Verde em botão ou azul em valor financeiro | Botão é sempre azul (ou outline azul); valor financeiro positivo em `--green-text` (grande) ou `--ink` | Nenhum `.btn` com `--green`; nenhum valor `R$` com `--blue` |
| 4 | Duas famílias tipográficas | Só Inter (pesos 400/600/700) — inclusive em números, citações e logos de seção | Um único `font-family` no CSS público |
| 5 | Texto centralizado em parágrafo longo | Centralizar só até 3 linhas (faixa de identificação, CTA final); o resto à esquerda | Parágrafo centralizado > 3 linhas no celular = erro |
| 6 | Mais de um `--fs-display` por página | Hero com display; o resto começa em h2. Página interna nem tem display | Um único uso de `--fs-display` por rota |
| 7 | Ilustração genérica quando existe tela real do produto | Screenshot real com dados realistas pt-BR; ícone só quando não há tela | Toda imagem do corpo é tela do produto ou diagrama da virada |
| 8 | Depoimento inventado ou número sem fonte | Sem prova real, o bloco Prova é omitido. Todo número tem origem citável (dado do produto com data, pesquisa com link) | Cada número/depoimento tem fonte registrada no conteúdo |
| 9 | "Saiba mais" como texto de botão | Verbo + objeto que diz o que acontece ("Ver planos", "Começar teste grátis"). Vale para links também | Buscar "Saiba mais": zero ocorrências |
| 10 | Mais de três níveis de peso tipográfico em um mesmo bloco | O sistema só tem 3 pesos (400/600/700); num bloco, preferir 2 | Nenhum 300/500/800/900 no CSS público |

Qualquer item desta lista reprova a página na revisão, independentemente do resto.

## Estrutura padrão de página

### Ordem (fonte da verdade — definida pelo usuário)
Toda página do site segue esta ordem, mesmo que alguns blocos sejam omitidos:

1. **Cabeçalho** — sticky, 72px, logo colorida, "Entrar" e botão primário
2. **Hero** — display + lead + CTA + microcopy, com visual do produto à direita
3. **Faixa de identificação** — quem é o público, em uma linha
4. **Dor** — o problema nomeado com as palavras do cliente
5. **Virada** — como a Plurima resolve, com diagrama ou tela
6. **Como funciona** — três passos
7. **Prova** — depoimento, número ou autoridade
8. **Preço** — quando aplicável
9. **CTA final** — formulário mínimo
10. **Rodapé** — navy, logo branca, links mínimos

Páginas internas (funcionalidades, preços, sobre, blog) mantêm cabeçalho e rodapé idênticos e
substituem o hero por um `--fs-h1` com breadcrumb discreto.

Blocos podem ser omitidos; **nunca reordenados** nem inventados fora da lista (as únicas
adições são Destaque e FAQ nas páginas internas, ver abaixo). Um bloco novo que não caiba em
nenhum deles é sinal de que a página está fora da promessa.

### Especificação por bloco
| # | Bloco | Fundo | Layout (desktop) | Conteúdo e limites |
|---|---|---|---|---|
| 1 | Cabeçalho | `--surface`; ganha `border-bottom: 1px solid var(--border)` após rolar | Contêiner 1200; logo à esquerda, links `--fs-small` ao centro/esquerda, à direita link "Entrar" + `.btn--primary.btn--sm` | Máx. 5 links de navegação. Celular (64px): logo + botão sm + menu |
| 2 | Hero | `--surface` | Texto 5 col + produto 7 col | `display` (1 por página), `lead` ≤ 2 linhas, **1** botão primário, microcopy `--fs-small`/`--gray-600` abaixo ("sem cartão", etc.). Visual = tela real |
| 3 | Identificação | `--surface-alt` | 1 linha centralizada, padding vertical `--space-4` (faixa fina, exceção ao `--section-y`) | `--fs-lead`, `--ink`. Ex.: nomeia o representante multimarcas. Sem botão, sem ícone |
| 4 | Dor | `--surface` | Cabeçalho de seção + até 3 dores (3 × 4 col ou lista) | Frases na voz do cliente ("planilha de cada representada", "comissão que some"). Sem vermelho, sem ícones de alerta: o texto carrega a dor |
| 5 | Virada | `--surface-alt` | Cabeçalho + diagrama ou tela, 10–12 col | **O bloco da promessa**: o disperso (planilhas, PDFs, WhatsApp, cadernos) convergindo para uma tela da Plurima. Diagrama em neutros + navy; azul só se clicável |
| 6 | Como funciona | `--surface` | 3 × 4 col | Exatamente 3 passos; numeração `01 02 03` em `--fs-micro`; título h3 + 1 frase + recorte de tela opcional |
| 7 | Prova | `--surface-alt` | 3 × 4 col | Só prova real e verificável (depoimento com nome/cidade/nº de representadas, número do produto, autoridade). **Nunca inventar depoimento ou número**: sem prova real, o bloco é omitido |
| 8 | Preço | `--surface` | Ver grid de planos | Na home: resumo + link "Ver planos"; detalhe completo só em /precos |
| 9 | CTA final | Segue a alternância (nunca navy: colaria no rodapé) | 8 col centralizado; campos lado a lado no desktop | h2 curto + lead + formulário mínimo de **3 campos: Nome, E-mail, WhatsApp** (como no template) + botão `--block` + microcopy |
| 10 | Rodapé | `--navy`, texto branco / `--on-navy-muted` | Logo branca 4 col + grupos de links 2 col | Links mínimos: produto, preços, blog, contato, termos, privacidade (LGPD). Sem newsletter, sem redes decorativas |

**Alternância de fundo:** a tabela mostra a página completa. Quando um bloco é omitido, a
alternância `--surface` ↔ `--surface-alt` é recalculada sobre os blocos presentes (hero/topo
sempre branco). Duas faixas iguais nunca encostam — o CTA final pega o fundo que a sequência
pedir (no template, branco depois do FAQ em `--surface-alt`).

**Blocos de conteúdo das páginas internas** (do template): entre o topo e o CTA final, a
página interna usa os blocos 3–8 que se aplicarem e pode usar dois blocos extras, nesta ordem
relativa: **Destaque** (h2 + lead à esquerda, tela/painel do produto à direita, grid 6/6, em
`--surface-alt`) logo após o conteúdo principal, e **FAQ** (acordeão, 800px, antes do CTA
final). Cabeçalho, CTA final e rodapé são idênticos em todas as páginas.

### Páginas internas
```
Cabeçalho (idêntico)
  └ topo da página: padding-top --space-8, padding-bottom --space-6
      breadcrumb  (--fs-small, --gray-600, separador "›", último item sem link)
      h1          (--fs-h1, --space-2 abaixo do breadcrumb)
      lead        (opcional, --space-3 abaixo do h1)
Blocos 3–9 aplicáveis, na mesma ordem
Rodapé (idêntico)
```
- Breadcrumb: `<nav aria-label="Trilha">` + JSON-LD `BreadcrumbList` (SEO). Links do
  breadcrumb em `--gray-600`, azul só no hover — é navegação discreta, não ação principal.
- Sem `display` e sem visual de produto no topo; a primeira tela é título + contexto.
- Blog: o artigo usa o mesmo topo (breadcrumb "Início › Blog › Categoria") e termina sempre
  no bloco 9 (CTA final), que é onde o blog converte.

### Comportamento do cabeçalho
- `position: sticky; top: 0; z-index` acima do conteúdo; fundo `--surface` sólido (sem blur/transparência).
- Âncoras internas compensam a altura: `scroll-margin-top: calc(72px + var(--space-2))`.
- O botão primário do cabeçalho tem o mesmo texto do CTA do hero (uma promessa, um CTA).
- Logo colorida no cabeçalho; logo branca só no rodapé (fundo navy).

## Diretrizes por elemento
> Seção a ser preenchida com as diretrizes que o usuário enviar (uma subseção por elemento).
> Ao receber uma diretriz nova, registrar aqui — não em arquivos soltos.

### Cores

#### Tokens (fonte da verdade — definidos pelo usuário)
```css
:root {
  /* Marca */
  --navy: #1A3B73;        /* peso institucional: faixas escuras, rodapé, títulos fortes */
  --blue: #2962FF;        /* EXCLUSIVO: botões, links, foco, item ativo */
  --green: #00C853;       /* EXCLUSIVO: valor financeiro positivo, confirmação */

  /* Texto */
  --ink: #0F172A;         /* texto principal sobre fundo claro */
  --gray-600: #475569;    /* texto secundário, subheadlines, corpo de apoio */
  --gray-400: #94A3B8;    /* microcopy, legendas, labels, placeholder */

  /* Superfícies */
  --surface: #FFFFFF;
  --surface-alt: #F5F7FA; /* faixas alternadas, fundos de card secundário */
  --border: #E2E8F0;      /* divisórias, bordas de card, bordas de input */
}
```

#### Papéis
| Token | Pode | Não pode |
|---|---|---|
| `--navy` | Faixas escuras de seção, rodapé, títulos de alto peso | Botões, links, qualquer coisa clicável |
| `--blue` | Botão primário, link, item de menu ativo, borda de input focado | Títulos, ícones decorativos, fundos de seção, destaques de texto |
| `--green` | Valor monetário positivo, confirmação de ação | "Sucesso" genérico, selos, checkmarks de lista de features, decoração |
| `--ink` | Títulos e corpo sobre fundo claro | — |
| `--gray-600` | Subtítulo, corpo de apoio, legendas que precisam ser lidas | — |
| `--gray-400` | Placeholder, texto desabilitado, metadados não essenciais | Qualquer texto que o usuário precise ler para decidir (ver contraste) |
| `--surface` / `--surface-alt` | Alternância de faixas (branco → alt → branco) para ritmo sem ornamento | Gradientes entre as duas |
| `--border` | Divisórias, bordas de card e input | Bordas como enfeite |

Proporção-alvo numa página: ~85% neutros (surface, ink, cinzas), ~10% navy, ≤5% azul + verde.
Se o azul "aparece muito", há elementos azuis que não são ação — corrigir.

#### Contraste (WCAG 2.x, calculado)
| Combinação | Razão | Resultado |
|---|---|---|
| ink / surface | 17.85 | AAA |
| gray-600 / surface | 7.58 | AAA |
| navy / surface | 10.95 | AAA |
| blue / surface (link, texto) | 4.90 | AA |
| blue / surface-alt | 4.57 | AA (no limite) |
| branco / blue (texto do botão) | 4.90 | AA |
| **gray-400 / surface** | **2.56** | **Reprova** para texto |
| **green / surface** | **2.24** | **Reprova** como texto/ícone |
| branco / green | 2.24 | Reprova |
| ink / green | 7.98 | AAA |
| **blue / navy** | **2.24** | **Reprova** (link azul em faixa navy) |
| branco / navy | 10.95 | AAA |

#### Regras derivadas do contraste (aplicar sempre)
1. **Verde em texto só em tamanho grande** (≥ 24px, ou ≥ 18.67px em 700 — na prática `--fs-h3`
   ou maior: KPIs, preços, totais) **e no tom `--green-text: #007A33`** (5.48 sobre branco, 4.90
   sobre `--green-soft`). O `--green` puro `#00C853` reprova até em texto grande (2.24 < 3:1) e
   em gráfico que carrega informação (WCAG 1.4.11): só aparece como preenchimento acompanhado de
   rótulo em texto (barra com valor escrito, ponto ao lado da palavra) ou como fundo de selo com
   texto `--ink` (7.98). Valor positivo em tamanho pequeno fica em `--ink`; o sinal "+" e o rótulo
   carregam o sentido. Mesmo significado, apenas legibilidade — não é cor nova.
2. **`--gray-400` não é usado para labels de formulário nem legendas de screenshot** que
   precisam ser lidas: nesses casos usar `--gray-600`. `--gray-400` fica para placeholder,
   desabilitado e metadados dispensáveis. (Ajuste sobre a diretriz original, por acessibilidade.)
3. **Em faixa navy**: texto e links em branco (links sublinhados no hover); texto secundário em
   `--on-navy-muted: #C6CEDC` (branco 75%, 6.92). Botão primário continua azul com texto branco;
   link azul solto sobre navy é proibido.
4. **Estados do azul**: hover `--blue-hover: #1E4FD8` (6.61 sobre branco); fundo suave de botão
   secundário/item ativo `--blue-soft: #EAEFFF` com texto em `--blue-hover` (o `--blue` sobre esse
   fundo dá 4.27 e reprova em texto pequeno).
5. Foco: `outline: 2px solid var(--navy); outline-offset: 2px` em todo elemento interativo
   (ver Acessibilidade e performance). Em faixa navy, outline branco. Nunca remover o foco visível.

```css
:root {
  /* derivados — mesmo significado dos tokens de marca, só ajustam legibilidade/estado */
  --blue-hover: #1E4FD8;
  --blue-soft: #EAEFFF;
  --green-text: #007A33;
  --green-soft: #E0F8EA;
  --on-navy-muted: #C6CEDC;
  --border-input: #7B8798;   /* borda de controle de formulário (3:1, WCAG 1.4.11) */
  --error-text: #B42318;     /* só mensagem/borda de campo com erro */
}
```

#### Cores fora da paleta
- Erro de validação de formulário é a única exceção funcional prevista (vermelho, só no campo
  com erro + mensagem). Tom a definir junto com as diretrizes de formulário.
- Logos de marcas de terceiros (WhatsApp, representadas) aparecem nas cores originais, pequenos,
  e nunca transferem sua cor para a interface ao redor.

#### Divergência com o produto atual (pendência registrada)
`apps/web/src/app/globals.css` usa outra paleta (accent `#2563EB`, sidebar `#0A3D8C`, verde
`#16A34A`, além de violeta/ciano/rosa em KPIs, âmbar/vermelho em status e cores por tipo de
evento no calendário). As páginas públicas nascem nos tokens acima; a migração do app logado
para esta paleta é uma etapa separada, a planejar (as cores extras de categoria violam o
princípio "nenhuma outra cor carrega significado").

### Tipografia

#### Tokens (fonte da verdade — definidos pelo usuário)
```css
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  --fs-display: 3.5rem;   /* 56px — headline do hero, só uma por página */
  --fs-h1: 3rem;          /* 48px — título de página interna */
  --fs-h2: 2.5rem;        /* 40px — título de seção */
  --fs-h3: 1.5rem;        /* 24px — título de card, nome de plano */
  --fs-lead: 1.25rem;     /* 20px — subheadline, parágrafo de abertura */
  --fs-body: 1rem;        /* 16px — corpo padrão */
  --fs-small: 0.875rem;   /* 14px — apoio, links de navegação, microcopy */
  --fs-micro: 0.75rem;    /* 12px — labels, numeração, rodapé */
}
```
Uma família só (Inter). Nenhuma fonte de destaque, serifada ou manuscrita — a firmeza vem de
peso e tamanho, não de troca de família.

#### Pesos, entrelinha e espaçamento (complemento à escala)
| Token | Peso | Line-height | Letter-spacing | Cor padrão | Largura máx. |
|---|---|---|---|---|---|
| display | 700 | 1.05 | -0.03em | `--ink` (ou branco em navy) | ~16ch |
| h1 | 700 | 1.1 | -0.025em | `--ink` / `--navy` | ~20ch |
| h2 | 700 | 1.15 | -0.02em | `--ink` / `--navy` | ~24ch |
| h3 | 600 | 1.25 | -0.01em | `--ink` | — |
| lead | 400 | 1.5 | 0 | `--gray-600` | 52ch |
| body | 400 | 1.6 (blog: 1.7) | 0 | `--ink` (apoio: `--gray-600`) | 68ch |
| small | 400 / 500 em navegação | 1.5 | 0 | `--gray-600` | — |
| micro | 500 | 1.4 | 0.06em em CAIXA ALTA (eyebrow/label) | `--gray-600` | — |

- Só três pesos: **400** (texto), **600** (h3, ênfase, botões), **700** (display, h1, h2).
  Sem itálico decorativo, sem 300/800/900.
- Ênfase em corpo = 600, nunca cor (cor é função) nem sublinhado (sublinhado é link).
- `--navy` em títulos é opcional e para peso institucional; numa mesma seção, todos os títulos
  usam a mesma cor.
- Alinhamento à esquerda sempre; centralizado só em hero e CTA final (máx. 3 linhas).

#### Hierarquia por página
- **Uma `display` por página** (só a home e landing pages têm hero). Páginas internas abrem com `h1`.
- Um `h1` semântico por página (o display é o `<h1>` da home). Sem pular níveis (h2 → h4).
- Eyebrow (micro, caixa alta) acima de h2 para nomear a seção ("COMISSÕES", "PEDIDOS") —
  reforça o "o que estava disperso" em uma palavra. Opcional, nunca colorido de azul.
- Hero = display + lead + 1 CTA + microcopy. Nada mais acima da dobra além da tela do produto (ver Estrutura padrão de página).

#### Responsividade (escala fluida)
A escala é o valor de desktop (≥ 800px). Abaixo disso, os títulos encolhem com `clamp()` para
não quebrar palavras nem empurrar o CTA para fora da primeira tela no celular:
```css
:root {
  --fs-display: clamp(2.25rem, 5vw + 1rem, 3.5rem);    /* 36 → 56px */
  --fs-h1:      clamp(2rem,    4vw + 1rem, 3rem);      /* 32 → 48px */
  --fs-h2:      clamp(1.75rem, 3vw + 1rem, 2.5rem);    /* 28 → 40px */
  --fs-h3:      clamp(1.25rem, 1vw + 1rem, 1.5rem);    /* 20 → 24px */
  --fs-lead:    clamp(1.125rem, .5vw + 1rem, 1.25rem); /* 18 → 20px */
}
```
`body`, `small` e `micro` não escalam (16/14/12 fixos; 16px no input evita zoom no iOS).

#### Números e dinheiro
- Valores, tabelas, preços de plano e KPIs: `font-variant-numeric: tabular-nums` (dígitos
  alinhados — o produto é sobre números).
- Formato sempre pt-BR: `R$ 12.480,00`, `12,5%`, datas `05/11/2026`.
- Valor positivo em destaque (só tamanho grande, ≥ `--fs-h3`): peso 600–700 + `--green-text`; o símbolo `R$` pode ir em tamanho
  menor (≈ 0.6em) ao lado do número grande em KPIs e preços.

#### Carregamento da fonte
- Regra do usuário: `font-display: swap` e **preload apenas do peso 700** (o peso do `display`/h1,
  que é o elemento de LCP do hero).
- Por isso, Inter **estática** em 3 arquivos woff2 (400, 600, 700), subset latin, auto-hospedada
  em `/public/fonts` — não a variável (arquivo único inviabiliza o preload só do 700).
- `@font-face` próprio com `font-display: swap` para os três pesos; `<link rel="preload"
  as="font" type="font/woff2" crossorigin>` só para `inter-700.woff2` no `<head>` do layout
  público. (`next/font` faz preload de todos os pesos de uma chamada, por isso não é usado aqui.)
- Fallback métrico para evitar salto de layout no swap: `@font-face 'Inter Fallback'` sobre
  `local('Arial')` com `size-adjust`/`ascent-override` calibrados no build (medir CLS), e
  `--font-sans: 'Inter', 'Inter Fallback', -apple-system, …`.
- Nunca carregar Inter por `<link>` de fonts.googleapis.com (LGPD e um domínio a menos no LCP).

#### Regras derivadas de acessibilidade
1. `micro` (12px) nunca em `--gray-400`: usar `--gray-600` (7.58:1). `--gray-400` só em placeholder.
2. Nada abaixo de 12px. Texto de leitura contínua nunca abaixo de 16px.
3. Tamanhos em `rem` (respeita o zoom do usuário); nunca `px` em font-size.
4. Links de navegação em `small` precisam de área de toque ≥ 44px (padding, não fonte maior).

#### Divergência com o produto atual (pendência registrada)
O app logado usa `system-ui`, pesos 400/500 e títulos de 1.6rem. A escala acima é para as
páginas públicas; a do app (uso intensivo, telas densas) terá uma escala compacta própria,
derivada desta família e destes pesos — a definir na migração do app.

### Espaçamento e grid

#### Tokens (fonte da verdade — definidos pelo usuário)
```css
:root {
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  --space-5: 40px;
  --space-6: 48px;
  --space-8: 64px;
  --space-12: 96px;
}
```
Base 8. **Todo** margin, padding e gap sai desta escala — nenhum valor avulso (13px, 20px, 50px).
Não há 4px: gaps internos mínimos (ícone ↔ texto, label ↔ input) usam `--space-1`.
Alturas de componente (botão, input, header) também são múltiplos de 8: 40/48px, header 72px.

#### Regra de proximidade
Espaço dentro de um grupo < espaço entre grupos. Na prática, cada nível de agrupamento sobe
pelo menos um degrau da escala. Se dois blocos parecem "soltos" ou "grudados", o erro é de
degrau, não de pixel.

#### Ritmo vertical (desktop → celular)
| Uso | Desktop | < 640px |
|---|---|---|
| Padding vertical de seção (faixa) | `--space-12` 96 | `--space-8` 64 |
| Cabeçalho da seção (eyebrow+h2+lead) → conteúdo | `--space-8` 64 | `--space-6` 48 |
| Eyebrow → h2 | `--space-2` 16 | `--space-2` |
| h2/h1 → lead | `--space-3` 24 | `--space-2` |
| Lead → CTA | `--space-4` 32 | `--space-3` |
| Entre parágrafos | `--space-2` 16 | `--space-2` |
| Entre itens de lista | `--space-1` 8 | `--space-1` |
| Padding interno de card | `--space-4` 32 | `--space-3` 24 |
| Título do card → texto | `--space-1` 8 | `--space-1` |
| Gap entre cards | `--space-3` 24 | `--space-2` 16 |
| Entre campos de formulário | `--space-3` 24 | `--space-3` |
| Label → input | `--space-1` 8 | `--space-1` |
| Entre botões lado a lado | `--space-2` 16 | `--space-2` (empilham) |
| Altura do header (sticky) | 72px | 64px |
| Padding do rodapé | `--space-8` 64 | `--space-6` 48 |

Em CSS, os pares que mudam viram tokens semânticos (o componente usa o semântico, nunca o
breakpoint):
```css
:root {
  --section-y: var(--space-12);
  --section-head-gap: var(--space-8);
  --card-pad: var(--space-4);
  --grid-gap: var(--space-3);
  --page-x: var(--space-3);
}
@media (max-width: 639px) {
  :root {
    --section-y: var(--space-8);
    --section-head-gap: var(--space-6);
    --card-pad: var(--space-3);
    --grid-gap: var(--space-2);
    --page-x: var(--space-2);
  }
}
```

#### Grid
| Faixa | Largura | Colunas | Gutter | Margem lateral |
|---|---|---|---|---|
| Celular | < 640px | 4 | 16 | 16 |
| Tablet | 640–1023px | 8 | 24 | 24 |
| Desktop | ≥ 1024px | 12 | 24 | 24 (auto acima do contêiner) |

- Contêiner: `max-width: 1200px` de conteúdo, centralizado, com `--page-x` de margem lateral.
- Faixas de fundo (`--surface-alt`, `--navy`) vão de borda a borda; o conteúdo dentro delas
  respeita o contêiner.
- Texto corrido nunca ocupa a largura do contêiner: limite por `ch` (ver Tipografia),
  mesmo dentro de 12 colunas.

#### Layouts-padrão (desktop → celular)
| Bloco | Desktop (12 col) | Celular |
|---|---|---|
| Hero | Texto 5 col + tela do produto 7 col (o produto é o herói, ganha mais espaço) | Texto em cima, tela embaixo |
| Recurso (feature row) | 5/7 alternando lado a cada linha; texto sempre ao lado da tela correspondente | Empilha: texto → tela |
| Grade de cards | 3 × 4 col (ou 2 × 6) — nunca 4+ cards por linha com texto | 1 coluna |
| Planos/preços | 3 × 4 col (4 planos: 4 × 3 col) | 1 coluna, plano recomendado primeiro |
| Prova (números/depoimentos) | 3 × 4 col | 1 coluna |
| CTA final | 8 col centralizado | Largura total |
| Artigo do blog | 8 col centralizado (texto ≤ 68ch); imagens podem ir a 10 col | Largura total |
| Listagem do blog | 3 × 4 col | 1 coluna |
| Rodapé | Logo/descrição 4 col + 4 grupos de links 2 col | Grupos em 2 colunas |

#### Espaço branco como sistema
- Seções nunca são separadas por linha/divisor; separam-se por espaço e, quando preciso,
  alternância de fundo (`--surface` ↔ `--surface-alt`). Duas faixas `--surface-alt` nunca
  ficam vizinhas.
- Na dúvida entre dois degraus, escolher o maior.
- Uma ideia por seção. Se uma seção precisa de dois h2, são duas seções.

### Componentes

#### Botões

##### Base (fonte da verdade — definida pelo usuário)
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 16px 32px;
  font-size: var(--fs-body);
  font-weight: 600;
  line-height: 1;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: background .18s ease, transform .18s ease, box-shadow .18s ease;
}

.btn--primary { background: var(--blue); color: #fff; }
.btn--primary:hover { background: #1E4FD8; transform: translateY(-1px); box-shadow: 0 8px 24px -8px rgba(26,59,115,.12); }

.btn--outline { background: transparent; color: var(--blue); border: 1.5px solid var(--blue); }
.btn--outline:hover { background: rgba(41,98,255,.06); }

.btn--sm { padding: 10px 20px; font-size: var(--fs-small); border-radius: 999px; }
.btn--block { width: 100%; }
```

##### Complementos obrigatórios (estados e correções)
A base acima não define foco, pressionado, desabilitado, carregando nem variante sobre navy, e
tem dois desalinhamentos de medida. Implementação final = base + este bloco:
```css
/* 1. Borda transparente em todos: o outline (1.5px) deixa de ser 3px maior que o primário */
.btn { border: 1.5px solid transparent; min-height: 48px; gap: var(--space-1); text-decoration: none; }
.btn--outline { border-color: var(--blue); }

/* 2. sm: 10+14+10 = 34px fica abaixo do mínimo de toque; trava em 40px */
.btn--sm { min-height: 40px; }

/* 3. Foco visível (teclado) — nunca remover */
.btn:focus-visible { outline: 2px solid var(--navy); outline-offset: 2px; }

/* 4. Pressionado */
.btn--primary:active { transform: translateY(0); box-shadow: none; background: #1A44BD; }
.btn--outline:active { background: rgba(41,98,255,.12); }

/* 5. Desabilitado: sem hover, sem cor de ação (azul = ação; desabilitado não é ação) */
.btn:disabled, .btn[aria-disabled="true"] {
  background: var(--border); color: var(--gray-600); border-color: transparent;
  cursor: not-allowed; transform: none; box-shadow: none;
}

/* 6. Carregando: mantém a largura, troca o rótulo por spinner, bloqueia duplo clique */
.btn[aria-busy="true"] { pointer-events: none; color: transparent; position: relative; }
.btn[aria-busy="true"]::after {
  content: ""; position: absolute; width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid currentColor; border-right-color: transparent;
  color: #fff; animation: btn-spin .7s linear infinite;
}
.btn--outline[aria-busy="true"]::after { color: var(--blue); }
@keyframes btn-spin { to { transform: rotate(360deg); } }

/* 7. Sobre faixa navy: azul em navy reprova (2.24:1) */
.on-navy .btn--outline { color: #fff; border-color: #fff; }
.on-navy .btn--outline:hover { background: rgba(255,255,255,.08); }
.on-navy .btn:focus-visible { outline-color: #fff; }

/* 8. Movimento reduzido */
@media (prefers-reduced-motion: reduce) {
  .btn { transition: background .18s ease; }
  .btn--primary:hover { transform: none; }
}

/* 9. Celular: CTA principal ocupa a largura */
@media (max-width: 639px) { .hero .btn, .cta-final .btn { width: 100%; } }
```
Contraste verificado: branco/`--blue` 4.90, branco/hover `#1E4FD8` 6.63, `--blue` sobre o hover
do outline (6%) 4.62 — todos AA. O hover do token `--blue-hover` foi alinhado a `#1E4FD8`.

##### Hierarquia e uso
| Variante | Papel | Regra |
|---|---|---|
| `--primary` | A ação que converte (testar grátis, assinar, enviar formulário) | **Um por seção visível**; um só no hero. Dois primários lado a lado é proibido |
| `--outline` | Ação secundária ao lado do primário (ver demonstração, ver planos) | Sempre à direita/abaixo do primário; nunca sozinho como CTA principal |
| Link de texto | Ação terciária, com destino descrito ("Ver como funciona o controle de comissões", "Ler o artigo") | Azul, sem borda; sublinha no hover |
| `--sm` (pílula) | Somente header/navegação ("Entrar", "Testar grátis" no topo) | Nunca no corpo da página — o formato pílula marca "ação de navegação" |
| `--block` | Formulários e celular | Botão de envio de formulário é sempre `--block` |

- Não há variante verde, navy, cinza ou "ghost" decorativa. Ação é azul; ponto.
- Ícone dentro do botão: só seta "→" no fim do CTA principal ou ícone que muda o sentido
  (download, WhatsApp). 16px, `currentColor`, gap `--space-1`.

##### Texto do botão (microcopy)
- Verbo no infinitivo + objeto, 2 a 4 palavras: "Começar teste grátis", "Ver planos",
  "Falar no WhatsApp". Nunca "Clique aqui", "Enviar" ou "Saiba mais" — nem em botão, nem em
  link (o texto do link precisa dizer o destino; também é exigência de acessibilidade).
- O texto diz o que acontece depois do clique; se há custo zero/sem cartão, isso vai em
  microcopy logo abaixo (`--fs-small`, `--gray-600`), não dentro do botão.
- Mesmo CTA principal, mesmo texto, em todas as páginas (consistência = uma promessa).

- Formulários e captura de leads: _pendente_
- Navegação (header/footer): _pendente_
- Screenshots e mídia do produto: _pendente_
- Ícones: _pendente_
- Blog (listagem, artigo, leitura): _pendente_
### Voz e vocabulário

#### Regra (do resumo do usuário)
O **vocabulário do setor é obrigatório e o vocabulário de software é proibido** — é isso que
mantém a marca reconhecível em qualquer página.

#### Glossário
> A lista completa de termos não foi enviada. O que segue foi extraído do template do usuário
> e das convenções do produto; **substituir pela lista oficial quando chegar**.

| Use (setor) | Evite (software) |
|---|---|
| representada, marca | fornecedor, tenant, conta |
| lojista, cliente, carteira de clientes | lead, contato, base |
| pedido, mix, prazo, nota | registro, item, transação |
| comissão a receber / recebida / em atraso | receita, payout |
| devolução, custo de viagem, rota, visita | evento, atividade, ticket |
| resultado, lucro real, consolidado | dashboard, KPI, métrica |
| importar planilha, migração assistida | onboarding, integração, upload, sync |
| painel | interface, plataforma, solução |

- Frases curtas, voz ativa, segunda pessoa ("você"). O representante é tratado como empresa
  ("seu negócio de representação"), nunca como "usuário".
- Dizer o que o produto **não** faz quando evita frustração (o FAQ do template: não é ERP, não
  emite nota fiscal).
- Números sempre com fonte (ver O que nunca fazer, item 8).


## Marca (logo)

### Arquivos (em `assets/brand/`)
**Use sempre o SVG.** Os WebP são os originais enviados pelo usuário e ficam só como referência.

| Arquivo (SVG — oficial) | Uso |
|---|---|
| `plurima-logo-positivo.svg` | Símbolo colorido + "Plurima" em `--navy`, fundo transparente — fundo claro (cabeçalho) |
| `plurima-logo-negativo.svg` | Tudo branco, fundo transparente — rodapé e faixas navy |
| `plurima-simbolo-positivo.svg` | Só o símbolo colorido, transparente — favicon, avatar |
| `plurima-simbolo-negativo.svg` | Símbolo branco sobre quadrado `--navy` — ícone de app, redes sociais |

Como os SVG foram feitos (11/11/2026):
- **Símbolo:** redesenhado com geometria limpa a partir de `plurima-simbolo-positivo.webp` —
  círculos de verdade, eixo horizontal simétrico, linhas apontando para o centro com folga igual
  nas duas pontas. Cores exatas dos tokens: esquerda `--blue #2962FF`, centro e direita
  `--green #00C853`. O mesmo desenho é usado no logo completo (no WebP do logo completo o nó
  central era menor; padronizado pelo símbolo isolado).
- **Palavra "Plurima":** vetorizada por contorno do `plurima-logo-positivo.webp` (traçado
  automático, ~420 pontos). Proporção do original mantida: altura da palavra ≈ 0,51 × altura do
  símbolo. Se surgir o arquivo da fonte original, refazer a palavra a partir dela.

| Arquivo (WebP — referência) | Conteúdo |
|---|---|
| `plurima-logo-positivo.webp` | Logo colorido sobre branco |
| `plurima-logo-negativo.webp` | Logo branco sobre navy |
| `plurima-simbolo-positivo.webp` | Símbolo colorido sobre branco |
| `plurima-simbolo-negativo.webp` | Símbolo branco sobre navy |

O símbolo é a promessa desenhada: vários pontos (representadas) convergem para um centro e
saem consolidados.

### Regras
- **Logo colorida no cabeçalho, logo branca no rodapé** (Estrutura padrão). Altura: 32px no
  cabeçalho, 28px no rodapé (template).
- O azul e o verde do símbolo são **arte de marca**: a exceção única ao princípio "cor é
  função". Fora do logo, as regras de cor valem integralmente.
- A palavra "Plurima" do logo é arte (não texto vivo) e não conta como segunda família tipográfica.
- Área de proteção: no mínimo o diâmetro do nó central do símbolo em volta do logo.
  Tamanho mínimo: 24px de altura (símbolo) / 96px de largura (logo completo).
- Não recolorir, esticar, rotacionar, aplicar sombra/gradiente nem pôr sobre foto.

### Pendências da marca
1. ~~Vetor mestre (SVG)~~ — **resolvido (11/11/2026):** 4 SVG em `assets/brand/` (ver Arquivos).
2. ~~Duas versões do símbolo~~ — **decidido pelo usuário (05/11/2026): os arquivos de imagem são
   oficiais.** Símbolo oficial: 3 nós + linhas à esquerda em azul; nó central e 6 linhas + nós à
   direita em verde; cada linha tem a cor dos nós do seu lado. O SVG do template (nó central
   azul, linhas cinza `#94A3B8`) está **desatualizado** e não deve ser usado.
3. ~~Cores do símbolo ≠ tokens~~ — **resolvido:** os SVG usam `--blue #2962FF`,
   `--green #00C853` e `--navy #1A3B73` exatos.

## Template de página interna

Arquivo de referência: [`template-pagina-interna.html`](template-pagina-interna.html) (enviado
pelo usuário). As ~1.040 primeiras linhas são o "shell" genérico do gerador de artefatos (tokens
`--accent`, gráficos, tabelas) e **não fazem parte do design** — a página Plurima começa no
bloco `TOKENS` do segundo `<style>`.

### O que o template confirma
Tokens de cor e tipo, header sticky 72px, navegação **Funcionalidades · Preços · Sobre · Blog**
+ "Entrar" + "Testar grátis", topo interno com breadcrumb + h1 + lead, cards 3 colunas, bloco
Destaque com painel de KPIs, "Como funciona" em 3 passos, FAQ em acordeão, CTA final com
Nome/E-mail/WhatsApp e "Sem cartão de crédito", rodapé navy com links mínimos. Teste grátis de
**7 dias**.

### Divergências do template → como implementar
O DESIGN.md prevalece; ao portar o template para Next.js, corrigir:

| No template | Problema | Implementar |
|---|---|---|
| Inter via `fonts.googleapis.com`, pesos 400/500/600/700 | LGPD/LCP; peso 500 fora do sistema | Auto-hospedar 400/600/700, preload só 700 (Tipografia) |
| `.btn` pílula 44px, `--fs-small` em todo lugar | Contradiz a spec de botões | `.btn` 48px, raio 8px, `--fs-body`; pílula só `--sm` no header |
| Breadcrumb, labels de campo, `.label-micro` e microcopy em `--gray-400` | 2.56:1 reprova AA | `--gray-600` |
| Breadcrumb com separador `/` | — | `›` (convenção definida) |
| `.kpi .is-positive` em `--green` (#00C853) | 2.24:1 reprova até em texto grande | `--green-text` #007A33 |
| Ícones dos cards e números dos passos em `--blue` | Azul fora de ação | Ícones em `--navy` ou `--gray-600`; números em `--navy` |
| Rodapé: copyright em branco 48% | 3.80:1 reprova em 12px | `--on-navy-muted` #C6CEDC |
| Borda de input `--border` | 1.23:1, campo invisível (1.4.11) | `--border-input` #7B8798 |
| Inputs sem mensagem de erro | Regra de formulários | `aria-invalid` + texto em `--error-text` |
| `.section-title` centralizado | OK só até 3 linhas | Manter; lead do título ≤ 3 linhas |
| Header "Testar grátis" × CTA "Testar grátis por 7 dias" | Um CTA, um texto | Mesmo rótulo nos dois (ex.: "Testar grátis por 7 dias"; no header cabe só "Testar grátis" se faltar espaço no celular) |
| Painel de KPIs desenhado em HTML | Princípio 3 prefere tela real | Aceito como recorte fiel do produto, com dados realistas; trocar por screenshot quando houver |
| `html { scroll-behavior: smooth }` | — | OK, já anulado por reduced-motion |
| SVG inline do logo (nó central azul, linhas cinza, 5 nós à direita) | Versão não oficial do símbolo | Usar `assets/brand/plurima-logo-positivo.svg` no cabeçalho e `plurima-logo-negativo.svg` no rodapé |

## Acessibilidade e performance

### Regras (fonte da verdade — definidas pelo usuário)
- Contraste mínimo AA em todo texto. `--green` só em tamanho grande.
- Todo elemento interativo com `:focus-visible` de 2px em `--navy` e `outline-offset: 2px`.
- Formulários com `<label for>` associado, `autocomplete` correto e mensagem de erro em texto,
  não só em cor.
- Imagens em WebP, `loading="lazy"` exceto o visual do hero (`fetchpriority="high"`).
  Fontes com `font-display: swap` e preload apenas do peso 700.
- Respeitar `prefers-reduced-motion` em toda animação.

### Contraste
- AA = 4.5:1 para texto normal, 3:1 para texto grande (≥ 24px, ou ≥ 18.67px em 700) e para
  bordas/ícones que identificam um controle (WCAG 1.4.11).
- **Verde:** "tamanho grande" é necessário mas não suficiente — o `#00C853` dá 2.24:1 e reprova
  até em texto grande. Verde em texto = `--green-text` (#007A33) **e** tamanho ≥ `--fs-h3`.
  Detalhe em Cores › Regras derivadas do contraste, regra 1.
- **Borda de input:** `--border` (#E2E8F0) dá 1.23:1 e não identifica o campo. Inputs, selects,
  textareas e checkboxes usam `--border-input: #7B8798` (3.65:1 sobre branco, 3.40 sobre
  `--surface-alt`). `--border` continua para divisórias e cards (não são controles).
- Tabela de razões já calculadas: Cores › Contraste.

### Foco
```css
:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 2px;
}
.on-navy :focus-visible { outline-color: #fff; }   /* navy sobre navy some */
:focus:not(:focus-visible) { outline: none; }      /* mouse não ganha outline */
```
- Navy sobre `--surface` 10.95:1 e sobre `--surface-alt` 10.21:1 (passa 3:1 com folga).
- Input focado: o outline navy + borda em `--blue` (azul = controle ativo).
- Ordem de tabulação segue a ordem visual; link "Pular para o conteúdo" como primeiro item do
  cabeçalho (visível só no foco). Header sticky não pode cobrir o elemento focado
  (`scroll-padding-top: calc(72px + var(--space-2))` no `html`).

### Formulários
- Todo campo: `<label for="id">` visível (placeholder não substitui label).
- `autocomplete` correto: `name`, `email`, `tel` (WhatsApp), `organization`, `postal-code`, `new-password`/`current-password`; `type`/`inputmode` adequados (`email`, `tel`, `numeric` para CNPJ).
- Erro = texto + ícone + cor, nunca só cor:
  - mensagem abaixo do campo, ligada por `aria-describedby`; campo com `aria-invalid="true"`;
  - cor `--error-text: #B42318` (6.57:1 sobre branco, 6.13 sobre `--surface-alt`) — única cor
    fora da paleta, exceção funcional prevista em Cores; aparece só no campo com erro;
  - mensagem diz como corrigir ("Informe um e-mail no formato nome@empresa.com.br"), não só
    "campo inválido";
  - no envio com erro, foco vai para o primeiro campo inválido; resumo em `role="alert"` se houver 2+.
- Obrigatório marcado em texto ("obrigatório") ou, se todos forem, uma frase no topo; nunca só `*` vermelho.
- Validação no `blur` e no envio, não a cada tecla.

### Imagens e mídia
- Formato WebP (screenshots com `quality` alta — texto da tela precisa ficar nítido); servir 2×
  para telas retina via `srcset`/`sizes`.
- `loading="lazy"` + `decoding="async"` em todas, **exceto o visual do hero**:
  `fetchpriority="high"`, sem lazy (no Next.js: `<Image priority>`).
- `width`/`height` (ou `aspect-ratio`) sempre declarados — nenhum salto de layout.
- `alt` descreve o que a tela mostra ("Painel de comissões com total recebido no mês por
  representada"); imagem puramente decorativa não existe no sistema (princípio 3).
- Vídeo/GIF de produto: sem autoplay com som; com `prefers-reduced-motion: reduce`, mostrar o
  pôster estático.

### Fontes
`font-display: swap`; preload só de `inter-700.woff2`. Implementação em Tipografia › Carregamento
da fonte.

### Movimento
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; scroll-behavior: auto !important;
  }
}
```
- Regra global acima + cada componente remove `transform` de hover (ver Botões).
- Animação só comunica mudança de estado (hover, abrir, carregar). Sem parallax, sem
  animação de entrada ao rolar, sem contadores animados de números.

### Metas de performance (complemento)
| Métrica (p75, celular) | Meta |
|---|---|
| LCP | ≤ 2.5s (visual do hero ou headline) |
| CLS | ≤ 0.1 |
| INP | ≤ 200ms |
| JS da home | ≤ 100 KB gzip (páginas públicas são estáticas: SSG, sem JS de app) |

Scripts de terceiros (analytics, pixel, chat) carregam depois da interação ou com
`strategy="lazyOnload"`, e só após consentimento (LGPD). Lighthouse ≥ 90 em Performance e 100
em Acessibilidade como critério de pronto de cada página pública.

## Checklist de revisão (toda página/tela nova)
1. Reforça "a Plurima consolida o que está disperso"?
2. Há um único CTA principal claro (em azul)?
3. Existe algum ornamento sem função? Remover.
4. Alguma ilustração poderia ser substituída por tela real? Substituir.
5. Azul só em elementos clicáveis? Verde só em dinheiro positivo/confirmação, em texto só grande e em `--green-text`?
   Nenhum texto legível em `--gray-400`? Nenhum link azul sobre navy?
6. Espaço branco suficiente; hierarquia tipográfica legível em 3 segundos?
7. No máximo uma `display` na página, um `h1`, só pesos 400/600/700, números com `tabular-nums`?
8. Todo espaçamento sai da escala `--space-*`? Seções separadas por espaço (não por linha)?
   Conteúdo dentro do contêiner de 1200px e do grid?
9. Um botão primário por seção? Pílula só no header? Foco visível em todos os botões?
10. Blocos na ordem da Estrutura padrão (nenhum reordenado ou inventado)? Fundos alternando sem
    duas faixas iguais encostadas? Página interna com breadcrumb + h1 em vez de hero?
11. Foco navy 2px visível em tudo que é clicável? Campos com label, autocomplete e erro em texto?
    Imagens WebP com lazy (menos o hero)? Animações somem com reduced-motion? Lighthouse ≥ 90/100?
12. Nenhum item de "O que nunca fazer" presente? (um único item reprova a página)
