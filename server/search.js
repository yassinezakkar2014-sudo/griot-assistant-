// Recherche Internet : Tavily si une clé est fournie, sinon DuckDuckGo Instant Answer + Wikipédia.
const UA = "GRIOT-Assistant/2.0";

async function getJSON(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function webSearch(query, lang = "fr") {
  const results = [];
  if (process.env.TAVILY_API_KEY) {
    try {
      const data = await getJSON("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: 6, include_answer: true })
      });
      if (data.answer) results.push({ title: "Synthèse", url: "", snippet: data.answer });
      for (const r of data.results || []) results.push({ title: r.title, url: r.url, snippet: (r.content || "").slice(0, 600) });
      return results;
    } catch (e) {
      console.warn("Tavily indisponible:", e.message);
    }
  }
  try {
    const ddg = await getJSON(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    if (ddg.AbstractText) results.push({ title: ddg.Heading || query, url: ddg.AbstractURL, snippet: ddg.AbstractText });
    for (const t of (ddg.RelatedTopics || []).slice(0, 4)) {
      if (t.Text) results.push({ title: t.Text.split(" - ")[0], url: t.FirstURL, snippet: t.Text });
    }
  } catch (e) {
    console.warn("DuckDuckGo indisponible:", e.message);
  }
  try {
    const wl = /^[a-z]{2}$/.test(lang) ? lang : "fr";
    const wiki = await getJSON(
      `https://${wl}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=4&origin=*`
    );
    for (const r of wiki.query?.search || []) {
      results.push({
        title: r.title,
        url: `https://${wl}.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
        snippet: r.snippet.replace(/<[^>]+>/g, "")
      });
    }
  } catch (e) {
    console.warn("Wikipédia indisponible:", e.message);
  }
  return results;
}
