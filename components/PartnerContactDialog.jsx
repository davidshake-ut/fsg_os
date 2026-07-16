'use client';

import { useState } from 'react';
import { Mail, X, CheckCircle2, Loader2 } from 'lucide-react';

// "New Partners — Send Us a Message" on the public landing page. Opens a
// dialog (name / email / phone / company), posts to /api/contact — which
// delivers the inquiry into the app's Message Center, no email involved —
// then shows a thank-you state.

const BUTTON_STYLES = {
  header:
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-700',
  hero:
    'inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-400 hover:text-blue-700',
  light:
    'inline-flex items-center gap-2 rounded-xl border border-white/50 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10',
};

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20';

export default function PartnerContactButton({ variant = 'hero', className = '' }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const close = () => {
    setOpen(false);
    setErr(null);
    if (done) {
      setDone(false);
      setForm({ name: '', email: '', phone: '', company: '', website: '' });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong — please try again.');
      setDone(true);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${BUTTON_STYLES[variant] ?? BUTTON_STYLES.hero} ${className}`}>
        <Mail size={variant === 'header' ? 14 : 16} /> New Partners — Send Us a Message
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onMouseDown={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {done ? 'Thank you!' : 'Tell us about your business'}
              </h3>
              <button type="button" onClick={close} aria-label="Close" className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 size={36} className="text-emerald-500" />
                <p className="text-sm text-slate-700">
                  We&rsquo;ve received your information and will be in touch with you soon.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2 text-sm font-semibold text-white hover:brightness-110"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
                  <input className={inputClass} value={form.name} onChange={set('name')} required autoFocus maxLength={120} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Email *</label>
                  <input className={inputClass} type="email" value={form.email} onChange={set('email')} required maxLength={200} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
                    <input className={inputClass} type="tel" value={form.phone} onChange={set('phone')} maxLength={60} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Company *</label>
                    <input className={inputClass} value={form.company} onChange={set('company')} required maxLength={120} />
                  </div>
                </div>
                {/* Honeypot — humans never see it, bots fill it */}
                <input
                  type="text"
                  value={form.website}
                  onChange={set('website')}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                  name="website"
                />
                {err && <p className="text-xs text-red-600">{err}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-1 w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Sending…
                    </span>
                  ) : (
                    'Contact Us'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
