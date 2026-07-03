import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Archive, ArchiveRestore, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CategoryIcon } from '#/components/category-icon'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Dialog } from '#/components/ui/dialog'
import { FieldError, Input, Label } from '#/components/ui/input'
import { Select } from '#/components/ui/select'
import {
  createCategoryFn,
  deleteCategoryFn,
  updateCategoryFn,
} from '#/functions/categories.fn'
import { cn } from '#/lib/cn'
import { categoriesQuery } from '#/lib/queries'

export const Route = createFileRoute('/_app/categorias')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(categoriesQuery),
  component: CategoriasPage,
})

type Category = Awaited<
  ReturnType<typeof import('#/functions/categories.fn').listCategoriesFn>
>[number]

const ICON_OPTIONS = [
  'tag',
  'utensils',
  'shopping-cart',
  'home',
  'car',
  'heart-pulse',
  'graduation-cap',
  'gamepad-2',
  'repeat',
  'shirt',
  'plane',
  'landmark',
  'credit-card',
  'banknote',
  'laptop',
  'trending-up',
  'rotate-ccw',
  'gift',
  'paw-print',
  'baby',
  'dumbbell',
  'music',
  'book-open',
  'wrench',
]

function CategoriasPage() {
  const { data: categories } = useSuspenseQuery(categoriesQuery)
  const [tab, setTab] = useState<'despesa' | 'receita'>('despesa')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const visible = categories.filter((category) => category.type === tab)

  return (
    <div>
      <PageHeader
        title="Categorias"
        subtitle="Organize suas despesas e receitas"
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Nova categoria
          </Button>
        }
      />

      <div className="mb-4 flex gap-2">
        {(['despesa', 'receita'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setTab(type)}
            className={cn(
              'cursor-pointer border-2 border-line px-4 py-2 text-xs font-bold tracking-wider uppercase',
              tab === type
                ? type === 'despesa'
                  ? 'bg-expense text-[#14120d] shadow-brutal-sm'
                  : 'bg-income text-[#14120d] shadow-brutal-sm'
                : 'bg-surface hover:bg-surface-2',
            )}
          >
            {type === 'despesa' ? 'Despesas' : 'Receitas'}
          </button>
        ))}
      </div>

      <Card>
        <ul className="divide-y-2 divide-line">
          {visible.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              onEdit={() => {
                setEditing(category)
                setFormOpen(true)
              }}
            />
          ))}
          {visible.length === 0 && (
            <li className="p-6 text-center text-sm text-muted">
              Nenhuma categoria deste tipo.
            </li>
          )}
        </ul>
      </Card>

      <CategoryFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        category={editing}
        defaultType={tab}
      />
    </div>
  )
}

function CategoryRow({
  category,
  onEdit,
}: {
  category: Category
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['categories'] })

  const archiveMutation = useMutation({
    mutationFn: () =>
      updateCategoryFn({
        data: {
          id: category.id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          archived: !category.archived,
        },
      }),
    onSuccess: invalidate,
    onError: (error) => alert(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCategoryFn({ data: { id: category.id } }),
    onSuccess: invalidate,
    onError: (error) => alert(error.message),
  })

  return (
    <li
      className={cn(
        'flex items-center gap-3 px-4 py-3',
        category.archived && 'opacity-50',
      )}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center border-2 border-line"
        style={{ background: category.color }}
      >
        <CategoryIcon name={category.icon} className="size-4 text-[#14120d]" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold">
        {category.name}
      </span>
      {category.isSystem && (
        <Badge variant="muted">
          <Lock className="size-3" strokeWidth={2.5} />
          Sistema
        </Badge>
      )}
      {category.archived && <Badge variant="muted">Arquivada</Badge>}
      <div className="flex shrink-0 gap-1.5">
        <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
          <Pencil className="size-4" strokeWidth={2.5} />
        </Button>
        {!category.isSystem && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => archiveMutation.mutate()}
              title={category.archived ? 'Restaurar' : 'Arquivar'}
            >
              {category.archived ? (
                <ArchiveRestore className="size-4" strokeWidth={2.5} />
              ) : (
                <Archive className="size-4" strokeWidth={2.5} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Excluir"
              onClick={() => {
                if (confirm(`Excluir a categoria "${category.name}"?`)) {
                  deleteMutation.mutate()
                }
              }}
            >
              <Trash2 className="size-4" strokeWidth={2.5} />
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

function CategoryFormDialog({
  open,
  onClose,
  category,
  defaultType,
}: {
  open: boolean
  onClose: () => void
  category: Category | null
  defaultType: 'despesa' | 'receita'
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()
  const [icon, setIcon] = useState(category?.icon ?? 'tag')

  const mutation = useMutation({
    mutationFn: (data: {
      name: string
      color: string
      icon: string
    }) =>
      category
        ? updateCategoryFn({
            data: { ...data, id: category.id, archived: category.archived },
          })
        : createCategoryFn({ data: { ...data, type: defaultType } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      onClose()
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    const form = new FormData(e.currentTarget)
    mutation.mutate({
      name: String(form.get('name')),
      color: String(form.get('color')),
      icon: String(form.get('icon')),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        category
          ? 'Editar categoria'
          : `Nova categoria de ${defaultType === 'despesa' ? 'despesa' : 'receita'}`
      }
    >
      <form
        onSubmit={onSubmit}
        className="space-y-4"
        key={category?.id ?? 'new'}
      >
        <div>
          <Label htmlFor="category-name">Nome</Label>
          <Input
            id="category-name"
            name="name"
            required
            maxLength={60}
            defaultValue={category?.name}
            disabled={category?.isSystem}
            placeholder="Pets, Academia…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="category-icon">Ícone</Label>
            <Select
              id="category-icon"
              name="icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
            >
              {ICON_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
              <CategoryIcon name={icon} className="size-4" />
              Pré-visualização
            </div>
          </div>
          <div>
            <Label htmlFor="category-color">Cor</Label>
            <Input
              id="category-color"
              name="color"
              type="color"
              defaultValue={category?.color ?? '#4d79ff'}
              className="h-[38px] cursor-pointer p-1"
            />
          </div>
        </div>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
