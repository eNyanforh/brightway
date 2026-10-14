import { profileUpdateData } from "./profile.schema.js";
import { evaluateProfileCompletion } from "./profile.completion.js";

const ownerProfileSelect = {
  id: true, version: true, countryCode: true, region: true, locality: true,
  headline: true, bio: true, careerFieldMode: true, careerField: true,
  careerGoals: true, skills: true, interests: true, createdAt: true, updatedAt: true,
  photo: { select: { id: true } },
};

export function profileView(row) {
  return {
    id: row?.id ?? null,
    version: row?.version ?? 0,
    photo: row?.photo ?? null,
    location: {
      countryCode: row?.countryCode ?? null,
      region: row?.region ?? null,
      locality: row?.locality ?? null,
    },
    headline: row?.headline ?? null,
    bio: row?.bio ?? null,
    careerField: row?.careerFieldMode === "EXPLORING"
      ? { mode: "EXPLORING" }
      : row?.careerFieldMode === "SPECIFIED"
        ? { mode: "SPECIFIED", label: row.careerField } : null,
    careerGoals: row?.careerGoals ?? null,
    // Private draft labels; do not represent approved taxonomy selections.
    skills: row?.skills ?? [],
    interests: row?.interests ?? [],
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

function conflict() {
  return Object.assign(new Error("Your profile changed. Reload it before saving again."), { status: 409 });
}

export function createProfileService({ prisma }) {
  return {
    async read(personId) {
      const row = await prisma.profile.findUnique({ where: { personId }, select: ownerProfileSelect });
      return profileView(row);
    },
    async patch(personId, input) {
      const data = profileUpdateData(input.changes);
      try {
        return await prisma.$transaction(async (tx) => {
          const existing = await tx.profile.findUnique({ where: { personId }, select: { id: true } });
          if (!existing) {
            if (input.expectedVersion !== 0) throw conflict();
            // Concurrent first saves compete on unique personId, not an upsert overwrite.
            const row = await tx.profile.create({
              data: { personId, ...data, version: 1 }, select: ownerProfileSelect,
            });
            return profileView(row);
          }
          const result = await tx.profile.updateMany({
            where: { personId, version: input.expectedVersion },
            data: { ...data, version: { increment: 1 } },
          });
          if (result.count !== 1) throw conflict();
          const row = await tx.profile.findUnique({ where: { personId }, select: ownerProfileSelect });
          return profileView(row);
        });
      } catch (error) {
        if (error.code === "P2002") throw conflict();
        throw error;
      }
    },
    async completion(personId) {
      return evaluateProfileCompletion(await this.read(personId));
    },
  };
}