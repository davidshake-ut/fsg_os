'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Wrench,
  FolderKanban,
  LifeBuoy,
  BookOpen,
  Shield,
  LogOut,
  Layers,
  LayoutTemplate,
  Receipt,
  Zap,
  X,
} from 'lucide-react';
import { useSession } from '@/components/SessionProvider';
import { useModules } from '@/hooks/useModules';
import NotificationBell from '@/components/NotificationBell';
import CommandPalette from '@/components/CommandPalette';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard',       href: '/dashboard', icon: LayoutDashboard },
  { key: 'crm',       label: 'CRM',             href: '/crm',       icon: Users },
  { key: 'builder',   label: 'System Builder',  href: '/builder',   icon: Wrench },
  { key: 'projects',   label: 'Projects',        href: '/projects',   icon: FolderKanban },
  { key: 'templates',  label: 'Templates',       href: '/templates',  icon: LayoutTemplate },
  { key: 'support',    label: 'Support',         href: '/support',    icon: LifeBuoy },
  { key: 'invoices',   label: 'Invoices',        href: '/invoices',   icon: Receipt  },
  { key: 'automations', label: 'Automations',    href: '/automations', icon: Zap },
  { key: 'resources',  label: 'Resources',       href: '/resources',  icon: BookOpen },
];

function NavLink({ href, icon: Icon, label, active, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
      )}
    >
      <Icon size={16} className="shrink-0" />
      {label}
    </Link>
  );
}

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const { isAdmin, isSuperAdmin, role, configured, session, signOut } = useSession();
  const { isEnabled } = useModules();

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.key === 'templates' || item.key === 'automations' ? isEnabled('projects') : isEnabled(item.key)
  );

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Layers size={14} />
        </span>
        <span className="flex-1 text-sm font-bold tracking-tight text-slate-900">FSG OS</span>
        <NotificationBell />
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 md:hidden"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Global search */}
      <div className="border-b border-slate-200 p-2">
        <CommandPalette />
      </div>

      {/* Primary nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {visibleItems.map(({ key, label, href, icon }) => (
          <NavLink
            key={key}
            href={href}
            icon={icon}
            label={label}
            active={pathname === href || pathname.startsWith(href + '/')}
            onClick={onClose}
          />
        ))}
      </nav>

      {/* Bottom: Admin + Sign out */}
      <div className="space-y-0.5 border-t border-slate-200 p-2">
        {(isAdmin || role === 'user') && (
          <NavLink
            href="/admin"
            icon={Shield}
            label={isSuperAdmin ? 'Platform Settings' : 'Settings'}
            active={pathname === '/admin'}
            onClick={onClose}
          />
        )}
        {configured && session && (
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
          >
            <LogOut size={16} className="shrink-0" />
            Sign Out
          </button>
        )}
      </div>
    </aside>
  );
}
