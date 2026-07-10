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

// `group: null` renders with no header (top-level); consecutive items
// sharing a group render under one label, matching the Sell/Deliver/
// Support & Bill structure design settled on for the "bold" chrome pass.
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard',       href: '/dashboard', icon: LayoutDashboard, group: null },
  { key: 'crm',       label: 'CRM',             href: '/crm',       icon: Users,           group: 'Sell' },
  { key: 'builder',   label: 'System Builder',  href: '/builder',   icon: Wrench,          group: 'Sell' },
  { key: 'projects',   label: 'Projects',        href: '/projects',   icon: FolderKanban,   group: 'Deliver' },
  { key: 'templates',  label: 'Templates',       href: '/templates',  icon: LayoutTemplate, group: 'Deliver' },
  { key: 'automations', label: 'Automations',    href: '/automations', icon: Zap,           group: 'Deliver' },
  { key: 'support',    label: 'Support',         href: '/support',    icon: LifeBuoy,       group: 'Support & Bill' },
  { key: 'invoices',   label: 'Invoices',        href: '/invoices',   icon: Receipt,        group: 'Support & Bill' },
  { key: 'resources',  label: 'Resources',       href: '/resources',  icon: BookOpen,       group: 'Support & Bill' },
];

function initials(name, email) {
  const source = (name || '').trim() || (email || '').trim();
  if (!source) return '?';
  const parts = source.includes('@') ? [source[0]] : source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || '?';
}

function NavLink({ href, icon: Icon, label, active, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-[var(--ui-sidebar-active-bg)] text-[var(--ui-sidebar-active-ink)]'
          : 'text-[var(--ui-sidebar-ink)] hover:bg-[var(--ui-sidebar-active-bg)] hover:text-[var(--ui-sidebar-active-ink)]'
      )}
    >
      <Icon size={16} className="shrink-0" />
      {label}
    </Link>
  );
}

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const { isAdmin, isSuperAdmin, role, configured, session, user, signOut } = useSession();
  const { isEnabled } = useModules();

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.key === 'templates' || item.key === 'automations' ? isEnabled('projects') : isEnabled(item.key)
  );

  return (
    <aside
      className="flex h-screen w-56 shrink-0 flex-col border-r"
      style={{ background: 'var(--ui-sidebar-bg)', borderColor: 'var(--ui-sidebar-border)' }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b px-4" style={{ borderColor: 'var(--ui-sidebar-border)' }}>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: 'var(--ui-sidebar-logo-bg)' }}>
          <Layers size={14} />
        </span>
        <span className="flex-1 text-sm font-bold tracking-tight text-[var(--ui-sidebar-ink-strong)]">FSG OS</span>
        <NotificationBell />
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-1 text-[var(--ui-sidebar-ink)] hover:bg-[var(--ui-sidebar-active-bg)] md:hidden"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Global search */}
      <div className="border-b p-2" style={{ borderColor: 'var(--ui-sidebar-border)' }}>
        <CommandPalette />
      </div>

      {/* Primary nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {visibleItems.map(({ key, label, href, icon, group }, i) => {
          const showHeader = group && group !== visibleItems[i - 1]?.group;
          return (
            <div key={key}>
              {showHeader && (
                <p
                  className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide first:pt-1"
                  style={{ color: 'var(--ui-sidebar-ink)', opacity: 0.7 }}
                >
                  {group}
                </p>
              )}
              <NavLink
                href={href}
                icon={icon}
                label={label}
                active={pathname === href || pathname.startsWith(href + '/')}
                onClick={onClose}
              />
            </div>
          );
        })}
      </nav>

      {/* Bottom: user identity + Admin + Sign out */}
      <div className="space-y-0.5 border-t p-2" style={{ borderColor: 'var(--ui-sidebar-border)' }}>
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white [background:linear-gradient(135deg,var(--brand,#4338ca),var(--brand-secondary,#0891b2))]"
            >
              {initials(user.full_name, user.email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold" style={{ color: 'var(--ui-sidebar-ink-strong)' }}>
                {user.full_name || user.email}
              </p>
              <p className="truncate text-[10px] capitalize" style={{ color: 'var(--ui-sidebar-ink)' }}>
                {(user.role || '').replace(/_/g, ' ')}
              </p>
            </div>
          </div>
        )}
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
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--ui-sidebar-ink)] hover:bg-[var(--ui-sidebar-active-bg)] hover:text-[var(--ui-sidebar-active-ink)]"
          >
            <LogOut size={16} className="shrink-0" />
            Sign Out
          </button>
        )}
      </div>
    </aside>
  );
}
