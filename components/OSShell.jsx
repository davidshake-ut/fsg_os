'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useSession } from '@/components/SessionProvider';
import { useTrainingReminders } from '@/hooks/useTrainingReminders';

export default function OSShell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Once-per-session training reminder sweep (overdue + cert expirations) —
  // runs on any page load so reminders don't depend on visiting Training.
  const { session, company, user } = useSession();
  useTrainingReminders(session, company, user);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <div className={`fixed inset-y-0 left-0 z-40 md:static md:z-auto transition-transform md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setMobileOpen(false)} />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-auto min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 md:hidden bg-white">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-slate-900">FSG OS</span>
        </div>
        {children}
      </div>
    </div>
  );
}
