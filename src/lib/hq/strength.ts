// Scores that say how alive something is. Pure, explained in words, and
// deliberately simple enough to reason about: recency, frequency and depth
// for a relationship; recency, a written next step and heat for a card.

const DAY = 86_400_000;

export type StrengthInput = {
  tier: string;
  lastContactAt: Date | null;
  interactionDates: Date[]; // any order
  cardsTogether: number;
  mentions: number;
};

export type Strength = { score: number; label: "strong" | "steady" | "fading" | "dormant" | "new"; why: string };

export function relationshipStrength(r: StrengthInput, now = new Date()): Strength {
  const since = r.lastContactAt ? (now.getTime() - r.lastContactAt.getTime()) / DAY : null;
  const last90 = r.interactionDates.filter((d) => now.getTime() - d.getTime() < 90 * DAY).length;
  const last365 = r.interactionDates.filter((d) => now.getTime() - d.getTime() < 365 * DAY).length;
  if (since === null && last365 === 0) return { score: 0, label: "new", why: "no contact logged yet" };

  // Recency: full marks inside a week, gone by six months.
  const recency = since === null ? 0 : Math.max(0, 1 - Math.max(0, since - 7) / 175);
  // Frequency: three conversations a quarter is a live relationship.
  const frequency = Math.min(1, last90 / 3) * 0.7 + Math.min(1, last365 / 8) * 0.3;
  // Depth: things you actually do together, and how often they come up in your writing.
  const depth = Math.min(1, r.cardsTogether / 2) * 0.6 + Math.min(1, r.mentions / 6) * 0.4;
  const tierBonus = r.tier === "inner" ? 0.1 : r.tier === "active" ? 0.05 : 0;
  const score = Math.round(Math.min(100, (recency * 0.45 + frequency * 0.35 + depth * 0.2 + tierBonus) * 100));
  const label: Strength["label"] = score >= 65 ? "strong" : score >= 40 ? "steady" : score >= 15 ? "fading" : "dormant";
  const bits = [
    since === null ? "no contact date" : since < 1 ? "spoke today" : `${Math.floor(since)}d since contact`,
    last90 ? `${last90} in 90d` : "none in 90d",
    r.cardsTogether ? `${r.cardsTogether} card${r.cardsTogether > 1 ? "s" : ""} together` : "",
  ].filter(Boolean);
  return { score, label, why: bits.join(" · ") };
}

export type MomentumInput = {
  heat: number;
  stage: string;
  nextStep: string | null;
  nextStepDue: Date | null;
  lastContactAt: Date | null;
  updatedAt: Date;
  activity30: number; // interactions with its people + edits in the last 30 days
};

export type Momentum = { score: number; label: "moving" | "steady" | "stalling" | "stalled"; why: string };

export function cardMomentum(c: MomentumInput, now = new Date()): Momentum {
  const sinceContact = c.lastContactAt ? (now.getTime() - c.lastContactAt.getTime()) / DAY : null;
  const sinceEdit = (now.getTime() - c.updatedAt.getTime()) / DAY;
  const recency = Math.max(0, 1 - Math.min(sinceContact ?? 60, sinceEdit) / 45);
  const plan = c.nextStep ? (c.nextStepDue && c.nextStepDue.getTime() < now.getTime() - DAY ? 0.4 : 1) : 0;
  const activity = Math.min(1, c.activity30 / 4);
  const heat = (c.heat - 1) / 2;
  const score = Math.round(Math.min(100, (recency * 0.4 + plan * 0.3 + activity * 0.2 + heat * 0.1) * 100));
  const label: Momentum["label"] = score >= 65 ? "moving" : score >= 40 ? "steady" : score >= 20 ? "stalling" : "stalled";
  const why = [
    c.nextStep ? (plan < 1 ? "next step overdue" : "next step set") : "no next step",
    sinceContact === null ? "no contact logged" : `${Math.floor(sinceContact)}d since contact`,
    c.activity30 ? `${c.activity30} touches in 30d` : "quiet 30d",
  ].join(" · ");
  return { score, label, why };
}
