import { describe, it, expect } from 'vitest';
import { extractMentions, splitMentions } from '../lib/mentions';

const MEMBERS = [
  { id: '1', full_name: 'Paula Manager', email: 'pm@x.com' },
  { id: '2', full_name: 'Terry Tech', email: 'tt@x.com' },
  { id: '3', full_name: 'Paul Solo', email: 'ps@x.com' },
];

describe('extractMentions', () => {
  it('matches full name', () => {
    expect(extractMentions('Hey @Paula Manager, status?', MEMBERS).map((m) => m.id)).toEqual(['1']);
  });
  it('matches first name, case-insensitive', () => {
    expect(extractMentions('hey @paula — status?', MEMBERS).map((m) => m.id)).toEqual(['1']);
  });
  it('does not match a shorter name inside a longer one', () => {
    // "@Paula" must not trigger Paul Solo
    expect(extractMentions('ping @Paula', MEMBERS).map((m) => m.id)).toEqual(['1']);
  });
  it('matches multiple members', () => {
    const ids = extractMentions('@Terry and @Paula please sync', MEMBERS).map((m) => m.id);
    expect(ids.sort()).toEqual(['1', '2']);
  });
  it('ignores emails containing @name', () => {
    expect(extractMentions('mail me at x@paula.com', MEMBERS)).toEqual([]);
  });
  it('requires the @ to follow a boundary', () => {
    expect(extractMentions('price@Terry rates', MEMBERS)).toEqual([]);
  });
  it('handles empty body and members', () => {
    expect(extractMentions('', MEMBERS)).toEqual([]);
    expect(extractMentions('@Paula', [])).toEqual([]);
    expect(extractMentions('@Paula', [{ id: 'x', full_name: '' }])).toEqual([]);
  });
});

describe('splitMentions', () => {
  it('segments a mention out of surrounding text', () => {
    expect(splitMentions('Hey @Terry Tech, done?', MEMBERS)).toEqual([
      { text: 'Hey ', mention: false },
      { text: '@Terry Tech', mention: true },
      { text: ', done?', mention: false },
    ]);
  });
  it('prefers the longest name at the same position', () => {
    const segs = splitMentions('@Paula Manager here', MEMBERS);
    expect(segs[0]).toEqual({ text: '@Paula Manager', mention: true });
  });
  it('returns one plain segment when nothing matches', () => {
    expect(splitMentions('no mentions here', MEMBERS)).toEqual([
      { text: 'no mentions here', mention: false },
    ]);
  });
  it('handles a mention at the start and end', () => {
    const segs = splitMentions('@Terry ping @Paula', MEMBERS);
    expect(segs.filter((s) => s.mention).map((s) => s.text)).toEqual(['@Terry', '@Paula']);
  });
});
