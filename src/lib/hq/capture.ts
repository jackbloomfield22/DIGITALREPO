// The one box. Anything typed into HQ's capture bar is read into a task, a
// follow-up, an event, an idea or a note without a form: "call Alex tomorrow"
// is a follow-up with Alex due tomorrow; "idea: prank format with retired
// QBs" is an idea; "lunch w/ Sam Rivers thu 1pm" is an event with Sam on
// Thursday at one. Pure, so it is tested without a database; the action that
// runs it resolves names to people and #refs to pipeline cards.

export type CaptureKind = "task" | "follow_up" | "event" | "idea" | "note";

export type Captured = {
  kind: CaptureKind;
  title: string;
  body?: string;
  dueAt?: Date;
  startsAt?: Date;
  hasTime: boolean;
  personName?: string;
  pipelineRef?: string;
  tags: string[];
  /** The rules that fired, in words — shown so the reader can see why it landed where it did. */
  reading: string[];
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_SHORT: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const FOLLOW_UP_VERBS = /^(call|phone|ring|email|text|dm|ping|message|follow[- ]?up (?:with|on)|check in (?:with|on)|chase|nudge|reply to|get back to|intro(?:duce)? .*? to)\b/i;
const EVENT_WORDS = /\b(meeting|meet|lunch|dinner|coffee|drinks|breakfast|zoom|call)\b\s+(?:with|w\/)\s+/i;
const CONTACT_WITH = /\b(?:with|w\/)\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3})/;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Find a date phrase; return the date, the phrase, and whether a time was given. */
export function readDate(text: string, now: Date): { at: Date; phrase: string; hasTime: boolean } | null {
  const lower = text.toLowerCase();
  let at: Date | null = null;
  let phrase = "";

  const rel = lower.match(/\b(today|tonight|tomorrow|tmrw|tmw|day after tomorrow|eod|eow|end of (?:the )?week|next week|next month|this weekend)\b/);
  if (rel) {
    phrase = rel[1];
    const base = startOfDay(now);
    switch (rel[1]) {
      case "today": case "tonight": case "eod": at = base; break;
      case "tomorrow": case "tmrw": case "tmw": at = addDays(base, 1); break;
      case "day after tomorrow": at = addDays(base, 2); break;
      case "eow": case "end of week": case "end of the week": at = addDays(base, ((5 - base.getDay()) + 7) % 7 || 0); break;
      case "next week": at = addDays(base, ((1 - base.getDay()) + 7) % 7 || 7); break;
      case "next month": at = new Date(base.getFullYear(), base.getMonth() + 1, 1); break;
      case "this weekend": at = addDays(base, ((6 - base.getDay()) + 7) % 7 || 7); break;
    }
  }
  if (!at) {
    const inN = lower.match(/\bin (\d+|a|an|one|two|three|four|five) (day|days|week|weeks|month|months)\b/);
    if (inN) {
      const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
      const n = words[inN[1]] ?? Number(inN[1]);
      const unit = inN[2].startsWith("week") ? 7 : inN[2].startsWith("month") ? 30 : 1;
      at = addDays(startOfDay(now), n * unit);
      phrase = inN[0];
    }
  }
  if (!at) {
    const wd = lower.match(/\b(?:(next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/);
    if (wd) {
      const idx = WEEKDAYS.indexOf(wd[2]) >= 0 ? WEEKDAYS.indexOf(wd[2]) : WEEKDAY_SHORT[wd[2]];
      const base = startOfDay(now);
      let delta = (idx - base.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // "friday" said on a Friday means next Friday
      if (wd[1] === "next" && delta < 7) delta += 7;
      at = addDays(base, delta);
      phrase = wd[0];
    }
  }
  if (!at) {
    const md = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    const dm = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/);
    const m = md ? { mon: md[1], day: md[2], phrase: md[0] } : dm ? { mon: dm[2], day: dm[1], phrase: dm[0] } : null;
    if (m) {
      const month = MONTHS.indexOf(m.mon.slice(0, 3));
      let d = new Date(now.getFullYear(), month, Number(m.day));
      if (d < startOfDay(now)) d = new Date(now.getFullYear() + 1, month, Number(m.day));
      at = d;
      phrase = m.phrase;
    }
  }
  if (!at) {
    const num = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (num) {
      const y = num[3] ? (num[3].length === 2 ? 2000 + Number(num[3]) : Number(num[3])) : now.getFullYear();
      let d = new Date(y, Number(num[1]) - 1, Number(num[2]));
      if (!num[3] && d < startOfDay(now)) d = new Date(y + 1, Number(num[1]) - 1, Number(num[2]));
      at = d;
      phrase = num[0];
    }
  }
  if (!at) return null;

  let hasTime = false;
  const time = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s+)(\d{1,2})(?::(\d{2}))?\b/);
  if (time) {
    let h = Number(time[1] ?? time[4]);
    const min = Number(time[2] ?? time[5] ?? 0);
    const ap = time[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (!ap && h < 8) h += 12; // "at 3" means the afternoon in this line of work
    at.setHours(h, min, 0, 0);
    hasTime = true;
    phrase = phrase + " " + time[0].trim();
  } else if (phrase === "tonight") {
    at.setHours(19, 0, 0, 0);
    hasTime = true;
  }
  return { at, phrase, hasTime };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function capture(raw: string, now = new Date()): Captured {
  let text = raw.trim().replace(/\s+/g, " ");
  const reading: string[] = [];
  const tags: string[] = [];
  let kind: CaptureKind = "task";
  let body: string | undefined;

  // A body after a blank line or " -- " stays with the item as its notes.
  const split = raw.trim().split(/\n\s*\n|\s+--\s+/);
  if (split.length > 1) {
    text = split[0].trim().replace(/\s+/g, " ");
    body = split.slice(1).join("\n\n").trim();
  }

  // Explicit kind prefix wins over everything.
  const prefix = text.match(/^(idea|note|todo|task|follow[- ]?up|fu|event|meeting|remind me to|remember to)\s*[:\-–]?\s+/i);
  if (prefix) {
    const p = prefix[1].toLowerCase().replace(/[- ]/g, "");
    kind = p === "idea" ? "idea" : p === "note" ? "note" : p === "event" || p === "meeting" ? "event" : p === "followup" || p === "fu" ? "follow_up" : "task";
    text = text.slice(prefix[0].length);
    reading.push(`"${prefix[1].trim()}" → ${kind.replace("_", "-")}`);
  }

  // #ref is a pipeline card (or a tag if nothing matches); @Name is a person.
  let pipelineRef: string | undefined;
  let personName: string | undefined;
  text = text.replace(/#([\w-]+)/g, (_, ref) => {
    if (!pipelineRef) { pipelineRef = ref; reading.push(`#${ref} → card or tag`); } else tags.push(ref);
    return "";
  });
  text = text.replace(/@([A-Za-z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3})/g, (_, name) => {
    personName = name.trim();
    reading.push(`@${personName} → person`);
    return "";
  });
  text = text.replace(/\s+/g, " ").trim();

  const date = readDate(text, now);
  if (date) {
    reading.push(`"${date.phrase}" → ${date.at.toDateString()}${date.hasTime ? " at " + date.at.toTimeString().slice(0, 5) : ""}`);
    text = text.replace(new RegExp("\\b(?:on|by|for|at)?\\s*" + date.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"), " ").replace(/\s+/g, " ").trim();
    text = text.replace(/\s+(on|by|at|for)$/i, "");
  }

  if (!prefix) {
    if (EVENT_WORDS.test(text) && date?.hasTime) {
      kind = "event";
      reading.push("a meal or meeting with someone at a time → event");
    } else if (FOLLOW_UP_VERBS.test(text) || EVENT_WORDS.test(text)) {
      kind = "follow_up";
      reading.push("starts with a reach-out verb → follow-up");
    } else if (/\b(what if|could be|would be a great|format where|show where|series where|title:)\b/i.test(text)) {
      kind = "idea";
      reading.push("reads like a what-if → idea");
    } else if (text.length > 140 && !date) {
      kind = "note";
      reading.push("long and undated → note");
    }
  }

  if (!personName) {
    const withName = text.match(CONTACT_WITH);
    if (withName) personName = withName[1];
    else if (kind === "follow_up") {
      const verbObj = text.match(/^(?:call|phone|ring|email|text|dm|ping|message|chase|nudge|reply to|get back to)\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3})/);
      if (verbObj) personName = verbObj[1];
    }
    if (personName) reading.push(`"${personName}" → person`);
  }

  const title = titleCase(text.replace(/[.\s]+$/, "")) || titleCase(raw.trim().split("\n")[0]);
  return {
    kind,
    title,
    body,
    dueAt: kind === "task" || kind === "follow_up" ? date?.at : undefined,
    startsAt: kind === "event" ? date?.at : undefined,
    hasTime: !!date?.hasTime,
    personName,
    pipelineRef,
    tags,
    reading,
  };
}
