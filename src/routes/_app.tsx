import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import {
  ArrowLeftRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  Repeat,
  Settings,
  Shapes,
  Target,
  Users,
  Wallet,
  Gauge,
} from 'lucide-react'
import { getSessionFn } from '#/functions/auth.fn'
import { ensureRecurringMaterializedFn } from '#/functions/recurring.fn'
import { authClient } from '#/lib/auth-client'
import { ThemeToggle } from '#/components/theme-toggle'
import { cn } from '#/lib/cn'
import type { LucideIcon } from 'lucide-react'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const user = await getSessionFn()
    if (!user) throw redirect({ to: '/login' })
    // lança as recorrências pendentes antes de qualquer loader ler transações
    await ensureRecurringMaterializedFn()
    return { user }
  },
  component: AppLayout,
})

const NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight },
  { to: '/contas', label: 'Contas', icon: Wallet },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/recorrentes', label: 'Recorrentes', icon: Repeat },
  { to: '/orcamentos', label: 'Orçamentos', icon: Gauge },
  { to: '/objetivos', label: 'Objetivos', icon: Target },
  { to: '/categorias', label: 'Categorias', icon: Shapes },
]

function AppLayout() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const router = useRouter()

  async function logout() {
    await authClient.signOut()
    await router.invalidate()
    navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="flex shrink-0 flex-col border-b-4 border-line bg-surface md:min-h-dvh md:w-56 md:border-r-4 md:border-b-0">
        <Link
          to="/"
          className="flex items-center gap-2 border-b-4 border-line bg-primary px-4 py-3"
        >
          <PiggyBank className="size-6 text-primary-ink" strokeWidth={2.5} />
          <span className="font-display text-xl text-primary-ink uppercase">
            Deyno
          </span>
        </Link>

        <nav className="flex flex-row gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible">
          {NAV.map((item) => (
            <NavLink key={item.to} {...item} />
          ))}
          {user.role === 'admin' && (
            <NavLink to="/admin/usuarios" label="Usuários" icon={Users} />
          )}
          <NavLink to="/configuracoes" label="Configurações" icon={Settings} />
        </nav>

        <div className="mt-auto hidden items-center justify-between gap-2 border-t-2 border-line p-3 md:flex">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold">{user.name}</p>
            <p className="truncate text-[10px] text-muted">{user.email}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              title="Sair"
              aria-label="Sair"
              className="cursor-pointer border-2 border-line bg-surface p-2 shadow-brutal-sm hover:bg-expense hover:text-[#14120d] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              <LogOut className="size-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* ações no mobile */}
        <div className="flex items-center justify-end gap-2 border-t-2 border-line p-2 md:hidden">
          <span className="mr-auto truncate pl-1 text-xs font-bold">
            {user.name}
          </span>
          <ThemeToggle />
          <button
            type="button"
            onClick={logout}
            aria-label="Sair"
            className="cursor-pointer border-2 border-line bg-surface p-2 shadow-brutal-sm"
          >
            <LogOut className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}

function NavLink({
  to,
  label,
  icon: Icon,
}: {
  to: string
  label: string
  icon: LucideIcon
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      className="flex shrink-0 items-center gap-2 border-2 border-transparent px-3 py-2 text-xs font-bold tracking-wide uppercase"
      activeProps={{
        className: cn(
          'border-line bg-primary text-primary-ink shadow-brutal-sm',
        ),
      }}
      inactiveProps={{
        className: 'hover:border-line hover:bg-surface-2',
      }}
    >
      <Icon className="size-4" strokeWidth={2.5} />
      <span>{label}</span>
    </Link>
  )
}
