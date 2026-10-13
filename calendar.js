// Dutch calendar moments. Ross uses moments in the coming weeks as extra
// "why now" input next to the Google trends. Several Friends engines are
// holiday episodes (Thanksgiving, Christmas, New Year), so these pair well.

function easter(year) {
  // Anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function nthWeekday(year, month, weekday, n) {
  // month 0-based, weekday 0=Sun; n-th occurrence
  const d = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(1 + offset + (n - 1) * 7);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function momentsForYear(y) {
  const e = easter(y);
  const kingsDay = new Date(Date.UTC(y, 3, 27));
  if (kingsDay.getUTCDay() === 0) kingsDay.setUTCDate(26);
  const thanksgiving = nthWeekday(y, 10, 4, 4);
  return [
    { name: 'Valentijnsdag', date: new Date(Date.UTC(y, 1, 14)), theme: 'romance, singles, couples under pressure' },
    { name: 'Carnaval', date: addDays(e, -49), theme: 'dressing up, alter egos, southern Dutch party culture' },
    { name: 'Pasen', date: e, theme: 'family gatherings, brunch, long weekend' },
    { name: 'Koningsdag', date: kingsDay, theme: 'vrijmarkt, orange, street parties, selling your stuff' },
    { name: 'Bevrijdingsdag', date: new Date(Date.UTC(y, 4, 5)), theme: 'freedom, festivals, generations' },
    { name: 'Moederdag', date: nthWeekday(y, 4, 0, 2), theme: 'mothers, gratitude, family roles' },
    { name: 'Eindexamens', date: new Date(Date.UTC(y, 4, 12)), theme: 'exams, futures, school leavers' },
    { name: 'Vaderdag', date: nthWeekday(y, 5, 0, 3), theme: 'fathers, masculinity, family roles' },
    { name: 'Start zomervakantie', date: new Date(Date.UTC(y, 6, 5)), theme: 'holidays, camping, travel with family or friends' },
    { name: 'Prinsjesdag', date: nthWeekday(y, 8, 2, 3), theme: 'money, budgets, who can afford what' },
    { name: 'Halloween', date: new Date(Date.UTC(y, 9, 31)), theme: 'costumes, fear, parties' },
    { name: 'Black Friday', date: addDays(thanksgiving, 1), theme: 'shopping, bargains, consumerism' },
    { name: 'Sinterklaas', date: new Date(Date.UTC(y, 11, 5)), theme: 'gedichten, surprises, gift rituals, family evenings' },
    { name: 'Kerst', date: new Date(Date.UTC(y, 11, 25)), theme: 'family dinners, obligations, who hosts' },
    { name: 'Oud en Nieuw', date: new Date(Date.UTC(y, 11, 31)), theme: 'resolutions, midnight kisses, fireworks' },
  ];
}

/** Moments falling within the next `weeks` weeks from `now`. */
function upcomingMoments(now = new Date(), weeks = 8) {
  const end = addDays(now, weeks * 7);
  const y = now.getUTCFullYear();
  return [...momentsForYear(y), ...momentsForYear(y + 1)]
    .filter((m) => m.date >= now && m.date <= end)
    .map((m) => ({
      id: `cal-${m.name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
      source: 'calendar',
      title: m.name,
      detail: `${m.date.toISOString().slice(0, 10)} — ${m.theme}`,
    }));
}

module.exports = { upcomingMoments, easter };
