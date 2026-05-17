import { prisma } from "../src/lib/prisma"
import { auth } from "../src/lib/auth.js";
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL!;
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD!;

const main = async () => {
	console.log('[SEED] Seeding database...');

	const existing = await prisma.user.findUnique({
        where: {
            email: SEED_ADMIN_EMAIL
        }
    });

    if (existing) {
        console.log("[SEED] Admin already exists.");
        return;
    }

    const result = await auth.api.signUpEmail({
        body: {
            email: SEED_ADMIN_EMAIL,
            password: SEED_ADMIN_PASSWORD,
            name: "SISTEMA",
            lastName: "Bem-Estar Animal",
            phone: "21999999999",
            cpf: "11144477735",
            cep: "20040002",
            street: "Rua Example",
            neighborhood: "Centro",
            city: "Rio de Janeiro",
            state: "RJ",
            number: "100"
        }
    });

    await prisma.user.update({
        where: {
            email: SEED_ADMIN_EMAIL
        },
        data: {
            role: "ADMIN",
            emailVerified: true,
            phone: "000000000",
            cpf: "00000000000",
            cep: "00000000",
            street: "xxx",
            neighborhood: "xxx",
            city: "xxx",
            state: "xx",
            number: "00"
        }
    });

    console.log("[SEED] Admin created successfully.");

	/* other seed for tests */

	console.log('[SEED] Seed completed.');
}

main()
.catch((e) => {
	console.error('Seed Error:', e);
	process.exit(1);
})
.finally(async () => {
	await prisma.$disconnect();
});