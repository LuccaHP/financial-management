// Seed de demonstração: usuário demo com dados em todas as telas.
// Uso: pnpm db:seed  (requer o Postgres de dev rodando)
import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

const { db } = await import('../src/db')
const { auth } = await import('../src/lib/auth')
const schema = await import('../src/db/schema')
const { eq, and } = await import('drizzle-orm')
const { addMonths, currentMonthKey, dateInMonth } = await import(
  '../src/lib/dates'
)
const { invoiceMonthFor, installmentMonths } = await import(
  '../src/lib/invoice'
)
const { splitInstallments } = await import('../src/lib/money')

const DEMO_EMAIL = 'demo@deyno.app'
const DEMO_PASSWORD = 'deyno1234'

const [existing] = await db
  .select()
  .from(schema.user)
  .where(eq(schema.user.email, DEMO_EMAIL))
if (existing) {
  console.log(`Usuário demo já existe (${DEMO_EMAIL}). Nada a fazer.`)
  process.exit(0)
}

// se o sistema já tem usuários, o cadastro exige convite — cria um só para o seed
let inviteToken: string | undefined
const [anyUser] = await db.select({ id: schema.user.id }).from(schema.user).limit(1)
if (anyUser) {
  inviteToken = `seed-${crypto.randomUUID()}`
  await db.insert(schema.invites).values({
    token: inviteToken,
    createdBy: anyUser.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
}

// cria via better-auth para hashear a senha e seedar categorias
const signup = await auth.api.signUpEmail({
  body: {
    name: 'Demo Deyno',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    ...(inviteToken ? { inviteToken } : {}),
  } as never,
})
const userId = signup.user.id
console.log(`Usuário demo criado: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)

const category = async (name: string, type: 'despesa' | 'receita') => {
  const [row] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.userId, userId),
        eq(schema.categories.name, name),
        eq(schema.categories.type, type),
      ),
    )
  if (!row) throw new Error(`Categoria não encontrada: ${name}`)
  return row.id
}

const [nubank] = await db
  .insert(schema.accounts)
  .values({
    userId,
    name: 'Nubank',
    type: 'corrente',
    initialBalanceCents: 350000,
    color: '#9b5de5',
  })
  .returning()
const [carteira] = await db
  .insert(schema.accounts)
  .values({
    userId,
    name: 'Carteira',
    type: 'carteira',
    initialBalanceCents: 15000,
    color: '#ffd02e',
  })
  .returning()
const [poupanca] = await db
  .insert(schema.accounts)
  .values({
    userId,
    name: 'Poupança',
    type: 'poupanca',
    initialBalanceCents: 1200000,
    color: '#1fc161',
  })
  .returning()

const salario = await category('Salário', 'receita')
const mercado = await category('Mercado', 'despesa')
const alimentacao = await category('Alimentação', 'despesa')
const moradia = await category('Moradia', 'despesa')
const transporte = await category('Transporte', 'despesa')
const lazer = await category('Lazer', 'despesa')
const assinaturas = await category('Assinaturas', 'despesa')

const currentMonth = currentMonthKey()

// recorrentes: salário e aluguel com 3 meses de histórico (materializa no login)
await db.insert(schema.recurringRules).values([
  {
    userId,
    accountId: nubank.id,
    categoryId: salario,
    type: 'income',
    amountCents: 850000,
    description: 'Salário',
    dayOfMonth: 5,
    startMonth: addMonths(currentMonth, -3),
    nextOccurrenceMonth: addMonths(currentMonth, -3),
  },
  {
    userId,
    accountId: nubank.id,
    categoryId: moradia,
    type: 'expense',
    amountCents: 220000,
    description: 'Aluguel',
    dayOfMonth: 10,
    startMonth: addMonths(currentMonth, -3),
    nextOccurrenceMonth: addMonths(currentMonth, -3),
  },
])

// transações avulsas nos últimos 4 meses
const spread: Array<{
  categoryId: string
  description: string
  accountId: string
  base: number
  day: number
}> = [
  { categoryId: mercado, description: 'Mercado da semana', accountId: nubank.id, base: 42000, day: 3 },
  { categoryId: mercado, description: 'Feira', accountId: carteira.id, base: 8500, day: 8 },
  { categoryId: alimentacao, description: 'Almoço no trabalho', accountId: nubank.id, base: 12000, day: 12 },
  { categoryId: alimentacao, description: 'Delivery', accountId: nubank.id, base: 9500, day: 18 },
  { categoryId: transporte, description: 'Combustível', accountId: nubank.id, base: 28000, day: 15 },
  { categoryId: transporte, description: 'Uber', accountId: nubank.id, base: 4500, day: 22 },
  { categoryId: lazer, description: 'Cinema', accountId: carteira.id, base: 7000, day: 20 },
  { categoryId: assinaturas, description: 'Streaming', accountId: nubank.id, base: 5590, day: 6 },
  { categoryId: mercado, description: 'Mercado do mês', accountId: nubank.id, base: 61000, day: 25 },
]
const txValues = []
for (let offset = 3; offset >= 0; offset--) {
  const month = addMonths(currentMonth, -offset)
  for (const item of spread) {
    // variação determinística de ±15% por mês
    const factor = 1 + ((offset * 7 + item.day) % 30) / 100 - 0.15
    txValues.push({
      userId,
      accountId: item.accountId,
      categoryId: item.categoryId,
      type: 'expense' as const,
      amountCents: Math.round(item.base * factor),
      description: item.description,
      date: dateInMonth(month, item.day),
    })
  }
}
await db.insert(schema.transactions).values(txValues)

// cartão com compra 12x e compras à vista
const [card] = await db
  .insert(schema.creditCards)
  .values({
    userId,
    name: 'Nubank Crédito',
    limitCents: 800000,
    closingDay: 5,
    dueDay: 12,
    color: '#9b5de5',
  })
  .returning()

const notebookDate = dateInMonth(addMonths(currentMonth, -2), 15)
const firstMonth = invoiceMonthFor(notebookDate, card.closingDay)
const notebookTotal = 480000
const parts = splitInstallments(notebookTotal, 12)
const months = installmentMonths(firstMonth, 12)
const [notebook] = await db
  .insert(schema.cardPurchases)
  .values({
    userId,
    cardId: card.id,
    categoryId: lazer,
    description: 'Notebook',
    totalAmountCents: notebookTotal,
    installmentsCount: 12,
    purchaseDate: notebookDate,
    firstInvoiceMonth: firstMonth,
  })
  .returning()
await db.insert(schema.cardInstallments).values(
  parts.map((amountCents, index) => ({
    purchaseId: notebook.id,
    cardId: card.id,
    installmentNumber: index + 1,
    amountCents,
    invoiceMonth: months[index],
  })),
)

const jantarDate = dateInMonth(currentMonth, 2)
const jantarMonth = invoiceMonthFor(jantarDate, card.closingDay)
const [jantar] = await db
  .insert(schema.cardPurchases)
  .values({
    userId,
    cardId: card.id,
    categoryId: alimentacao,
    description: 'Jantar de aniversário',
    totalAmountCents: 18900,
    installmentsCount: 1,
    purchaseDate: jantarDate,
    firstInvoiceMonth: jantarMonth,
  })
  .returning()
await db.insert(schema.cardInstallments).values({
  purchaseId: jantar.id,
  cardId: card.id,
  installmentNumber: 1,
  amountCents: 18900,
  invoiceMonth: jantarMonth,
})

// orçamentos do mês corrente (Alimentação apertado para estourar)
await db.insert(schema.budgets).values([
  { userId, categoryId: mercado, month: currentMonth, limitCents: 120000 },
  { userId, categoryId: alimentacao, month: currentMonth, limitCents: 15000 },
  { userId, categoryId: transporte, month: currentMonth, limitCents: 50000 },
  { userId, categoryId: lazer, month: currentMonth, limitCents: 20000 },
])

// objetivos com aportes
const [viagem] = await db
  .insert(schema.goals)
  .values({
    userId,
    name: 'Viagem ao Japão',
    targetAmountCents: 1500000,
    targetDate: dateInMonth(addMonths(currentMonth, 14), 1),
    color: '#4d79ff',
  })
  .returning()
await db.insert(schema.goalContributions).values([
  { goalId: viagem.id, amountCents: 150000, date: dateInMonth(addMonths(currentMonth, -3), 6), note: 'Primeiro aporte' },
  { goalId: viagem.id, amountCents: 120000, date: dateInMonth(addMonths(currentMonth, -2), 6) },
  { goalId: viagem.id, amountCents: 130000, date: dateInMonth(addMonths(currentMonth, -1), 6) },
])
const [reserva] = await db
  .insert(schema.goals)
  .values({
    userId,
    name: 'Reserva de emergência',
    targetAmountCents: 3000000,
    targetDate: dateInMonth(addMonths(currentMonth, 24), 1),
    color: '#1fc161',
  })
  .returning()
await db.insert(schema.goalContributions).values([
  { goalId: reserva.id, amountCents: 500000, date: dateInMonth(addMonths(currentMonth, -3), 20), note: '13º' },
  { goalId: reserva.id, amountCents: 200000, date: dateInMonth(addMonths(currentMonth, -1), 20) },
])

// transferência de exemplo
const groupId = crypto.randomUUID()
await db.insert(schema.transactions).values([
  {
    userId,
    accountId: nubank.id,
    type: 'transfer_out',
    amountCents: 100000,
    description: 'Aporte na poupança',
    date: dateInMonth(currentMonth, 6),
    transferGroupId: groupId,
  },
  {
    userId,
    accountId: poupanca.id,
    type: 'transfer_in',
    amountCents: 100000,
    description: 'Aporte na poupança',
    date: dateInMonth(currentMonth, 6),
    transferGroupId: groupId,
  },
])

console.log('Seed concluído! Login: demo@deyno.app / deyno1234')
process.exit(0)
