import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

const SEED_PASSWORD = "password123";
const SEED_DOMAIN = "seed.test";

const ACCOUNT_ROLES = [
  "master",
  "sales",
  "agent",
  "owner",
  "admin",
  "developer",
] as const;

async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${SEED_DOMAIN}` } },
    select: { id: true, defaultAccount: true },
  });

  const accountIds = [...new Set(users.map((user) => user.defaultAccount))];

  await prisma.user.deleteMany({
    where: { email: { endsWith: `@${SEED_DOMAIN}` } },
  });

  if (accountIds.length) {
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
  }
}

async function createAccountUser(params: {
  role: string;
  plan?: string;
  active?: boolean;
  accountName?: string;
  memberOfAccountId?: string;
}) {
  const email = `${params.role}@${SEED_DOMAIN}`;
  const accountId = params.memberOfAccountId ?? randomUUID();
  const password = await hashPassword(SEED_PASSWORD);

  if (!params.memberOfAccountId) {
    await prisma.account.create({
      data: {
        id: accountId,
        name: params.accountName ?? `${params.role} account`,
        email,
        active: params.active ?? true,
        plan: params.plan ?? "free",
      },
    });
  }

  await prisma.user.create({
    data: {
      id: randomUUID(),
      name: params.role.charAt(0).toUpperCase() + params.role.slice(1),
      email,
      password,
      defaultAccount: accountId,
      accountUsers: {
        create: {
          accountId,
          permission: params.role,
          onboarded: true,
        },
      },
    },
  });

  return { email, accountId };
}

async function seedPlans() {
  await prisma.plan.upsert({
    where: { id: "free" },
    update: {},
    create: {
      id: "free",
      name: "Free",
      price: 0,
      interval: "month",
      currency: "brl",
      features: [{ name: "Basic access", checked: true }],
      active: true,
      isFree: true,
    },
  });
}

async function main() {
  await seedPlans();
  await cleanup();

  const created: Array<{ role: string; email: string; password: string }> = [];
  let ownerAccountId: string | undefined;

  for (const role of ACCOUNT_ROLES) {
    const result = await createAccountUser({
      role,
      accountName: role === "owner" ? "Owner account" : undefined,
    });

    if (role === "owner") {
      ownerAccountId = result.accountId;
    }

    created.push({ role, email: result.email, password: SEED_PASSWORD });
  }

  if (ownerAccountId) {
    const member = await createAccountUser({
      role: "user",
      memberOfAccountId: ownerAccountId,
    });

    created.push({
      role: "user",
      email: member.email,
      password: SEED_PASSWORD,
    });
  }

  console.log("Seed users created:");
  console.table(created);
  console.log(`Password for all users: ${SEED_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
