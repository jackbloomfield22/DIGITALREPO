// A small .ics reader: enough for a calendar export from Google, Apple or
// Outlook. Unfolds continuation lines, reads VEVENT blocks, and understands
// the three ways a date arrives (UTC "Z", a local wall-clock time, and an
// all-day DATE). Pure, so the import is tested with fixtures.

export type IcsEvent = {
  uid: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  attendees: string[];
};

function unfold(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

function unescape(v: string): string {
  return v.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\").trim();
}

export function parseIcsDate(raw: string, params: Record<string, string>): { at: Date; allDay: boolean } | null {
  const v = raw.trim();
  if (params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    return { at: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), allDay: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "00"].map(Number);
  // A UTC stamp is exact. A wall-clock time is taken as the reader's local
  // time; without a timezone database that is the honest best.
  const at = m[7] ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
  return { at, allDay: false };
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let cur: Partial<IcsEvent> & { attendees: string[] } | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { cur = { attendees: [] }; continue; }
    if (line === "END:VEVENT") {
      if (cur && cur.startsAt && cur.title !== undefined) {
        events.push({
          uid: cur.uid ?? null, title: cur.title || "(untitled)", startsAt: cur.startsAt,
          endsAt: cur.endsAt ?? null, allDay: cur.allDay ?? false, location: cur.location ?? null,
          description: cur.description ?? null, attendees: cur.attendees,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...paramParts] = head.split(";");
    const params: Record<string, string> = {};
    for (const p of paramParts) { const [k, v] = p.split("="); if (k && v) params[k.toUpperCase()] = v; }
    switch (name.toUpperCase()) {
      case "UID": cur.uid = value.trim(); break;
      case "SUMMARY": cur.title = unescape(value); break;
      case "LOCATION": cur.location = unescape(value) || null; break;
      case "DESCRIPTION": cur.description = unescape(value) || null; break;
      case "DTSTART": { const d = parseIcsDate(value, params); if (d) { cur.startsAt = d.at; cur.allDay = d.allDay; } break; }
      case "DTEND": { const d = parseIcsDate(value, params); if (d) cur.endsAt = d.at; break; }
      case "ATTENDEE": {
        const email = value.match(/mailto:([^\s;]+)/i)?.[1] ?? null;
        const cn = params.CN?.replace(/^"|"$/g, "");
        const who = cn && email ? `${cn} <${email}>` : cn ?? email;
        if (who) cur.attendees.push(who);
        break;
      }
    }
  }
  return events;
}
