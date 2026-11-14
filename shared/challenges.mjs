import { POST_SUBJECT_CATEGORIES } from "./post-topics.mjs";

// Use photographs already shipped with BrightWay rather than remote image URLs.
// Only known local paths can be chosen by publishers.
export const CHALLENGE_COVER_IMAGES = Object.freeze({
  STUDENTS: "/images/hero/individuals-720.webp",
  SCHOOLS: "/images/hero/schools-720.webp",
  PARTNERS: "/images/hero/partners-720.webp",
});
export const CHALLENGE_COVER_LABELS = Object.freeze({
  STUDENTS: "Students and innovation",
  SCHOOLS: "Learning and schools",
  PARTNERS: "Teamwork and community",
});
export const DEFAULT_CHALLENGE_COVER = "STUDENTS";
export const CHALLENGE_TOPIC_OPTIONS = POST_SUBJECT_CATEGORIES;
export const MAX_CHALLENGE_TOPICS = 3;

export const CHALLENGE_PRIZE_TYPES = Object.freeze({
  CASH: "Cash",
  SCHOLARSHIP: "Scholarship",
  CERTIFICATE: "Certificate",
  MENTORSHIP: "Mentorship",
  EQUIPMENT: "Equipment or tools",
  INTERNSHIP: "Internship",
  OTHER: "Other",
});
export const CHALLENGE_MEDIA_KINDS = Object.freeze({
  SPONSOR_LOGO: "Sponsor logo",
  BACKGROUND: "Challenge background",
  TITLE_IMAGE: "Challenge title image",
  COVER: "Challenge cover photo",
});
export const MAX_CHALLENGE_SPONSORS = 5;
export const MAX_CHALLENGE_COLLABORATORS = 8;
export const MAX_CHALLENGE_PRIZES = 8;

export const CHALLENGE_PRIZE_CURRENCIES = Object.freeze({
  USD: "USD — US Dollar",
  LRD: "LRD — Liberian Dollar",
  EUR: "EUR — Euro",
  GBP: "GBP — British Pound",
  GHS: "GHS — Ghanaian Cedi",
  NGN: "NGN — Nigerian Naira",
  KES: "KES — Kenyan Shilling",
  XOF: "XOF — West African CFA Franc",
});

export const newChallengePrize = type => {
  switch (type) {
    case "CASH": return { type, amount: "", currency: "USD" };
    case "SCHOLARSHIP": return { type, coverage: "", institution: "" };
    case "CERTIFICATE": return { type, title: "", issuer: "" };
    case "MENTORSHIP": return { type, focus: "", sessions: "" };
    case "EQUIPMENT": return { type, item: "", quantity: 1 };
    case "INTERNSHIP": return { type, role: "", duration: "" };
    default: return { type: "OTHER", title: "", details: "" };
  }
};

export function challengePrizeValue(prize) {
  if (!prize) return "";
  // Older published entries used a single free-text description. Preserve
  // their display without exposing the internal type prefix on cards.
  if (typeof prize.description === "string") return prize.description.trim();
  switch (prize.type) {
    case "CASH":
      return Number.isFinite(Number(prize.amount)) && Number(prize.amount) > 0
        ? `${prize.currency} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(prize.amount)}` : "";
    case "SCHOLARSHIP": return [prize.coverage, prize.institution].filter(Boolean).join(" · ");
    case "CERTIFICATE": return [prize.title, prize.issuer].filter(Boolean).join(" · ");
    case "MENTORSHIP": return [prize.focus, prize.sessions && `${prize.sessions} sessions`].filter(Boolean).join(" · ");
    case "EQUIPMENT": return [prize.item, prize.quantity > 1 && `× ${prize.quantity}`].filter(Boolean).join(" ");
    case "INTERNSHIP": return [prize.role, prize.duration].filter(Boolean).join(" · ");
    case "OTHER": return [prize.title, prize.details].filter(Boolean).join(" · ");
    default: return "";
  }
}

export function challengeCardPrize(opportunity) {
  const prizes = Array.isArray(opportunity?.prizes) ? opportunity.prizes : [];
  if (prizes.length) {
    const first = challengePrizeValue(prizes[0]);
    const extra = prizes.length - 1;
    return first ? `${first}${extra ? ` + ${extra} more ${extra === 1 ? "prize" : "prizes"}` : ""}` : "To be announced";
  }
  const summary = (opportunity?.prize || "").trim();
  if (!summary) return "To be announced";
  const first = summary.split(" · ")[0];
  return first.replace(/^(Cash|Scholarship|Certificate|Mentorship|Equipment or tools|Internship|Other):\s*/i, "");
}
