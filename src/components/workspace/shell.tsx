import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { ClipboardList, History, House, Leaf, LogOut, ShoppingBasket, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from './context';

const nav = [
  { id: 'plan', label: 'My plan', to: '/plan', icon: ClipboardList },
  { id: 'pantry', label: 'My pantry', to: '/plan/pantry', icon: House },
  { id: 'shop', label: 'Shopping mode', to: '/plan/shop', icon: ShoppingBasket },
  { id: 'history', label: 'History', to: '/plan/history', icon: History },
  { id: 'profile', label: 'Profile', to: '/plan/profile', icon: UserRound },
] as const;

const isHere = (pathname: string, to: string) => pathname === to || pathname === `${to}/`;

export function WorkspaceShell() {
  const { loading, error, clearError, profile, listItems, signOut } = useWorkspace();
  const pathname = useRouterState({ select: s => s.location.pathname });

  if (loading) {
    return <div className="loading-screen"><span className="brand-icon"><Leaf /></span><p>Getting your groceries ready…</p></div>;
  }

  const current = nav.find(item => isHere(pathname, item.to)) ?? nav[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-icon"><Leaf size={21} strokeWidth={2.5} /></span><span>kiwi<span className="brand-dot">.</span></span></div>
        <div className="sidebar-label">YOUR SPACE</div>
        <nav className="side-nav">
          {nav.map(({ id, label, to, icon: Icon }) => (
            <Button key={id} asChild variant="ghost" className={isHere(pathname, to) ? 'nav-item active' : 'nav-item'}>
              <Link to={to}>
                <Icon size={18} />
                {label}
                {id === 'shop' && listItems.length > 0 && <span className="nav-count">{listItems.length}</span>}
              </Link>
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><span>✳</span><p>A little planning goes a long way.</p></div>
          <Button variant="ghost" className="nav-item" onClick={signOut}><LogOut size={18} /> Sign out</Button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="mobile-brand brand"><span className="brand-icon"><Leaf size={18} /></span><span>kiwi<span className="brand-dot">.</span></span></div>
          <span className="topbar-breadcrumb">YOUR SPACE <span>/</span> {current.label.toUpperCase()}</span>
          <div className="topbar-user">Hi, {profile?.display_name?.split(' ')[0] || 'there'} <span className="avatar">{(profile?.display_name || 'K').charAt(0).toUpperCase()}</span></div>
        </header>
        {error && <div className="toast-error" role="alert">{error}<Button variant="ghost" size="icon" onClick={clearError}>×</Button></div>}
        <main className="workspace">
          <Outlet />
        </main>
      </div>
      <nav className="mobile-nav">
        {nav.map(({ id, label, to, icon: Icon }) => (
          <Button key={id} asChild variant="ghost" className={isHere(pathname, to) ? 'active' : ''}>
            <Link to={to}><Icon size={20} /><span>{label.split(' ')[0]}</span></Link>
          </Button>
        ))}
      </nav>
    </div>
  );
}
