# MEI Finanças — Projeto SaaS

## Sobre
App de gestão financeira para MEIs no Brasil. Separação PJ/PF, DAS automático, pró-labore, metas, relatórios e DRE.

## Infraestrutura
- **GitHub**: `spoliagency/mei_finance`
- **Vercel project**: `mei-finances` (team: `spoli-agencys-projects`)
- **Domínio**: meifinancas.app
- **Deploy**: push na `main` → Vercel auto-deploy em produção

## Stack
- React + JSX (sem TypeScript no momento)
- Vite (bundler)
- Tailwind CSS v4
- Supabase (auth + banco de dados)
- Stripe (pagamentos)
- Vercel (deploy)

## Estrutura principal
- `src/App.jsx` — Componente principal com dashboard, rotas e toda a lógica do app
- `src/AuthPage.jsx` — Tela de login/cadastro (split layout: dark brand + light form)
- `src/ConfigPage.jsx` — Página de configurações (recebe props: exportToCSV, exportToPDF)
- `src/index.css` — Estilos globais e variáveis CSS (temas light/dark)

## Identidade visual
- Fundo escuro: `#0a0a0a`
- Verde primário: `#4BE277`
- Tipografia: Syne (bold/italic para títulos)
- Login: painel esquerdo dark com features + painel direito light com formulário
- Dashboard: tema dark/light com variáveis CSS

## Decisões recentes
- **2026-03-22**: Redesign da tela de login (dark/light split, ícones SVG profissionais)
- **2026-03-22**: Removida borda branca da página de login, corrigido scroll
- **2026-03-22**: ConfigPage recebe exportToCSV/exportToPDF como props
- **2026-03-22**: Removidas estrelas ✨ dos greetings do dashboard

## Regras
- Commits com `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Nunca commitar `.env` ou credenciais
- Deploy direto: merge na main + push (sem PR)
- Responder sempre em português brasileiro
