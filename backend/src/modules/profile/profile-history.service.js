export const educationSelect = {
  id: true,
  revision: true,
  status: true,
  startMonth: true,
  endMonth: true,
  current: true,
  description: true,
  institution: true,
  qualification: true,
};
export const experienceSelect = {
  id: true,
  revision: true,
  status: true,
  startMonth: true,
  endMonth: true,
  current: true,
  description: true,
  organization: true,
  role: true,
  type: true,
};
const conflict = (
  message = "Your profile changed. Reload it before saving again.",
) => Object.assign(new Error(message), { status: 409 });
const same = (row, data) =>
  Object.entries(data).every(([key, value]) => row[key] === value);

// Global profile version serializes history, text and photo mutations.
// Review transitions are deliberately unavailable in this draft service.
export async function saveProfileHistory({
  prisma,
  personId,
  kind,
  input,
  select,
}) {
  const modeKey = `${kind}Mode`;
  const model = kind === "education" ? "educationRecord" : "experienceRecord";
  try {
    return await prisma.$transaction(async (tx) => {
      let profile = await tx.profile.findUnique({
        where: { personId },
        select: { id: true },
      });
      if (!profile) {
        if (input.expectedVersion !== 0) throw conflict();
        profile = await tx.profile.create({
          data: { personId, version: 1, [modeKey]: input.mode },
          select: { id: true },
        });
      } else {
        const locked = await tx.profile.updateMany({
          where: { personId, version: input.expectedVersion },
          data: { version: { increment: 1 }, [modeKey]: input.mode },
        });
        if (locked.count !== 1) throw conflict();
      }
      const rows = await tx[model].findMany({
        where: { profileId: profile.id },
      });
      const existing = new Map(rows.map((row) => [row.id, row]));
      const retained = new Set();
      for (const record of input.records) {
        const { id, revision, ...data } = record;
        if (!id) {
          await tx[model].create({ data: { profileId: profile.id, ...data } });
          continue;
        }
        const row = existing.get(id);
        if (!row)
          throw Object.assign(new Error("Profile record not found."), {
            status: 404,
          });
        if (row.revision !== revision) throw conflict();
        retained.add(id);
        if (same(row, data)) continue;
        if (row.status !== "DRAFT")
          throw conflict(
            "This record requires the verification review workflow before it can be changed.",
          );
        const result = await tx[model].updateMany({
          where: { id, profileId: profile.id, revision, status: "DRAFT" },
          data: { ...data, revision: { increment: 1 } },
        });
        if (result.count !== 1) throw conflict();
      }
      for (const row of rows) {
        if (retained.has(row.id)) continue;
        if (row.status !== "DRAFT")
          throw conflict(
            "Reviewed records require the verification workflow before removal.",
          );
        const result = await tx[model].deleteMany({
          where: {
            id: row.id,
            profileId: profile.id,
            revision: row.revision,
            status: "DRAFT",
          },
        });
        if (result.count !== 1) throw conflict();
      }
      return tx.profile.findUnique({ where: { personId }, select });
    });
  } catch (error) {
    if (["P2002", "P2034"].includes(error.code)) throw conflict();
    throw error;
  }
}