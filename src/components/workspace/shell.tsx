import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { ClipboardList, History, House, Leaf, LoaderCircle, LogOut, ShieldCheck, ShoppingBasket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from './context';
import { PantryCheckDialog } from './pantry-check-dialog';

const nav = [
  { id: 'plan', label: 'My plan', mobileLabel: 'Plan', to: '/plan', icon: ClipboardList },
  { id: 'pantry', label: 'My pantry', mobileLabel: 'Pantry', to: '/plan/pantry', icon: House },
  { id: 'shop', label: 'Shopping mode', mobileLabel: 'Shopping', to: '/plan/shop', icon: ShoppingBasket },
  { id: 'history', label: 'History', mobileLabel: 'History', to: '/plan/history', icon: History },
] as const;

// Only shown to accounts in public.app_admin (migration 0007). The page and its data are checked
// again in the database, so hiding the button is a convenience, not the security boundary.
const adminNav = { id: 'admin', label: 'Admin', mobileLabel: 'Admin', to: '/admin', icon: ShieldCheck } as const;

const isHere = (pathname: string, to: string) => pathname === to || pathname === `${to}/`;

export function WorkspaceShell() {
  const { loading, error, clearError, profile, listItems, signOut, isAdmin } = useWorkspace();
  const pathname = useRouterState({ select: s => s.location.pathname });

  const items = isAdmin ? [...nav, adminNav] : nav;

  const loadFailed = error === 'Could not load content';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/plan" className="brand workspace-brand"><span className="brand-icon"><Leaf size={21} strokeWidth={2.5} /></span><span>kiwi<span className="brand-dot">.</span></span></Link>
        <nav className="side-nav">
          {items.map(({ id, label, to, icon: Icon }) => (
            <Button key={id} asChild variant="ghost" className={isHere(pathname, to) ? 'nav-item active' : 'nav-item'}>
              <Link to={to} activeOptions={{ exact: true }}>
                <Icon size={18} />
                {label}
                {id === 'shop' && listItems.length > 0 && <span className="nav-count">{listItems.length}</span>}
              </Link>
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Button variant="ghost" className="nav-item" onClick={signOut}><LogOut size={18} /> Sign out</Button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <Link to="/plan" className="mobile-brand brand workspace-brand"><span className="brand-icon"><Leaf size={18} /></span><span>kiwi<span className="brand-dot">.</span></span></Link>
          <Link to="/profile" className="topbar-user" aria-label="Open profile">
            <span className="avatar">{(profile?.display_name || 'K').charAt(0).toUpperCase()}</span>
          </Link>
        </header>
        {error && <div className={loadFailed ? 'toast-error load-error' : 'toast-error'} role="alert">{error}{!loadFailed && <Button variant="ghost" size="icon" onClick={clearError}>×</Button>}</div>}
        <main className="workspace">
          {loading && <div className="content-loading" role="status"><LoaderCircle size={16} aria-hidden="true" /> Loading content…</div>}
          <Outlet />
        </main>
      </div>
      <nav className="mobile-nav">
        {items.map(({ id, mobileLabel, to, icon: Icon }) => (
          <Button key={id} asChild variant="ghost" className={isHere(pathname, to) ? 'active' : ''}>
            <Link to={to} activeOptions={{ exact: true }}><Icon size={20} /><span>{mobileLabel}</span></Link>
          </Button>
        ))}
      </nav>
      <PantryCheckDialog />
    </div>
  );
}
