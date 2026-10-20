import { hashPassword } from "./password.js";

export const publicAccountSelect = {
  id: true,
  username: true,
  platformRole: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,

  person: {
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  },
};

export function createRegistrationService({
  prisma,
  hash = hashPassword,
  photos,
  verification,
}) {
  if (!photos) throw new Error("Registration requires the photo service.");
  if (!verification) throw new Error("Registration requires email verification.");
  return async function register(input, draftToken) {
    await verification.requireVerified(draftToken, input.email);
    const passwordHash = await hash(input.password);

    try {
      return await photos.registerAsset(
        input.photoAssetId,
        draftToken,
        async (tx) => {
          const emailVerifiedAt = await verification.consume(tx, draftToken, input.email);
          return tx.account.create({
            data: {
              username: input.username,
              email: input.email,
              emailVerifiedAt,
              passwordHash,
              person: {
                create: {
                  firstName: input.firstName,
                  middleName: input.middleName,
                  lastName: input.lastName,
                  gender: input.gender,
                  birthDate: new Date(`${input.birthDate}T00:00:00.000Z`),
                },
              },
            },
            select: publicAccountSelect,
          });
        },
        { countryCode: input.countryCode }
      );
    } catch (error) {
      if (error.code === "P2002") {
        const conflict = new Error(
          "An account with these details already exists."
        );

        conflict.status = 409;
        throw conflict;
      }

      throw error;
    }
  };
}
