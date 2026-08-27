'use client';

import { useState } from 'react';
import { ChevronDown, Landmark, Plus, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import { Card, Button, Field, NumberInput, Segmented, Toggle } from '@/components/ui/primitives';
import { currency, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  RECURRING_KINDS,
  RECURRING_KIND_LABELS,
  normalizeRecurring,
  computeRecurring,
  circuitItem,
  supportFeeItem,
  licenseItem,
  otherItem,
} from '@/lib/recurring';
import { FINANCING_BASIS_LABELS, computeFinancing, principalFor } from '@/lib/financing';

// Recurring charges + financing on the Builder's Overview (complex-project
// Builder, Phase 7). Items are the quote's inputs.recurring; the financing
// block shows the resolved policy (team defaults + this quote's overrides)
// and writes overrides to inputs.financing. Everything here feeds the
// per-save summary, the options comparison, and the proposal PDF.

const cell = 'rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-400';
const mini = 'rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 outline-none focus:border-blue-400';

function Money({ n, muted = false, precise = false }) {
  const v = Number(n) || 0;
  return (
    <span className={cn('tabular-nums', muted ? 'text-slate-500' : 'text-slate-800')}>
      {precise ? `$${v.toFixed(2)}` : currency(v)}
    </span>
  );
}

export default function RecurringSection({
  recurring = null,
  onChange = () => {},
  financingOverride = null,
  onFinancingChange = () => {},
  financingPolicy = null,
  carrierCircuits = [],
  summary = null,
  canViewMargin = true,
  canWrite = true,
}) {
  const units = Math.max(0, Number(summary?.units) || 0);
  const items = normalizeRecurring(recurring).items;
  const result = computeRecurring({ items }, { units });
  const policy = financingPolicy ?? { enabled: false, basis: 'total', apr: 0, terms: [], lenderDiscountPct: 0 };
  const principal = principalFor(policy, summary);
  const fin = computeFinancing(policy, { principal, units });
  const [open, setOpen] = useState(() => items.length > 0 || policy.enabled);
  const [newTerm, setNewTerm] = useState(24);

  const setItems = (next) => onChange({ items: next });
  const updateItem = (id, patch) => setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => setItems(items.filter((it) => it.id !== id));
  const addItem = (item) => setItems([...items, item]);
  const addCircuit = (id) => {
    const c = carrierCircuits.find((x) => x.id === id);
    if (c) addItem(circuitItem(c));
  };

  const setFin = (patch) => onFinancingChange({ ...(financingOverride ?? {}), ...patch });
  const addTerm = () => {
    const t = Math.round(Number(newTerm) || 0);
    if (t <= 0 || policy.terms.includes(t)) return;
    setFin({ terms: [...policy.terms, t].sort((a, b) => a - b) });
  };
  const removeTerm = (t) => setFin({ terms: policy.terms.filter((x) => x !== t) });

  const monthlyChip = result.hasItems ? `${currency(result.totals.monthlyPrice)} / mo` : policy.enabled ? 'financing on' : 'none';

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Repeat size={14} className="text-slate-400" /> Recurring &amp; Financing
          <span className="text-xs font-normal text-slate-400">— {monthlyChip}</span>
        </span>
        <ChevronDown size={15} className={cn('text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {/* ── Recurring services ── */}
          <div className="px-4 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recurring services</h4>
                <p className="text-[11px] text-slate-400">
                  Carrier circuits, support, software — quoted the way each vendor bills and shown per month.
                  {units > 0 ? ` Per-unit amounts use ${units} units.` : ' Set the unit count to price per-unit items.'}
                </p>
              </div>
              {canWrite && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    aria-label="Add carrier circuit"
                    className={mini}
                    value=""
                    onChange={(e) => {
                      addCircuit(e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="">+ Carrier circuit…</option>
                    {carrierCircuits.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.carrier} {c.bandwidth} · {c.termMonths} mo · {currency(c.mrc)}/mo
                      </option>
                    ))}
                  </select>
                  <Button variant="outline" size="sm" onClick={() => addItem(supportFeeItem())}>
                    <Plus size={12} /> Support fee
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addItem(licenseItem())}>
                    <Plus size={12} /> Software
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addItem(otherItem())}>
                    <Plus size={12} /> Other
                  </Button>
                </div>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400">No recurring services on this proposal.</p>
          ) : (
            <div className="overflow-x-auto px-4 pb-3 pt-2">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                    <th className="py-1.5 pr-2 font-medium">Service</th>
                    <th className="py-1.5 pr-2 font-medium">Bills</th>
                    {canViewMargin && <th className="py-1.5 pr-2 font-medium">Our cost</th>}
                    <th className="py-1.5 pr-2 font-medium">Client price</th>
                    {canViewMargin && <th className="py-1.5 pr-2 text-right font-medium">Cost / mo</th>}
                    <th className="py-1.5 pr-2 text-right font-medium">Price / mo</th>
                    {canWrite && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 align-top">
                      <td className="py-1.5 pr-2">
                        {canWrite ? (
                          <div className="flex flex-col gap-1">
                            <input
                              aria-label="Service"
                              value={l.label}
                              placeholder={RECURRING_KIND_LABELS[l.kind]}
                              onChange={(e) => updateItem(l.id, { label: e.target.value })}
                              className={cn(cell, 'w-full min-w-[220px]')}
                            />
                            <div className="flex items-center gap-1.5">
                              <select aria-label="Kind" className={mini} value={l.kind} onChange={(e) => updateItem(l.id, { kind: e.target.value })}>
                                {RECURRING_KINDS.map((k) => (
                                  <option key={k} value={k}>{RECURRING_KIND_LABELS[k]}</option>
                                ))}
                              </select>
                              {l.kind === 'circuit' && (
                                <label className="flex items-center gap-1 text-[11px] text-slate-400">
                                  term
                                  <input
                                    type="number"
                                    min="1"
                                    aria-label="Term months"
                                    value={l.termMonths ?? ''}
                                    onChange={(e) => updateItem(l.id, { termMonths: e.target.value === '' ? null : Number(e.target.value) })}
                                    className={cn(mini, 'w-16 text-right tabular-nums')}
                                  />
                                  mo
                                </label>
                              )}
                              <label className="flex items-center gap-1 text-[11px] text-slate-400">
                                qty
                                <input
                                  type="number"
                                  min="1"
                                  aria-label="Quantity"
                                  value={l.qty}
                                  onChange={(e) => updateItem(l.id, { qty: Number(e.target.value) })}
                                  className={cn(mini, 'w-14 text-right tabular-nums')}
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-slate-700">{l.label || RECURRING_KIND_LABELS[l.kind]}</div>
                            <div className="text-[11px] text-slate-400">
                              {RECURRING_KIND_LABELS[l.kind]}
                              {l.termMonths ? ` · ${l.termMonths} mo term` : ''}
                              {l.qty > 1 ? ` · ×${l.qty}` : ''}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        {canWrite ? (
                          <select aria-label="Billing period" className={mini} value={l.period} onChange={(e) => updateItem(l.id, { period: e.target.value })}>
                            <option value="month">Monthly</option>
                            <option value="year">Annually</option>
                          </select>
                        ) : (
                          <span className="text-xs text-slate-500">{l.period === 'year' ? 'Annually' : 'Monthly'}</span>
                        )}
                      </td>
                      {canViewMargin && (
                        <td className="py-1.5 pr-2">
                          <AmountEditor
                            amount={l.cost}
                            basis={l.costBasis}
                            canWrite={canWrite}
                            label="Cost"
                            onChange={(patch) => updateItem(l.id, { cost: patch.amount ?? l.cost, costBasis: patch.basis ?? l.costBasis })}
                          />
                        </td>
                      )}
                      <td className="py-1.5 pr-2">
                        <AmountEditor
                          amount={l.price}
                          basis={l.priceBasis}
                          canWrite={canWrite}
                          label="Price"
                          onChange={(patch) => updateItem(l.id, { price: patch.amount ?? l.price, priceBasis: patch.basis ?? l.priceBasis })}
                        />
                      </td>
                      {canViewMargin && (
                        <td className="py-1.5 pr-2 text-right">
                          <Money n={l.monthlyCost} muted />
                        </td>
                      )}
                      <td className="py-1.5 pr-2 text-right font-medium">
                        <Money n={l.monthlyPrice} />
                      </td>
                      {canWrite && (
                        <td className="py-1.5 text-right">
                          <button
                            type="button"
                            aria-label="Remove"
                            onClick={() => removeItem(l.id)}
                            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-2 pr-2 text-slate-800" colSpan={canViewMargin ? 4 : 3}>
                      Monthly recurring
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {units > 0 ? `${currency(result.totals.perUnitMonth)} per unit per month · ` : ''}
                        {currency(result.totals.annualPrice)} per year
                      </span>
                    </td>
                    {canViewMargin && (
                      <td className="py-2 pr-2 text-right">
                        <Money n={result.totals.monthlyCost} muted />
                      </td>
                    )}
                    <td className="py-2 pr-2 text-right text-blue-700">
                      <Money n={result.totals.monthlyPrice} />
                      {canViewMargin && result.totals.monthlyPrice > 0 && (
                        <span className="ml-1.5 text-xs font-normal text-slate-400">{percent(result.totals.margin, 0)} margin</span>
                      )}
                    </td>
                    {canWrite && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ── Financing ── */}
          <div className="border-t border-slate-100 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Landmark size={13} className="text-slate-400" /> Financing
                </h4>
                <p className="text-[11px] text-slate-400">
                  Level monthly payments on the {FINANCING_BASIS_LABELS[policy.basis]?.toLowerCase() ?? 'total'} — team defaults in Settings → Pricing.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {canWrite && financingOverride && (
                  <button
                    type="button"
                    onClick={() => onFinancingChange(null)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                  >
                    <RotateCcw size={11} /> Team defaults
                  </button>
                )}
                {canWrite ? (
                  <Toggle checked={policy.enabled} onChange={(v) => setFin({ enabled: v })} label="Offer financing" />
                ) : (
                  <span className="text-xs text-slate-500">{policy.enabled ? 'Offered' : 'Not offered'}</span>
                )}
              </div>
            </div>

            {policy.enabled && (
              <div className="mt-3 space-y-3">
                {canWrite && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="APR %">
                      <NumberInput value={policy.apr} step="0.25" onChange={(v) => setFin({ apr: v })} />
                    </Field>
                    <Field label="Lender discount %" sub="Uplifts the price so the sale nets the cash price">
                      <NumberInput value={policy.lenderDiscountPct} step="0.5" onChange={(v) => setFin({ lenderDiscountPct: v })} />
                    </Field>
                    <Field label="Finance">
                      <Segmented
                        value={policy.basis}
                        onChange={(v) => setFin({ basis: v })}
                        options={[
                          { value: 'total', label: 'Total' },
                          { value: 'managedWifi', label: 'Managed Wi-Fi' },
                        ]}
                      />
                    </Field>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400">Terms:</span>
                  {policy.terms.map((t) => (
                    <span key={t} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                      {t} mo
                      {canWrite && policy.terms.length > 1 && (
                        <button type="button" aria-label={`Remove ${t} month term`} onClick={() => removeTerm(t)} className="text-slate-400 hover:text-red-600">
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {canWrite && (
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        aria-label="New term months"
                        value={newTerm}
                        onChange={(e) => setNewTerm(e.target.value)}
                        className={cn(mini, 'w-16 text-right tabular-nums')}
                      />
                      <Button variant="outline" size="sm" onClick={addTerm}>
                        <Plus size={12} /> Term
                      </Button>
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                        <th className="py-1.5 pr-2 font-medium">Term</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Monthly payment</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Per unit / month</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Total of payments</th>
                        {canViewMargin && <th className="py-1.5 text-right font-medium">Finance charge</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {fin.options.map((o) => (
                        <tr key={o.months} className="border-b border-slate-50">
                          <td className="py-1.5 pr-2 text-slate-700">{o.months} months</td>
                          <td className="py-1.5 pr-2 text-right font-medium">
                            <Money n={o.monthly} />
                          </td>
                          <td className="py-1.5 pr-2 text-right">{units > 0 ? <Money n={o.perUnitMonth} precise muted /> : <span className="text-slate-300">—</span>}</td>
                          <td className="py-1.5 pr-2 text-right">
                            <Money n={o.total} muted />
                          </td>
                          {canViewMargin && (
                            <td className="py-1.5 text-right">
                              <Money n={o.financeCharge} muted />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-slate-400">
                  Financed amount {currency(fin.financedPrice)} at {policy.apr}% APR
                  {fin.uplift > 0
                    ? ` — includes a ${currency(fin.uplift)} uplift so a ${policy.lenderDiscountPct}% lender discount still nets ${currency(fin.principal)}.`
                    : '.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function AmountEditor({ amount, basis, canWrite, label, onChange }) {
  if (!canWrite) {
    return (
      <span className="text-xs text-slate-600">
        {currency(amount)}
        <span className="text-slate-400">{basis === 'per_unit' ? ' / unit' : ''}</span>
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="0"
        step="0.01"
        aria-label={label}
        value={amount}
        onChange={(e) => onChange({ amount: e.target.value === '' ? 0 : Number(e.target.value) })}
        className={cn(cell, 'w-24 text-right tabular-nums')}
      />
      <select aria-label={`${label} basis`} className={mini} value={basis} onChange={(e) => onChange({ basis: e.target.value })}>
        <option value="flat">flat</option>
        <option value="per_unit">per unit</option>
      </select>
    </div>
  );
}
