-- Support tickets get a due date ("Due By") so SLAs are visible and overdue
-- tickets can be flagged at a glance. "Opened On" is the existing created_at,
-- now surfaced in the UI alongside this.
alter table public.support_tickets
  add column if not exists due_date date;
