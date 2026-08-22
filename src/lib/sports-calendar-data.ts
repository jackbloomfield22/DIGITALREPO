// Curated upcoming sports calendar: US professional leagues plus major world
// events. Dates marked `approximate` are traditional windows not yet
// officially locked — the calendar is fully editable in the app, so the team
// can correct dates as they're announced.

export type CalendarEventDef = {
  title: string;
  sport: string; // sport entity name (created if missing)
  league?: string;
  start: string; // ISO date
  end?: string;
  location?: string;
  approximate?: boolean;
  notes?: string;
};

export const SPORTS_CALENDAR: CalendarEventDef[] = [
  // --- 2026 ---
  { title: "US Open (Tennis)", sport: "Tennis", league: "ATP/WTA", start: "2026-08-31", end: "2026-09-13", location: "Flushing Meadows, New York" },
  { title: "NFL Season Kickoff", sport: "Football", league: "NFL", start: "2026-09-10", approximate: true, notes: "2026 regular season opening game" },
  { title: "Ryder Cup 2026", sport: "Golf", league: "PGA/DP World", start: "2026-09-25", end: "2026-09-27", location: "Adare Manor, Ireland", approximate: true },
  { title: "MLB Postseason Begins", sport: "Baseball", league: "MLB", start: "2026-10-06", approximate: true },
  { title: "NHL Opening Night", sport: "Hockey", league: "NHL", start: "2026-10-07", approximate: true },
  { title: "NBA Opening Night", sport: "Basketball", league: "NBA", start: "2026-10-20", approximate: true },
  { title: "F1 United States Grand Prix", sport: "Motorsport", league: "Formula 1", start: "2026-10-25", location: "Austin, TX", approximate: true },
  { title: "World Series", sport: "Baseball", league: "MLB", start: "2026-10-23", end: "2026-11-01", approximate: true },
  { title: "New York City Marathon", sport: "Running", start: "2026-11-01", location: "New York, NY" },
  { title: "F1 Las Vegas Grand Prix", sport: "Motorsport", league: "Formula 1", start: "2026-11-21", location: "Las Vegas, NV", approximate: true },
  { title: "F1 Abu Dhabi Grand Prix (Season Finale)", sport: "Motorsport", league: "Formula 1", start: "2026-12-06", location: "Abu Dhabi", approximate: true },
  { title: "NBA Cup Championship", sport: "Basketball", league: "NBA", start: "2026-12-15", location: "Las Vegas, NV", approximate: true },
  { title: "MLS Cup Final", sport: "Soccer", league: "MLS", start: "2026-12-05", approximate: true },
  { title: "College Football Playoff Begins", sport: "Football", league: "NCAA", start: "2026-12-19", approximate: true },

  // --- 2027 ---
  { title: "NFL Playoffs Begin (Wild Card Weekend)", sport: "Football", league: "NFL", start: "2027-01-09", approximate: true },
  { title: "College Football Playoff National Championship", sport: "Football", league: "NCAA", start: "2027-01-18", approximate: true },
  { title: "Australian Open", sport: "Tennis", league: "ATP/WTA", start: "2027-01-18", end: "2027-01-31", location: "Melbourne, Australia", approximate: true },
  { title: "Super Bowl LXI", sport: "Football", league: "NFL", start: "2027-02-14", approximate: true, notes: "Date and venue per NFL announcements — confirm as season approaches" },
  { title: "Daytona 500", sport: "Motorsport", league: "NASCAR", start: "2027-02-14", location: "Daytona Beach, FL", approximate: true },
  { title: "NBA All-Star Weekend", sport: "Basketball", league: "NBA", start: "2027-02-19", end: "2027-02-21", approximate: true },
  { title: "MLB Spring Training Begins", sport: "Baseball", league: "MLB", start: "2027-02-20", approximate: true },
  { title: "MLS Season Kickoff", sport: "Soccer", league: "MLS", start: "2027-02-27", approximate: true },
  { title: "F1 Season Opener", sport: "Motorsport", league: "Formula 1", start: "2027-03-07", approximate: true },
  { title: "NCAA March Madness (Men's & Women's Tournaments)", sport: "Basketball", league: "NCAA", start: "2027-03-16", end: "2027-04-05", approximate: true },
  { title: "MLB Opening Day", sport: "Baseball", league: "MLB", start: "2027-04-01", approximate: true },
  { title: "The Masters", sport: "Golf", league: "PGA Tour", start: "2027-04-08", end: "2027-04-11", location: "Augusta National, GA", approximate: true },
  { title: "NBA Playoffs Begin", sport: "Basketball", league: "NBA", start: "2027-04-17", approximate: true },
  { title: "Stanley Cup Playoffs Begin", sport: "Hockey", league: "NHL", start: "2027-04-19", approximate: true },
  { title: "Boston Marathon", sport: "Running", start: "2027-04-19", location: "Boston, MA" },
  { title: "Kentucky Derby", sport: "Horse Racing", start: "2027-05-01", location: "Churchill Downs, Louisville, KY" },
  { title: "F1 Miami Grand Prix", sport: "Motorsport", league: "Formula 1", start: "2027-05-02", location: "Miami, FL", approximate: true },
  { title: "WNBA Season Opens", sport: "Basketball", league: "WNBA", start: "2027-05-14", approximate: true },
  { title: "French Open (Roland-Garros)", sport: "Tennis", league: "ATP/WTA", start: "2027-05-24", end: "2027-06-06", location: "Paris, France", approximate: true },
  { title: "Indianapolis 500", sport: "Motorsport", league: "IndyCar", start: "2027-05-30", location: "Indianapolis, IN", approximate: true },
  { title: "UEFA Champions League Final", sport: "Soccer", league: "UEFA", start: "2027-06-05", approximate: true },
  { title: "NBA Finals", sport: "Basketball", league: "NBA", start: "2027-06-03", end: "2027-06-20", approximate: true },
  { title: "Stanley Cup Final", sport: "Hockey", league: "NHL", start: "2027-06-07", end: "2027-06-25", approximate: true },
  { title: "US Open (Golf)", sport: "Golf", league: "USGA", start: "2027-06-17", end: "2027-06-20", location: "Pebble Beach, CA", approximate: true },
  { title: "FIFA Women's World Cup 2027", sport: "Soccer", league: "FIFA", start: "2027-06-24", end: "2027-07-25", location: "Brazil", approximate: true },
  { title: "Wimbledon", sport: "Tennis", league: "ATP/WTA", start: "2027-06-28", end: "2027-07-11", location: "London, England", approximate: true },
  { title: "Tour de France", sport: "Cycling", league: "UCI", start: "2027-07-03", end: "2027-07-25", location: "France", approximate: true },
  { title: "MLB All-Star Game", sport: "Baseball", league: "MLB", start: "2027-07-13", approximate: true },
  { title: "The Open Championship", sport: "Golf", start: "2027-07-15", end: "2027-07-18", location: "United Kingdom", approximate: true },
  { title: "Premier League 2027–28 Season Opens", sport: "Soccer", league: "Premier League", start: "2027-08-14", location: "England", approximate: true },
  { title: "US Open (Tennis) 2027", sport: "Tennis", league: "ATP/WTA", start: "2027-08-30", end: "2027-09-12", location: "Flushing Meadows, New York", approximate: true },
  { title: "NFL 2027 Season Kickoff", sport: "Football", league: "NFL", start: "2027-09-09", approximate: true },
  { title: "World Athletics Championships 2027", sport: "Track & Field", start: "2027-09-11", end: "2027-09-19", location: "Beijing, China", approximate: true },
  { title: "Rugby World Cup 2027", sport: "Rugby", league: "World Rugby", start: "2027-10-01", end: "2027-11-13", location: "Australia", approximate: true },
  { title: "ICC Cricket World Cup 2027", sport: "Cricket", league: "ICC", start: "2027-10-09", end: "2027-11-14", location: "South Africa, Zimbabwe & Namibia", approximate: true },

  // --- 2028 headline ---
  { title: "Los Angeles 2028 Summer Olympics", sport: "Olympics", league: "IOC", start: "2028-07-14", end: "2028-07-30", location: "Los Angeles, CA" },
];
