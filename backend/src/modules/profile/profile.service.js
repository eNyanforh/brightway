import { normalizeInterests } from "./profile-interests.js";

import {
  educationSelect,
  experienceSelect,
  saveProfileHistory,
} from "./profile-history.service.js";

import { profileUpdateData } from "./profile.schema.js";
import { evaluateProfileCompletion } from "./profile.completion.js";

export const ownerProfileSelect = {
  educationMode: true,
  experienceMode: true,

  educationRecords: {
    select: educationSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },

  experienceRecords: {
    select: experienceSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },

  id: true,
  version: true,
  countryCode: true,
  region: true,
  locality: true,
  headline: true,
  bio: true,
  careerFieldMode: true,
  careerField: true,
  careerGoals: true,
  skills: true,
  interests: true,
  createdAt: true,
  updatedAt: true,

  photo: {
    select: { id: true },
  },
};

export function profileView(row) {
  return {
    id: row?.id ?? null,
    version: row?.version ?? 0,
    photo: row?.photo ?? null,

    education: {
      mode: row?.educationMode ?? "UNSET",
      records: row?.educationRecords ?? [],
    },

    experience: {
      mode: row?.experienceMode ?? "UNSET",
      records: row?.experienceRecords ?? [],
    },

    location: {
      countryCode: row?.countryCode ?? null,
      region: row?.region ?? null,
      locality: row?.locality ?? null,
    },

    headline: row?.headline ?? null,
    bio: row?.bio ?? null,

    careerField:
      row?.careerFieldMode === "EXPLORING"
        ? { mode: "EXPLORING" }
        : row?.careerFieldMode === "SPECIFIED"
          ? {
              mode: "SPECIFIED",
              label: row.careerField,
            }
          : null,

    careerGoals: row?.careerGoals ?? null,
    skills: row?.skills ?? [],
    interests: row?.interests ?? [],
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

function conflict() {
  return Object.assign(
    new Error(
      "Your profile changed. Reload it before saving again.",
    ),
    { status: 409 },
  );
}

export function createProfileService({ prisma }) {
  return {
    async read(personId) {
      const row = await prisma.profile.findUnique({
        where: { personId },
        select: ownerProfileSelect,
      });

      return profileView(row);
    },

    async patch(personId, input) {
      const data = profileUpdateData(input.changes);

      try {
        return await prisma.$transaction(async (tx) => {
          const existing = await tx.profile.findUnique({
            where: { personId },
            select: {
              id: true,
              version: true,
              interests: true,
            },
          });

          if (!existing) {
            if (input.expectedVersion !== 0) {
              throw conflict();
            }

            if (data.interests !== undefined) {
              data.interests = normalizeInterests(
                data.interests,
              );
            }

            const row = await tx.profile.create({
              data: {
                personId,
                ...data,
                version: 1,
              },
              select: ownerProfileSelect,
            });

            return profileView(row);
          }

          if (existing.version !== input.expectedVersion) {
            throw conflict();
          }

          if (data.interests !== undefined) {
            data.interests = normalizeInterests(
              data.interests,
              existing.interests,
            );
          }

          const result = await tx.profile.updateMany({
            where: {
              personId,
              version: input.expectedVersion,
            },
            data: {
              ...data,
              version: { increment: 1 },
            },
          });

          if (result.count !== 1) {
            throw conflict();
          }

          const row = await tx.profile.findUnique({
            where: { personId },
            select: ownerProfileSelect,
          });

          return profileView(row);
        });
      } catch (error) {
        if (error.code === "P2002") {
          throw conflict();
        }

        throw error;
      }
    },

    async saveHistory(personId, kind, input) {
      const row = await saveProfileHistory({
        prisma,
        personId,
        kind,
        input,
        select: ownerProfileSelect,
      });

      return profileView(row);
    },

    async completion(personId) {
      return evaluateProfileCompletion(
        await this.read(personId),
      );
    },
  };
}