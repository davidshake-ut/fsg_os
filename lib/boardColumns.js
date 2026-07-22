// Per-project Kanban columns (psa_projects.board_columns jsonb, migration
// 0053). Tasks store the column id in psa_tasks.status. Two columns are
// permanent anchors: 'todo' (where new/orphaned tasks land) and 'done'
// (every completion metric in the app checks status === 'done'); everything
// between can be added, renamed, or deleted. Custom column ids are stable
// (col_<uuid8>) so renames never orphan tasks.

export const DEFAULT_BOARD_COLUMNS = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

export const SYSTEM_COLUMN_IDS = new Set(['todo', 'done']);

export function newColumnId() {
  const raw =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(16)}${Math.floor(Math.random() * 1e8).toString(16)}`;
  return `col_${raw.slice(0, 8)}`;
}

// `fallback` lets a module variant supply the columns a project starts with
// (Custom Modules Phase C); projects that saved their own board_columns are
// never affected by it.
export function resolveBoardColumns(project, fallback = DEFAULT_BOARD_COLUMNS) {
  const sanitize = (list) => {
    if (!Array.isArray(list)) return null;
    const cols = list.filter(
      (c) => c && typeof c.id === 'string' && typeof c.label === 'string' && c.label.trim()
    );
    if (cols.length === 0) return null;
    const out = [...cols];
    if (!out.some((c) => c.id === 'todo')) out.unshift(DEFAULT_BOARD_COLUMNS[0]);
    if (!out.some((c) => c.id === 'done')) out.push(DEFAULT_BOARD_COLUMNS[2]);
    return out;
  };
  return sanitize(project?.board_columns) ?? sanitize(fallback) ?? DEFAULT_BOARD_COLUMNS;
}

export function columnLabel(columns, statusId) {
  return columns.find((c) => c.id === statusId)?.label ?? statusId;
}
