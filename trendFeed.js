// Fresh input for Ross: Google Trends NL, Google News NL and Dutch calendar moments.
// Each source fails independently — if one feed is down, the run continues with the rest.

const { XMLParser } = require('fast-xml-parser');
const { upcomingMoments } = require('./calendar');

const FEEDS = {
  trends: [
    'https://trends.google.com/trending/rss?geo=NL',
    'https://trends.google.com/trends/trendingsearches/daily/rss?geo=NL',
  ],
  news: ['https://news.google.com/rss?hl=nl&gl=NL&ceid=NL:nl'],
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (x == null ? '' : typeof x === 'object' ? String(x['#text'] ?? '') : String(x)).trim();

async function fetchXml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Ross trend feed)', Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parser.parse(await res.text());
}

function parseTrends(doc) {
  return asArray(doc?.rss?.channel?.item).map((it) => {
    const news = asArray(it['ht:news_item']).map((n) => text(n['ht:news_item_title'])).filter(Boolean);
    return {
      source: 'google-trends',
      title: text(it.title),
      detail: [text(it['ht:approx_traffic']) && `${text(it['ht:approx_traffic'])} searches`, ...news.slice(0, 2)]
        .filter(Boolean)
        .join(' — '),
    };
  });
}

function parseNews(doc) {
  return asArray(doc?.rss?.channel?.item).map((it) => {
    const outlet = text(it.source);
    let title = text(it.title);
    if (outlet && title.endsWith(` - ${outlet}`)) title = title.slice(0, -(outlet.length + 3));
    return { source: 'google-news', title, detail: outlet };
  });
}

async function firstWorking(urls, parse, label) {
  for (const url of urls) {
    try {
      const items = parse(await fetchXml(url)).filter((i) => i.title);
      if (items.length) return items;
      console.warn(`[trends] ${label}: ${url} returned no items`);
    } catch (err) {
      console.warn(`[trends] ${label}: ${url} failed (${err.message})`);
    }
  }
  return [];
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((i) => {
    const key = i.title.toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Collect this week's input signals.
 * @returns {Promise<{signals: object[], sourcesOk: object}>}
 */
async function collectSignals({ maxTrends = 15, maxNews = 15, weeksAhead = 8, now = new Date() } = {}) {
  const [trends, news] = await Promise.all([
    firstWorking(FEEDS.trends, parseTrends, 'google-trends'),
    firstWorking(FEEDS.news, parseNews, 'google-news'),
  ]);
  const calendar = upcomingMoments(now, weeksAhead);
  const signals = dedupe([...trends.slice(0, maxTrends), ...news.slice(0, maxNews)]).map((s, i) => ({
    id: `sig-${i + 1}`,
    ...s,
  }));
  return {
    signals: [...signals, ...calendar],
    sourcesOk: { googleTrends: trends.length, googleNews: news.length, calendar: calendar.length },
  };
}

module.exports = { collectSignals, parseTrends, parseNews, parser };
