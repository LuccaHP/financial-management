# Deyno — Finanças Pessoais

Sistema de finanças pessoais multiusuário em pt-BR, estilo **neobrutalism**:

- **Transações** — despesas, receitas e transferências entre contas, com filtros por mês/conta/categoria/busca
- **Contas** — carteira, corrente, poupança e investimentos com saldos computados
- **Cartões de crédito** — compras parceladas (até 24x), fatura mensal com fechamento/vencimento, pagamento debitando uma conta
- **Recorrentes** — salário, aluguel e assinaturas lançados automaticamente todo mês (idempotente, com backfill)
- **Orçamentos** — limite por categoria/mês com barra de progresso e alerta de estouro
- **Objetivos** — metas com aportes manuais e projeções (quanto poupar/mês e previsão pelo ritmo atual)
- **Dashboard** — KPIs, pizza por categoria, receitas × despesas, evolução de saldo
- **CSV** — export por mês e import com preview e validação por linha
- **Multiusuário** — login com senha hasheada (better-auth/scrypt), cadastro **somente por convite**; o primeiro usuário vira admin
- **Dark mode** — tema claro/escuro persistido em cookie (sem flash)

Stack: TanStack Start (React) · PostgreSQL 17 · Drizzle ORM · better-auth · Tailwind v4 · Recharts.

## Desenvolvimento local

Requisitos: Node 22+, pnpm, Docker.

```bash
cp .env.example .env.local        # preencha BETTER_AUTH_SECRET (openssl rand -hex 32)
docker compose -f docker-compose.dev.yml up -d   # Postgres em localhost:5436
pnpm install
pnpm db:migrate                   # aplica as migrations
pnpm dev                          # http://localhost:3005
```

Primeiro acesso: `http://localhost:3005/registrar` cria a conta de administrador.

Opcional — dados de demonstração em todas as telas:

```bash
pnpm db:seed                      # cria demo@deyno.app / deyno1234
```

Testes e checagens:

```bash
pnpm test                         # vitest (dinheiro, datas, fatura, recorrência, CSV)
npx tsc --noEmit                  # typecheck
```

## Deploy (Docker + Cloudflare Tunnel)

O compose de produção sobe **app (host 3002) + Postgres (interno) + cloudflared**.
As portas foram escolhidas para não conflitar com os containers existentes do
servidor (3000/3001/3333/8080/9999 e 5433–5435 ocupadas).

1. No Cloudflare Zero Trust, crie um túnel e aponte o hostname para
   `http://app:3000`. Copie o token.
2. No servidor:

```bash
cp .env.example .env              # preencha POSTGRES_PASSWORD, BETTER_AUTH_SECRET,
                                  # PUBLIC_URL e CLOUDFLARE_TUNNEL_TOKEN
docker compose up -d --build
```

As migrations rodam automaticamente no boot do container. O app também fica
acessível em `http://localhost:3002` no servidor.

3. Acesse `https://SEU_DOMINIO/registrar` e crie o primeiro usuário (admin).
   Novos usuários entram apenas por link de convite gerado em **Usuários**.

## Estrutura

```
src/
├── routes/            # páginas (TanStack Router file-based)
│   ├── login.tsx  registrar.tsx  api/auth/$.ts
│   └── _app/          # área autenticada (dashboard, transações, contas…)
├── functions/         # server functions (createServerFn) por domínio
├── db/schema/         # schema Drizzle (auth, finance, cards, planning, invites)
├── lib/               # lógica pura testada: money, dates, invoice, recurring, csv, goals
└── components/        # UI neobrutalism (ui/), gráficos, layout
drizzle/               # migrations SQL
scripts/               # migrate.mjs (boot) e seed.ts (demo)
```

Decisões de modelagem:

- Dinheiro é **inteiro em centavos** (`bigint`); meses são strings `YYYY-MM`.
- Saldo de conta é computado (saldo inicial + soma assinada das transações).
- Transferência = par de transações ligadas por `transfer_group_id`.
- Recorrências materializam on-request no layout autenticado; um índice único
  parcial `(recurring_rule_id, occurrence_month)` garante idempotência.
- Compra no cartão **não** afeta saldo; o pagamento da fatura cria a despesa.
  Apagar a transação de pagamento reabre a fatura (FK `ON DELETE CASCADE`).
- Fechamento: compra no dia do fechamento ou depois cai na fatura seguinte.
