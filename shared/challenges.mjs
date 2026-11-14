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
