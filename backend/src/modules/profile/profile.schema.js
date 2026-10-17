import { contactPatchSchema } from "./profile-contact.js";
import { z } from "zod";

// ISO 3166-1 country/territory codes; no country-specific region policy yet.
export const countryCodes = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ")
);

// Drafts may be incomplete. Blank optional text clears the stored value.
const text = (max) => z.string().trim().max(max).transform((v) => v || null).nullable();
const country = z.string().trim().toUpperCase()
  .refine((value) => countryCodes.has(value), "Choose a valid country code")
  .nullable();
const entries = z.array(z.string().trim().min(1).max(80)).max(20)
  .refine((values) => new Set(values.map((v) => v.toLowerCase())).size === values.length,
    "Remove duplicate entries");

export const profilePatchSchema = z.strictObject({
  expectedVersion: z.number().int().min(0).max(2147483646),
  changes: z.strictObject({
    contact: contactPatchSchema.optional(),
    location: z.strictObject({
      countryCode: country.optional(),
      region: text(100).optional(),
      locality: text(100).optional(),
    }).refine((value) => Object.keys(value).length > 0, "Provide a location change").optional(),
    headline: text(120).optional(),
    bio: text(2000).optional(),
    careerField: z.discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("EXPLORING") }),
      z.strictObject({ mode: z.literal("SPECIFIED"), label: z.string().trim().min(1).max(100) }),
    ]).nullable().optional(),
    careerGoals: text(1000).optional(),
    skills: entries.optional(),
    interests: entries.optional(),
  }).refine((value) => Object.keys(value).length > 0, "Provide at least one change"),
});

export function profileUpdateData(changes) {
  const { location, careerField, contact, ...data } = changes;
  if (contact) {
    if (Object.hasOwn(contact, "whatsappNumber")) data.whatsappNumber = contact.whatsappNumber;
    for (const [key, value] of Object.entries(contact.visibility || {})) data[`${key}Visibility`] = value;
  }
  if (location) Object.assign(data, location);
  if (Object.hasOwn(changes, "careerField")) {
    data.careerFieldMode = careerField?.mode ?? null;
    data.careerField = careerField?.mode === "SPECIFIED" ? careerField.label : null;
  }
  return data;
}