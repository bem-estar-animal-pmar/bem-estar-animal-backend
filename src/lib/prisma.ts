import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error("DATABASE_URL env variable is not set"); /* do not use HTTPExpection here because we need the APP to crash */
}

const adapter = new PrismaPg({
	connectionString: connectionString,
});

export const prisma = new PrismaClient({ adapter });