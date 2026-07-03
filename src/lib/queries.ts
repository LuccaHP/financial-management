import { queryOptions } from '@tanstack/react-query'
import { listAccountsFn } from '#/functions/accounts.fn'
import { listCategoriesFn } from '#/functions/categories.fn'

export const accountsQuery = queryOptions({
  queryKey: ['accounts'],
  queryFn: () => listAccountsFn(),
})

export const categoriesQuery = queryOptions({
  queryKey: ['categories'],
  queryFn: () => listCategoriesFn(),
})
