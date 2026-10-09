/* Scores adapter. Swap this file for Supabase. The game only calls submit, top, rankOf, and count. */
window.Scores = (() => {
  const scope = () => (window.THEME && window.THEME.board && window.THEME.board.scope) || "default";
  const blocked = new Set(["FUCK", "SHIT", "CUNT", "DICK", "COCK", "PISS", "TITS", "NAZI", "ANAL"]);
  const rows = [];

  function cleanInitials(raw) {
    const initials = String(raw || "").toUpperCase().replace(/[^A-Z_]/g, "").slice(0, 3).padEnd(3, "_");
    return blocked.has(initials) ? "ANO" : initials;
  }

  function mine() {
    return rows.filter((row) => row.scope === scope());
  }

  return {
    async submit(entry) {
      const row = {
        initials: cleanInitials(entry.initials),
        score: Math.max(0, Math.min(100000, entry.score | 0)),
        floors: entry.floors | 0,
        perfects: entry.perfects | 0,
        scope: scope(),
        created: Date.now(),
      };
      rows.push(row);
      return row;
    },
    async top(n) {
      return mine().sort((a, b) => b.score - a.score || a.created - b.created).slice(0, n);
    },
    async rankOf(score) {
      return mine().filter((row) => row.score > score).length + 1;
    },
    async count() {
      return mine().length;
    },
  };
})();
