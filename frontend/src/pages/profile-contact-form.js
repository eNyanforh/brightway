export const contactVisibilityOptions = {
  ONLY_ME: "Only me",
  CONNECTIONS: "Connections",
  PUBLIC: "Public",
};
export const cleanPhone = (value) =>
  value.trim().replace(/[\s()-]/g, "") || null;
export const validPhone = (value) => /^\+[1-9]\d{6,14}$/.test(value || "");

export function contactFields(profile) {
  const contact = profile.contact;
  return {
    phoneNumber: contact?.phoneNumber || "",
    whatsappNumber: contact?.whatsappNumber || "",
    emailVisibility: contact?.visibility?.email || "ONLY_ME",
    phoneVisibility: contact?.visibility?.phone || "ONLY_ME",
    whatsappVisibility: contact?.visibility?.whatsapp || "ONLY_ME",
  };
}
export function contactChanges(form, profile) {
  const previous = profile.contact || {},
    changes = {},
    visibility = {};
  for (const field of ["phoneNumber", "whatsappNumber"]) {
    const value = cleanPhone(form[field]);
    if (value !== (previous[field] ?? null)) changes[field] = value;
  }
  for (const key of ["email", "phone", "whatsapp"]) {
    if (form[`${key}Visibility`] !== (previous.visibility?.[key] || "ONLY_ME"))
      visibility[key] = form[`${key}Visibility`];
  }
  if (Object.keys(visibility).length) changes.visibility = visibility;
  return changes;
}
export function validateContact(form) {
  for (const [field, label] of [
    ["phoneNumber", "Phone"],
    ["whatsappNumber", "WhatsApp"],
  ]) {
    const value = cleanPhone(form[field]);
    if (value && !validPhone(value))
      return `${label}: use an international number starting with + and its country code.`;
  }
  return "";
}