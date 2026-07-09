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
  const [remoteProjects, setRemoteProjects] = useState([]);
  const [remoteTickets,  setRemoteTickets]  = useState([]);
  const [remoteInvoices, setRemoteInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  // Quotes/tickets/invoices link to the account directly (crm_account_id /
  // account_id). PSA projects don't — they only link to a quote — so project
  // lookup is a second pass keyed off the quote ids just fetched.
  const refresh = useCallback(async () => {
    if (!supabase || !accountId) return;
    setLoading(true);
    const [accRes, conRes, quoteRes, ticketRes, invoiceRes] = await Promise.all([
      supabase.from('crm_accounts').select('*').eq('id', accountId).single(),
      supabase.from('crm_contacts').select('*').eq('account_id', accountId).order('first_name'),
      supabase.from('saved_projects').select('id, project_name, status, version, total_price, total_cost, updated_at')
        .eq('crm_account_id', accountId).order('updated_at', { ascending: false }),
      supabase.from('support_tickets').select('id, title, status, priority, created_at')
        .eq('account_id', accountId).order('created_at', { ascending: false }),
      supabase.from('invoices').select('id, invoice_number, title, status, total, invoice_date')
        .eq('crm_account_id', accountId).order('invoice_date', { ascending: false }),
    ]);
    setRemoteAccount(accRes.data ?? null);
    setRemoteContacts(conRes.data ?? []);
    setRemoteQuotes(quoteRes.data ?? []);
    setRemoteTickets(ticketRes.data ?? []);
    setRemoteInvoices(invoiceRes.data ?? []);

    const quoteIds = (quoteRes.data ?? []).map((q) => q.id);
    if (quoteIds.length) {
      const { data: projData } = await supabase.from('psa_projects')
        .select('id, name, status, start_date, end_date, budget')
        .in('quote_id', quoteIds).order('created_at', { ascending: false });
      setRemoteProjects(projData ?? []);
    } else {
      setRemoteProjects([]);
    }
    setLoading(false);
  }, [supabase, accountId]);

  useEffect(() => {
    if (!accountId || !supabase || !session) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, accountId, refresh]);

  const account  = supabase ? remoteAccount  : (localData.accounts.find((a) => a.id === accountId) ?? null);
  const contacts = supabase ? remoteContacts : localData.contacts.filter((c) => c.account_id === accountId);
  // Quotes/projects/tickets/invoices don't cross-link in the single-user
  // local-mode store, so the 360° view is remote(team-mode)-only for now.
  const quotes   = supabase ? remoteQuotes   : [];
  const projects = supabase ? remoteProjects : [];
  const tickets  = supabase ? remoteTickets  : [];
  const invoices = supabase ? remoteInvoices : [];

  const updateAccount = useCallback(async (data) => {
    const now = new Date().toISOString();
    if (!supabase) {
      writeCrm((s) => ({ ...s, accounts: s.accounts.map((a) => a.id === accountId ? { ...a, ...data, updated_at: now } : a) }));
      return;
    }
    const { error } = await supabase.from('crm_accounts').update({ ...data, updated_at: now }).eq('id', accountId);
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

  return { account, contacts, quotes, projects, tickets, invoices, loading, refresh, updateAccount, createContact, updateContact, deleteContact };
}
