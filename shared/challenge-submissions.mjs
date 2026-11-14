// The content formats a Challenge organizer may request. Every selected format
// describes one required BrightWay post (formats may share a post where valid).
export const CHALLENGE_POST_TYPES = Object.freeze({
  VIDEO_POST: "Video post",
  CAPTION: "Caption",
  PHOTO_POST: "Photo post",
  DOCUMENT_POST: "PDF post",
});
export const MAX_CHALLENGE_POST_TYPES = Object.keys(CHALLENGE_POST_TYPES).length;
export const newChallengePostType = (type, id) => {
  switch (type) {
    case "VIDEO_POST": return { id, type, minDurationSeconds: 15, maxDurationSeconds: 120 };
    case "CAPTION": return { id, type, minWords: 25, maxWords: 200 };
    case "PHOTO_POST": return { id, type, minImages: 1, maxImages: 4 };
    case "DOCUMENT_POST": return { id, type, maxPages: 30 };
    default: return null;
  }
};
export const countChallengeWords = text => (String(text || "").trim().match(/\S+/gu) || []).length;
export function describeChallengePostType(requirement) {
  switch (requirement.type) {
    case "VIDEO_POST": return `Video duration: ${requirement.minDurationSeconds}–${requirement.maxDurationSeconds} seconds`;
    case "CAPTION": return `Caption length: ${requirement.minWords}–${requirement.maxWords} words`;
    case "PHOTO_POST": return `Photos: ${requirement.minImages}–${requirement.maxImages} images`;
    case "DOCUMENT_POST": return `PDF: up to ${requirement.maxPages} pages`;
    default: return "";
  }
}
export function memberPostIdFromInput(input) {
  const text = String(input || "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) return text;
  const match = text.match(/(?:^|\/)explore\/posts\/member\/([0-9a-f-]{36})(?:[?#/]|$)/i);
  return match && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match[1])
    ? match[1] : "";
}
