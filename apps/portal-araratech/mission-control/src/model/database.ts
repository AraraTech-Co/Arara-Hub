import prisma from "./prisma";

export const connect = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log("Connected to PostgreSQL 👍");
  } catch (err) {
    console.error(err);
    throw err;
  }
};

export const disconnect = async (): Promise<void> => {
  await prisma.$disconnect();
};
