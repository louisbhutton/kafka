// Nepal holidays & special dates, 2026 (AD/Gregorian dates as observed).
// English names only, per user preference — no Devanagari/Nepali script.
// "type" is just for potential future styling: national | optional | local.
// Source: public Nepal holiday listings, compiled July 2026. Government-declared
// holidays shift slightly year to year (lunar/BS calendar based) — re-check
// official sources when this app rolls into 2027.

const NEPAL_HOLIDAYS_2026 = [
  { date: "2026-01-11", name: "Prithvi Jayanti", type: "national" },
  { date: "2026-01-14", name: "Maghe Sankranti", type: "national" },
  { date: "2026-01-30", name: "Martyrs' Day", type: "national" },
  { date: "2026-02-15", name: "Maha Shivaratri", type: "national" },
  { date: "2026-02-18", name: "Sonam Losar (Tamang New Year)", type: "optional" },
  { date: "2026-02-18", name: "Gyalpo Losar", type: "optional" },
  { date: "2026-02-19", name: "Democracy Day", type: "national" },
  { date: "2026-03-08", name: "International Women's Day", type: "national" },
  { date: "2026-03-18", name: "Ghode Jatra", type: "local" },
  { date: "2026-03-21", name: "Eid al-Fitr", type: "optional" },
  { date: "2026-03-27", name: "Ram Navami", type: "national" },
  { date: "2026-04-14", name: "Nepali New Year", type: "national" },
  { date: "2026-04-24", name: "Democracy Day (Loktantra Diwas)", type: "national" },
  { date: "2026-05-01", name: "Labour Day", type: "national" },
  { date: "2026-05-01", name: "Buddha Jayanti", type: "national" },
  { date: "2026-05-27", name: "Eid al-Adha", type: "optional" },
  { date: "2026-05-29", name: "Republic Day", type: "national" },
  { date: "2026-08-28", name: "Raksha Bandhan", type: "national" },
  { date: "2026-08-29", name: "Gai Jatra", type: "national" },
  { date: "2026-09-04", name: "Krishna Janmashtami", type: "national" },
  { date: "2026-09-04", name: "Gaura Parba", type: "optional" },
  { date: "2026-09-07", name: "Civil Service Day", type: "local" },
  { date: "2026-09-14", name: "Hartalika Teej", type: "optional" },
  { date: "2026-09-16", name: "Rishi Panchami", type: "optional" },
  { date: "2026-09-19", name: "Constitution Day", type: "national" },
  { date: "2026-09-25", name: "Indra Jatra", type: "local" },
  { date: "2026-10-11", name: "Ghatasthapana (Dashain begins)", type: "national" },
  { date: "2026-10-17", name: "Fulpati", type: "national" },
  { date: "2026-10-18", name: "Maha Ashtami", type: "national" },
  { date: "2026-10-19", name: "Maha Navami", type: "national" },
  { date: "2026-10-20", name: "Vijaya Dashami", type: "national" },
  { date: "2026-10-22", name: "Ekadashi (Dashain)", type: "national" },
  { date: "2026-10-23", name: "Dwadashi (Dashain)", type: "national" },
  { date: "2026-10-24", name: "Kojagrat Purnima", type: "national" },
  { date: "2026-11-08", name: "Laxmi Puja (Tihar)", type: "national" },
  { date: "2026-11-10", name: "Govardhan Puja (Tihar)", type: "national" },
  { date: "2026-11-11", name: "Bhai Tika (Tihar)", type: "national" },
  { date: "2026-11-15", name: "Chhath Puja", type: "national" },
  { date: "2026-11-24", name: "Guru Nanak Jayanti", type: "optional" },
  { date: "2026-12-24", name: "Udhauli Parva", type: "optional" },
  { date: "2026-12-25", name: "Christmas Day", type: "optional" },
  { date: "2026-12-30", name: "Tamu Losar", type: "optional" },
];

// Fast lookup: "YYYY-MM-DD" -> {name, type}
const NEPAL_HOLIDAYS_BY_DATE = Object.fromEntries(
  NEPAL_HOLIDAYS_2026.map(h => [h.date, h])
);
