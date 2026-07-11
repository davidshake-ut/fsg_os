'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { getCrmSnapshot, getCrmServerSnapshot, subscribeCrm, writeCrm, newCrmId } from '@/lib/crmLocalStore';

export function useCRMAccount(accountId, session) {
  const supabase = getSupabase();
  const localData = useSyncExternalStore(subscribeCrm, getCrmSnapshot, getCrmServerSnapshot);

  const [remoteAccount,  setRemoteAccount]  = useState(null);
  const [remoteContacts, setRemoteContacts] = useState([]);
  const [remoteQuotes,   setRemoteQuotes]   = useState([]);
  const [remoteProperties, setRemoteProperties] = useState([]);
  const [remoteProjects, setRemoteProjects] = useState([]);
  const [remoteTickets,  setRemoteTickets]  = useState([]);
  const [remoteInvoices, setRemoteInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !accountId) return;
    setLoading(true);
    const [accRes, conRes, quoteRes, propRes, ticketRes, invoiceRes] = await Promise.all([
      supabase.from('crm_accounts').select('*').eq('id', accountId).single(),
      supabase.from('crm_contacts').select('*').eq('account_id', accountId).order('first_name'),
      supabase.from('saved_projects').select('id, project_name, status, version, total_price, total_cost, updated_at, property_id')
        .eq('crm_account_id', accountId).order('updated_at', { ascending: false }),
      supabase.from('properties').select('*').eq('crm_account_id', accountId).order('name'),
      supabase.from('support_tickets').select('id, title, status, priority, created_at')
        .eq('account_id', accountId).order('created_at', { ascending: false }),
      supabase.from('invoices').select('id, invoice_number, title, status, total, invoice_date')
        .eq('crm_account_id', accountId).order('invoice_date', { ascending: false }),
    ]);
    setRemoteAccount(accRes.data ?? null);
    setRemoteContacts(conRes.data ?? []);
    setRemoteQuotes(quoteRes.data ?? []);
    setRemoteProperties(propRes.data ?? []);
    setRemoteTickets(ticketRes.data ?? []);
    setRemoteInvoices(invoiceRes.data ?? []);

    // Projects link to the account directly since migration 0040; the
    // quote-id fallback covers older rows the backfill couldn't attribute.
    const quoteIds = (quoteRes.data ?? []).map((q) => q.id);
    const [byAccount, byQuote] = await Promise.all([
      supabase.from('psa_projects')
        .select('id, name, status, start_date, end_date, budget, property_id, quote_id')
        .eq('crm_account_id', accountId),
      quoteIds.length
        ? supabase.from('psa_projects')
            .select('id, name, status, start_date, end_date, budget, property_id, quote_id')
            .in('quote_id', quoteIds)
        : Promise.resolve({ data: [] }),
    ]);
    const merged = new Map();
    for (const p of [...(byAccount.data ?? []), ...(byQuote.data ?? [])]) merged.set(p.id, p);
    setRemoteProjects([...merged.values()]);
    setLoading(false);
  }, [supabase, accountId]);

  useEffect(() => {
    if (!accountId || !supabase || !session) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, accountId, refresh]);

  const account  = supabase ? remoteAccount  : (localData.accounts.find((a) => a.id === accountId) ?? null);
  const contacts = supabase ? remoteContacts : localData.contacts.filter((c) => c.account_id === accountId);
  // Quotes/properties/projects/tickets/invoices don't cross-link in the
  // single-user local-mode store, so the 360° view is remote(team-mode)-only.
  const quotes     = supabase ? remoteQuotes     : [];
  const properties = supabase ? remoteProperties : [];
  const projects   = supabase ? remoteProjects   : [];
  const tickets    = supabase ? remoteTickets    : [];
  const invoices   = supabase ? remoteInvoices   : [];

  const updateAccount = useCallback(async (data) => {
    const now = new Date().toISOString();
    // Won -> customer, same sync as useCRMAccounts.updateAccount.
    const patch = data.stage === 'won' ? { ...data, status: 'active' } : data;
    if (!supabase) {
      writeCrm((s) => ({ ...s, accounts: s.accounts.map((a) => a.id === accountId ? { ...a, ...patch, updated_at: now } : a) }));
      return;
    }
    const { error } = await supabase.from('crm_accounts').update({ ...patch, updated_at: now }).eq('id', accountId);
    if (error) throw error;
    await refresh();
  }, [supabase, accountId, refresh]);

  const createContact = useCallback(async (data) => {
    const now = new Date().toISOString();
    if (!supabase) {
      const c = { id: newCrmId(), account_id: accountId, company_id: 'local', ...data, created_at: now };
      writeCrm((s) => ({ ...s, contacts: [...s.contacts, c] }));
      return c;
    }
    const { data: c, error } = await supabase
      .from('crm_contacts')
      .insert({ account_id: accountId, company_id: account?.company_id, ...data })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return c;
  }, [supabase, accountId, account?.company_id, refresh]);

  const updateContact = useCallback(async (id, data) => {
    if (!supabase) {
      writeCrm((s) => ({ ...s, contacts: s.contacts.map((c) => c.id === id ? { ...c, ...data } : c) }));
      return;
    }
    const { error } = await supabase.from('crm_contacts').update(data).eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const deleteContact = useCallback(async (id) => {
    if (!supabase) {
      writeCrm((s) => ({ ...s, contacts: s.contacts.filter((c) => c.id !== id) }));
      return;
    }
    const { error } = await supabase.from('crm_contacts').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const accountCompanyId = account?.company_id ?? null;
  const createProperty = useCallback(async ({ name, address = null, notes = null }) => {
    if (!supabase || !accountCompanyId || !name?.trim()) return null;
    const { data, error } = await supabase
      .from('properties')
      .insert({ company_id: accountCompanyId, crm_account_id: accountId, name: name.trim(), address, notes })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return data;
  }, [supabase, accountId, accountCompanyId, refresh]);

  const updateProperty = useCallback(async (id, patch) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('properties')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  return {
    account, contacts, quotes, properties, projects, tickets, invoices, loading, refresh,
    updateAccount, createContact, updateContact, deleteContact, createProperty, updateProperty,
  };
}
