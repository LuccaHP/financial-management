// Categorias padrão criadas para cada novo usuário.
// "Cartão de Crédito" é de sistema: usada nas transações de pagamento de fatura.

export const CARD_PAYMENT_CATEGORY = 'Cartão de Crédito'

export const DEFAULT_CATEGORIES: Array<{
  name: string
  type: 'despesa' | 'receita'
  color: string
  icon: string
  isSystem?: boolean
}> = [
  { name: 'Alimentação', type: 'despesa', color: '#ff9f1c', icon: 'utensils' },
  { name: 'Mercado', type: 'despesa', color: '#f4a261', icon: 'shopping-cart' },
  { name: 'Moradia', type: 'despesa', color: '#4d79ff', icon: 'home' },
  { name: 'Transporte', type: 'despesa', color: '#2ec4b6', icon: 'car' },
  { name: 'Saúde', type: 'despesa', color: '#ff4e4e', icon: 'heart-pulse' },
  { name: 'Educação', type: 'despesa', color: '#9b5de5', icon: 'graduation-cap' },
  { name: 'Lazer', type: 'despesa', color: '#ffd02e', icon: 'gamepad-2' },
  { name: 'Assinaturas', type: 'despesa', color: '#7678ed', icon: 'repeat' },
  { name: 'Vestuário', type: 'despesa', color: '#e76f51', icon: 'shirt' },
  { name: 'Viagem', type: 'despesa', color: '#00b4d8', icon: 'plane' },
  { name: 'Impostos e Taxas', type: 'despesa', color: '#6c757d', icon: 'landmark' },
  {
    name: CARD_PAYMENT_CATEGORY,
    type: 'despesa',
    color: '#14120d',
    icon: 'credit-card',
    isSystem: true,
  },
  { name: 'Outros', type: 'despesa', color: '#adb5bd', icon: 'tag' },
  { name: 'Salário', type: 'receita', color: '#1fc161', icon: 'banknote' },
  { name: 'Freelance', type: 'receita', color: '#80ed99', icon: 'laptop' },
  { name: 'Investimentos', type: 'receita', color: '#38b000', icon: 'trending-up' },
  { name: 'Reembolsos', type: 'receita', color: '#a7c957', icon: 'rotate-ccw' },
  { name: 'Outros', type: 'receita', color: '#adb5bd', icon: 'tag' },
]
