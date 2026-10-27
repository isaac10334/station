export type SearchableCommand = {
  label: string;
  hint?: string;
  keywords?: string[];
};

// Case- and accent-insensitive, with a map back to the original characters so
// the highlighted runs line up with what's on screen ("sao" finds "São").
function fold(s: string) {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    for (const ch of s[i]
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase()) {
      text += ch;
      map.push(i);
    }
  }
  return { text, map };
}

const isBoundary = (text: string, i: number) =>
  i === 0 || /[\s\-_/.·:]/.test(text[i - 1]);

// Where words start in the original label: after a separator, or a capital after a lowercase letter (GitHub → Git·Hub).
function starts(label: string, map: number[]) {
  return map.map((orig, i) => {
    if (i === 0) return true;
    const prev = label[orig - 1] ?? "";
    const ch = label[orig];
    return (
      map[i - 1] !== orig &&
      (/[\s\-_/.·:]/.test(prev) || (/\p{Lu}/u.test(ch) && /\p{Ll}/u.test(prev)))
    );
  });
}

// The query as an acronym: every letter starts a word or continues the one before
// ("ct" → Change theme, "ghi" → GitHub issues). Scattered letters don't count.
function acronym(text: string, boundary: boolean[], q: string) {
  const hits: number[] = [];
  const walk = (qi: number, from: number): boolean => {
    if (qi === q.length) return true;
    for (let i = from; i < text.length; i++) {
      if (text[i] !== q[qi]) continue;
      const prev = hits[hits.length - 1];
      if (!boundary[i] && !(prev !== undefined && prev === i - 1)) continue;
      hits.push(i);
      if (walk(qi + 1, i + 1)) return true;
      hits.pop();
    }
    return false;
  };
  return walk(0, 0) ? hits : null;
}

function merge(ranges: [number, number][]) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/**
 * How well an item answers a query, and which characters of its label matched.
 * Every word of the query must land somewhere: the label (strongest at the start
 * of a word), then keywords, then the hint. Failing that, the query's letters in
 * order through the label. Returns null when it doesn't match at all.
 */
export function scoreCommand<T extends SearchableCommand>(
  item: T,
  query: string,
): { score: number; ranges: [number, number][] } | null {
  const q = fold(query.trim()).text.replace(/\s+/g, " ");
  if (!q) return { score: 0, ranges: [] };
  const label = fold(item.label);
  const back = (s: number, e: number): [number, number] => [
    label.map[s],
    label.map[e - 1] + 1,
  ];
  if (label.text === q)
    return { score: 1000, ranges: [[0, item.label.length]] };

  let score = label.text.startsWith(q) ? 300 : 0;
  const ranges: [number, number][] = [];
  const keywords = (item.keywords ?? []).map((k) => fold(k).text);
  const hint = item.hint ? fold(item.hint).text : "";
  let ok = true;
  for (const token of q.split(" ")) {
    let at = -1;
    for (
      let i = label.text.indexOf(token);
      i >= 0;
      i = label.text.indexOf(token, i + 1)
    ) {
      if (isBoundary(label.text, i)) {
        at = i;
        break;
      }
      if (at < 0) at = i;
    }
    if (at >= 0) {
      score += isBoundary(label.text, at) ? (at === 0 ? 100 : 80) : 50;
      ranges.push(back(at, at + token.length));
    } else if (keywords.some((k) => k.startsWith(token))) score += 30;
    else if (keywords.some((k) => k.includes(token)) || hint.includes(token))
      score += 15;
    else {
      ok = false;
      break;
    }
  }
  if (ok) return { score, ranges: merge(ranges) };

  const hits = acronym(
    label.text,
    starts(item.label, label.map),
    q.replace(/ /g, ""),
  );
  if (!hits) return null;
  return {
    score: 40 - hits[0],
    ranges: merge(hits.map((h) => back(h, h + 1))),
  };
}
