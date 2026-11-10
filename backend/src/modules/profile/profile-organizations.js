// A cosmetic link to an official BrightWay organization, not proof of employment
// or study. Match only unambiguous, fully set-up, approved organization names.
const key = value => typeof value === "string" ? value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en") : "";
const label = (kind, name) => kind + ":" + key(name);

async function organizationMatches(db, entries) {
  const names = [...new Set(entries.map(item => item.name?.trim()).filter(Boolean))].slice(0, 60);
  if (!names.length || typeof db.organization?.findMany !== "function") return new Map();
  const rows = await db.organization.findMany({
    where: {
      status: "ACTIVE", request: { status: "APPROVED" },
      profileReadyAt: { not: null }, profilePhotoId: { not: null },
      OR: names.map(name => ({ name: { equals: name, mode: "insensitive" } })),
    },
    select: { id: true, name: true, type: true, offersTraining: true, profilePhotoId: true },
    take: 100,
  });
  const matches = new Map();
  const duplicates = new Set();
  for (const row of rows) {
    const avatar = {
      id: row.id,
      name: row.name,
      photoUrl: `/api/v1/organizations/${encodeURIComponent(row.id)}/photo/${encodeURIComponent(row.profilePhotoId)}`,
    };
    for (const kind of ["education", "experience"]) {
      if (kind === "education" && row.type !== "SCHOOL" && !row.offersTraining) continue;
      const id = label(kind, row.name);
      if (matches.has(id)) duplicates.add(id);
      else matches.set(id, avatar);
    }
  }
  for (const id of duplicates) matches.delete(id);
  return matches;
}

export async function withProfileOrganizationAvatars(db, profile) {
  const education = profile?.education?.records ?? [];
  const experience = profile?.experience?.records ?? [];
  const entries = [
    ...education.map(row => ({ kind: "education", name: row.institution })),
    ...experience.map(row => ({ kind: "experience", name: row.organization })),
  ];
  const matches = await organizationMatches(db, entries);
  const decorate = (records, kind, field) => records.map(record => {
    const organizationAvatar = matches.get(label(kind, record[field]));
    return organizationAvatar ? { ...record, organizationAvatar } : record;
  });
  if (!matches.size) return profile;
  return {
    ...profile,
    education: { ...profile.education, records: decorate(education, "education", "institution") },
    experience: { ...profile.experience, records: decorate(experience, "experience", "organization") },
  };
}

export async function withCredentialOrganizationAvatars(db, credentials) {
  const matches = await organizationMatches(db, credentials.map(record => ({ kind: record.kind, name: record.organization })));
  return credentials.map(record => {
    const organizationAvatar = matches.get(label(record.kind, record.organization));
    return organizationAvatar ? { ...record, organizationAvatar } : record;
  });
}
