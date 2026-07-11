// @mention parsing for the Message Center. A member can be mentioned by
// full name ("@Paula Manager") or first name ("@Paula"), case-insensitive.
// Matching is boundary-aware: the @ must start the string or follow
// whitespace (so emails like x@paula.com don't count), and the name can't
// continue into another word ("@Paul" doesn't match "@Paula").

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Candidate mention strings for one member, longest first.
function candidatesFor(member) {
  const name = (member.full_name || '').trim();
  if (!name) return [];
  const first = name.split(/\s+/)[0];
  return first && first !== name ? [name, first] : [name];
}

// Members from `members` who are @mentioned in `body`.
export function extractMentions(body, members) {
  const text = body || '';
  if (!text.includes('@')) return [];
  return (members ?? []).filter((m) =>
    candidatesFor(m).some((c) =>
      new RegExp(`(^|\\s)@${escapeRegex(c)}\\b`, 'i').test(text)
    )
  );
}

// Split `body` into segments for rendering: [{ text, mention: boolean }].
// Longest names first so "@Paula Manager" wins over "@Paula".
export function splitMentions(body, members) {
  const text = body || '';
  const all = (members ?? []).flatMap(candidatesFor);
  if (!text.includes('@') || all.length === 0) return [{ text, mention: false }];

  const names = [...new Set(all)].sort((a, b) => b.length - a.length).map(escapeRegex);
  const re = new RegExp(`(^|\\s)(@(?:${names.join('|')}))\\b`, 'gi');

  const segments = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index + match[1].length; // skip the leading boundary char
    if (start > last) segments.push({ text: text.slice(last, start), mention: false });
    segments.push({ text: match[2], mention: true });
    last = start + match[2].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), mention: false });
  return segments.length > 0 ? segments : [{ text, mention: false }];
}
