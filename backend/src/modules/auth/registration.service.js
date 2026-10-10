import { hashPassword } from "./password.js";

export const publicAccountSelect = {
  id: true,
  username: true,
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
}) {
  return async function register(input) {
    const passwordHash = await hash(input.password);

    try {
      return await prisma.account.create({
        data: {
          username: input.username,
          email: input.email,
          passwordHash,

          person: {
            create: {
              firstName: input.firstName,
              middleName: input.middleName,
              lastName: input.lastName,
            },
          },
        },

        select: publicAccountSelect,
      });
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