import { prisma } from "../lib/prisma"
import { randomUUID } from "crypto"; 
import { appendHistory } from "../lib/history";
import cron from "node-cron"

/* cron job to delete inactive users (who never completed a give up / appointment) after 1 month */
const hardDeleteInactiveUsers = async () => {
    console.log("[CRON] Deleting inactive accounts...");
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usersToDelete = await prisma.user.findMany({
        where: {
            deletedAt: { lte: thirtyDaysAgo },
            neuteringAppointments: { none: { status: "COMPLETED" } },
            emergencyAppointments: { none: { status: "COMPLETED" } },
            giveupRequests: { none: { status: "APPROVED" } }
        },
        select: { 
            id: true, 
            email: true 
        }
    });

    if (usersToDelete.length === 0) {
        console.log("[CRON] 0 Total accounts deleted.");
        return { deleted: 0 };
    }

    const userIds = usersToDelete.map(u => u.id);
    const userEmails = usersToDelete.map(u => u.email);

    await prisma.$transaction(async (tx) => {
        await tx.medicalRecord.deleteMany({
            where: {
                OR: [
                    { neuteringAppointment: { userId: { in: userIds } } },
                    { emergencyAppointment: { userId: { in: userIds } } },
                    { pet: { ownerId: { in: userIds } } }
                ]
            }
        });

        await tx.adoptionRequest.deleteMany({
            where: { pet: { ownerId: { in: userIds } } }
        });
        await tx.giveUpRequest.deleteMany({
            where: { userId: { in: userIds } }
        });

        await tx.neuteringAppointment.deleteMany({
            where: { userId: { in: userIds } }
        });

        await tx.emergencyAppointment.deleteMany({
            where: { userId: { in: userIds } }
        });

        await tx.pet.deleteMany({
            where: { ownerId: { in: userIds } }
        });

        await tx.verification.deleteMany({
            where: { identifier: { in: userEmails } }
        });

        await tx.user.deleteMany({
            where: { id: { in: userIds } }
        });
    });

    console.log(`[CRON] ${userIds.length} Total accounts deleted.`);
    return { deleted: userIds.length };
}

/* cron job to anomalyze inactive users LGPD related data (those have completed give ups / appointments) after 5 years */
const anonymizeOldRecords = async () => {
    console.log("[CRON] Anonymizing 5 years old inactive/deleted accounts data...");

    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const deactivatedUsersWithHistory = await prisma.user.findMany({
        where: {
            deletedAt: { not: null },
            email: { not: { startsWith: "anon_" } },
            OR: [
                { neuteringAppointments: { some: { status: "COMPLETED" } } },
                { emergencyAppointments: { some: { status: "COMPLETED" } } },
                { giveupRequests: { some: { status: "APPROVED" } } }
            ]
        },
        include: {
            neuteringAppointments: { where: { status: "COMPLETED" }, orderBy: { updatedAt: "desc" }, take: 1 },
            emergencyAppointments: { where: { status: "COMPLETED" }, orderBy: { updatedAt: "desc" }, take: 1 },
            giveupRequests: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1 }
        }
    });

    let anonymizedCount = 0;

    for (const user of deactivatedUsersWithHistory) {
        const dates: Date[] = [];
        if (user.neuteringAppointments[0]) dates.push(user.neuteringAppointments[0].updatedAt);
        if (user.emergencyAppointments[0]) dates.push(user.emergencyAppointments[0].updatedAt);
        if (user.giveupRequests[0]) dates.push(user.giveupRequests[0].createdAt);

        const lastClinicalInteraction = new Date(Math.max(...dates.map(d => d.getTime())));

        console.log(lastClinicalInteraction)

        if (lastClinicalInteraction <= fiveYearsAgo) {
            const uuid = randomUUID();
            const newHistory = appendHistory(user.history, "Dados pessoais anonimizados automaticamente após 5 anos de retenção legal.")
            const originalEmail = user.email;

            await prisma.$transaction([
                prisma.user.update({
                    where: { id: user.id },
                    data: {
                        name: "Conta",
                        lastName: "Anonimizada",
                        cpf: `ANON_${uuid}`,
                        email: `anon_${uuid}@apagado.local`,
                        phone: "00000000000",
                        cep: "00000000",
                        street: "Removido",
                        neighborhood: "Removido",
                        city: "Removido",
                        state: "XX",
                        number: "00",
                        history: newHistory
                    }
                }),
                
                prisma.session.deleteMany({ where: { userId: user.id } }),
                prisma.account.deleteMany({ where: { userId: user.id } }),
                prisma.verification.deleteMany({ where: { identifier: originalEmail } })
            ]);
            
            anonymizedCount++;
        }
    }

    console.log(`[CRON] ${anonymizedCount} accounts successfully anonymized.`);
    return { anonymized: anonymizedCount };
}

/* "0 3 * * *" every day 06:00 UTC-0 */
cron.schedule("0 6 * * *", 
    async () => {
        try {
            await hardDeleteInactiveUsers();
            await anonymizeOldRecords();
        } catch (error) {
            console.error("❌ [CRON] Error trying to run account cleanup jobs:", error);
        }
    }
);