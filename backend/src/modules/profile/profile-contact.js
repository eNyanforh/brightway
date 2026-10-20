import { z } from "zod";

export const visibilitySchema = z.enum(["ONLY_ME", "CONNECTIONS", "PUBLIC"]);
export const isPhoneNumber = (value) =>
  typeof value === "string" && /^\+[1-9]\d{6,14}$/.test(value);
const phone = z
  .string()
  .trim()
  .max(40)
  .transform((value) => value.replace(/[\s()-]/g, "") || null)
  .nullable()
  .refine(
    (value) => value === null || isPhoneNumber(value),
    "Use an international phone number starting with + and its country code.",
  );
export const contactPatchSchema = z
  .strictObject({
    phoneNumber: phone.optional(),
    whatsappNumber: phone.optional(),
    visibility: z
      .strictObject({
        email: visibilitySchema.optional(),
        phone: visibilitySchema.optional(),
        whatsapp: visibilitySchema.optional(),
      })
      .refine(
        (value) => Object.keys(value).length > 0,
        "Provide a visibility change.",
      )
      .optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide a contact change.",
  );

export const personContactSelect = {
  phoneNumber: true,
  account: { select: { email: true, emailVerifiedAt: true } },
};
export const contactSettingsSelect = {
  whatsappNumber: true,
  emailVisibility: true,
  phoneVisibility: true,
  whatsappVisibility: true,
};

export function ownerContactView(row, person = row?.person) {
  return {
    email: person?.account?.email ?? null,
    emailVerifiedAt: person?.account?.emailVerifiedAt ?? null,
    phoneNumber: person?.phoneNumber ?? null,
    whatsappNumber: row?.whatsappNumber ?? null,
    visibility: {
      email: row?.emailVisibility ?? "ONLY_ME",
      phone: row?.phoneVisibility ?? "ONLY_ME",
      whatsapp: row?.whatsappVisibility ?? "ONLY_ME",
    },
  };
}

// Resolve ownership/relationships on the server. Never accept audience flags from requests.
export function projectContact(
  contact,
  { owner = false, connected = false, blocked = false } = {},
) {
  if (blocked && !owner) return {};
  const result = {};
  for (const [field, audienceKey] of [
    ["email", "email"],
    ["phoneNumber", "phone"],
    ["whatsappNumber", "whatsapp"],
  ]) {
    const visibility = contact.visibility[audienceKey];
    if (
      (owner ||
        visibility === "PUBLIC" ||
        (visibility === "CONNECTIONS" && connected === true)) &&
      contact[field]
    )
      result[field] = contact[field];
  }
  return result;
}

export function createContactReader({
  prisma,
  relationshipFor = async () => ({ connected: false, blocked: false }),
}) {
  return async function readContact(username, viewerPersonId = null) {
    const account = await prisma.account.findUnique({
      where: { username },
      select: {
        email: true,
        status: true,
        person: {
          select: {
            id: true,
            phoneNumber: true,
            profile: { select: contactSettingsSelect },
          },
        },
      },
    });
    if (!account || account.status !== "ACTIVE")
      throw Object.assign(new Error("Profile not found."), { status: 404 });
    const owner = viewerPersonId === account.person.id;
    // Until Network provides a trusted relationship lookup, CONNECTIONS never grants access.
    const relationship =
      viewerPersonId && !owner
        ? await relationshipFor(viewerPersonId, account.person.id)
        : { connected: false, blocked: false };
    const contact = ownerContactView(account.person.profile, {
      phoneNumber: account.person.phoneNumber,
      account: { email: account.email },
    });
    return projectContact(contact, {
      owner,
      connected: relationship?.connected === true,
      blocked: relationship?.blocked === true,
    });
  };
}