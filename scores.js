/* Scores adapter. The game only calls submit, top, rankOf, and count. */
window.Scores = (() => {
  const URL = "https://ibqbhcwsixqbandckvvo.supabase.co/rest/v1/scores";
  const KEY = "sb_publishable_W2AwPj3JRZdSqE-NdtGi4A_UEG_Tmwo";
  const scope = () => (window.THEME && window.THEME.board && window.THEME.board.scope) || "default";
  const blocked = new Set(["FUCK", "SHIT", "CUNT", "DICK", "COCK", "PISS", "TITS", "NAZI", "ANAL"]);

  function cleanInitials(raw) {
    const initials = String(raw || "").toUpperCase().replace(/[^A-Z_]/g, "").slice(0, 3).padEnd(3, "_");
    return blocked.has(initials) ? "ANO" : initials;
  }

  async function request(path, options) {
    const response = await fetch(URL + path, {
      method: options.method,
      body: options.body,
      headers: {
        apikey: KEY,
        Authorization: "Bearer " + KEY,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error("Scores request failed");
    return response;
  }

  function countFrom(response) {
    const total = Number((response.headers.get("content-range") || "").split("/")[1]);
    if (!Number.isFinite(total)) throw new Error("Scores count missing");
    return total;
  }

  const eventFilter = () => "event=eq." + encodeURIComponent(scope());

  return {
    async submit(entry) {
      const row = {
        event: scope(),
        initials: cleanInitials(entry.initials),
        score: Math.max(0, Math.min(100000, entry.score | 0)),
        floors: entry.floors | 0,
        perfects: entry.perfects | 0,
        session_id: crypto.randomUUID(),
      };
      await request("", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
      return { initials: row.initials, score: row.score };
    },
    async top(n) {
      const response = await request(
        "?" + eventFilter() + "&select=initials,score&order=score.desc,created_at.asc&limit=" + n,
        { method: "GET" }
      );
      return response.json();
    },
    async rankOf(score) {
      const response = await request(
        "?" + eventFilter() + "&score=gt." + (score | 0) + "&select=id",
        { method: "HEAD", headers: { Prefer: "count=exact" } }
      );
      return countFrom(response) + 1;
    },
    async count() {
      const response = await request(
        "?" + eventFilter() + "&select=id",
        { method: "HEAD", headers: { Prefer: "count=exact" } }
      );
      return countFrom(response);
    },
  };
})();
