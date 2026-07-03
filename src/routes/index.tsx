import { createFileRoute } from '@tanstack/react-router'
import { ThemeToggle } from '#/components/theme-toggle'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input, Label } from '#/components/ui/input'
import { Progress } from '#/components/ui/progress'
import { Select } from '#/components/ui/select'
import { formatCentavos } from '#/lib/money'

export const Route = createFileRoute('/')({ component: Home })

// Página temporária de verificação do design system — vira o dashboard na fase 9.
function Home() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl uppercase">
          Deyno<span className="text-primary">.</span>
        </h1>
        <ThemeToggle />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button>Nova transação</Button>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="income">Receita</Button>
        <Button variant="danger">Excluir</Button>
        <Button variant="ghost">Ghost</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="income">Receita</Badge>
        <Badge variant="expense">Despesa</Badge>
        <Badge variant="warn">80% do orçamento</Badge>
        <Badge variant="accent">Recorrente</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saldo total</CardTitle>
          <Badge variant="income">+12%</Badge>
        </CardHeader>
        <CardContent>
          <p className="font-money text-3xl font-bold text-income">
            {formatCentavos(1234567)}
          </p>
          <div className="mt-4 space-y-2">
            <Progress value={45} tone="income" />
            <Progress value={85} tone="warn" />
            <Progress value={100} tone="expense" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="desc">Descrição</Label>
            <Input id="desc" placeholder="Mercado da semana" />
          </div>
          <div>
            <Label htmlFor="cat">Categoria</Label>
            <Select id="cat">
              <option>Alimentação</option>
              <option>Transporte</option>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
