'use client';

import { useState, useSyncExternalStore } from 'react';
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
  MessageSquare,
  FileCheck,
  ChevronDown,
  X,
} from 'lucide-react';
import { useSession } from '@/components/SessionProvider';
import { useModules } from '@/hooks/useModules';
import NotificationBell from '@/components/NotificationBell';
import CommandPalette from '@/components/CommandPalette';
import { companyTechnologies } from '@/lib/technologies';
import { subscribeBuilderTechs, getBuilderTechsSnapshot, getBuilderTechsServerSnapshot } from '@/lib/builderNavStore';
import { cn, initials } from '@/lib/utils';

// `group: null` renders with no header (top-level); consecutive items
// sharing a group render under one label, matching the Sell/Deliver/
// Support structure design settled on for the "bold" chrome pass.
// Messages stays ungrouped like Dashboard — it's cross-cutting (every
// department uses it), not scoped to one workflow stage.
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard',       href: '/dashboard', icon: LayoutDashboard, group: null },
  { key: 'messages',  label: 'Messages',        href: '/messages',  icon: MessageSquare,   group: null },
  { key: 'crm',       label: 'CRM',             href: '/crm',       icon: Users,           group: 'Sell' },
  { key: 'builder',   label: 'System Builder',  href: '/builder',   icon: Wrench,          group: 'Sell' },
  { key: 'proposals',  label: 'Proposals',       href: '/proposals',  icon: FileCheck,      group: 'Deliver' },
  { key: 'projects',   label: 'Projects',        href: '/projects',   icon: FolderKanban,   group: 'Deliver' },
  { key: 'invoices',   label: 'Invoices',        href: '/invoices',   icon: Receipt,        group: 'Deliver' },
  { key: 'templates',  label: 'Templates',       href: '/templates',  icon: LayoutTemplate, group: 'Deliver' },
  { key: 'automations', label: 'Automations',    href: '/automations', icon: Zap,           group: 'Deliver' },
  { key: 'support',    label: 'Support',         href: '/support',    icon: LifeBuoy,       group: 'Support' },
  { key: 'resources',  label: 'Resources',       href: '/resources',  icon: BookOpen,       group: 'Support' },
];

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
  const { isAdmin, isSuperAdmin, configured, session, user, company, signOut } = useSession();
  const { isEnabled } = useModules();
  // Manual chevron overrides; null = auto (open while on the section).
  const [builderManual, setBuilderManual] = useState(null);
  const [resourcesManual, setResourcesManual] = useState(null);
  // The Builder publishes the current quote's enabled techs (which sub-links
  // to list) and its active tab (which sub-link is lit); before it has,
  // fall back to the default-on pair.
  const { enabledIds, activeTab } = useSyncExternalStore(subscribeBuilderTechs, getBuilderTechsSnapshot, getBuilderTechsServerSnapshot);
  const builderSubTechs = companyTechnologies(company).filter((t) =>
    enabledIds ? enabledIds.includes(t.id) : (t.id === 'managed_wifi' || t.id === 'video_surveillance')
  );

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.key === 'templates' || item.key === 'automations') return isEnabled('projects');
    if (item.key === 'proposals') return isEnabled('builder'); // proposals ARE builder quotes
    return isEnabled(item.key);
  });

  return (
    <aside
      className="flex h-screen w-56 shrink-0 flex-col border-r"
      style={{ background: 'var(--ui-sidebar-bg)', borderColor: 'var(--ui-sidebar-border)' }}
    >
      {/* Team identity — the app wears the team's name and logo */}
      <div className="flex h-14 items-center gap-2.5 border-b px-4" style={{ borderColor: 'var(--ui-sidebar-border)' }}>
        {company?.logo?.dataUrl ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/90 p-0.5">
            <img src={company.logo.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
          </span>
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: 'var(--ui-sidebar-logo-bg)' }}>
            <Layers size={14} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-[var(--ui-sidebar-ink-strong)]" title={company?.name || 'FSG OS'}>
          {company?.name || 'FSG OS'}
        </span>
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
          const isBuilder = key === 'builder';
          const builderExpanded = isBuilder && (builderManual ?? pathname === '/builder');
          // While a Builder sub-tab is active, the sub-link carries the
          // highlight and the parent goes quiet.
          const builderSubActive = isBuilder && pathname === '/builder' && !!activeTab;
          // Resources expands the same way: Training + Knowledge Base ride
          // under it, and the parent goes quiet while a sub-page is active.
          const isResources = key === 'resources';
          const onResourcesSub = pathname.startsWith('/resources/training') || pathname.startsWith('/knowledge');
          const resourcesExpanded = isResources
            && (resourcesManual ?? (pathname.startsWith('/resources') || pathname.startsWith('/knowledge')));
          const hasChevron = isBuilder || isResources;
          const expanded = isBuilder ? builderExpanded : resourcesExpanded;
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
              {hasChevron ? (
                <div className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <NavLink
                      href={href}
                      icon={icon}
                      label={label}
                      active={isBuilder
                        ? (pathname === href || pathname.startsWith(href + '/')) && !builderSubActive
                        : pathname.startsWith(href) && !onResourcesSub}
                      onClick={onClose}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => (isBuilder ? setBuilderManual(!expanded) : setResourcesManual(!expanded))}
                    aria-label={`Toggle ${label} pages`}
                    className="rounded p-1 text-[var(--ui-sidebar-ink)] hover:bg-[var(--ui-sidebar-active-bg)]"
                  >
                    <ChevronDown size={13} className={cn('transition-transform', expanded && 'rotate-180')} />
                  </button>
                </div>
              ) : (
                <NavLink
                  href={href}
                  icon={icon}
                  label={label}
                  active={pathname === href || pathname.startsWith(href + '/')}
                  onClick={onClose}
                />
              )}
              {resourcesExpanded && (
                <div
                  className="ml-5 mt-0.5 space-y-0.5 border-l pl-2"
                  style={{ borderColor: 'var(--ui-sidebar-border)' }}
                >
                  {[
                    { href: '/resources/training', label: 'Training' },
                    { href: '/knowledge', label: 'Knowledge Base' },
                  ].map((sub) => {
                    const subActive = pathname === sub.href || pathname.startsWith(sub.href + '/');
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={onClose}
                        className={cn(
                          'block truncate rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                          subActive
                            ? 'bg-[var(--ui-sidebar-active-bg)] font-semibold text-[var(--ui-sidebar-active-ink)]'
                            : 'text-[var(--ui-sidebar-ink)] hover:bg-[var(--ui-sidebar-active-bg)] hover:text-[var(--ui-sidebar-active-ink)]'
                        )}
                      >
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
              {builderExpanded && (
                <div
                  className="ml-5 mt-0.5 space-y-0.5 border-l pl-2"
                  style={{ borderColor: 'var(--ui-sidebar-border)' }}
                >
                  {[
                    { id: 'overview', label: 'Overview' },
                    ...builderSubTechs.map((t) => ({ id: t.id, label: t.label })),
                    { id: 'products', label: 'Product Database' },
                  ].map((sub) => {
                    const subActive = builderSubActive && activeTab === sub.id;
                    return (
                      <Link
                        key={sub.id}
                        href={`/builder?tab=${sub.id}`}
                        onClick={onClose}
                        className={cn(
                          'block truncate rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                          subActive
                            ? 'bg-[var(--ui-sidebar-active-bg)] font-semibold text-[var(--ui-sidebar-active-ink)]'
                            : 'text-[var(--ui-sidebar-ink)] hover:bg-[var(--ui-sidebar-active-bg)] hover:text-[var(--ui-sidebar-active-ink)]'
                        )}
                      >
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
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
        {isAdmin && (
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
