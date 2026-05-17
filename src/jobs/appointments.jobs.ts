import { prisma } from "../lib/prisma";
import { MEDICAL_RECORDS_MAP } from "../constants/constants";

let running = false;

const updateExpiredAppointments = async () => {
    if (running) return;
    running = true;

    try {
        const now = new Date();
        /* date limits */
        const neuteringExpirationDate = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        );
        const emergencyExpirationDate = new Date(now.getTime() - 1000 * 60 * 60 * 24);
        const thirtyDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);

        /* search expired neuterings and emergencies */
        const [expiredNeuterings, expiredEmergencies] = await Promise.all([
            prisma.neuteringAppointment.findMany({
                where: {
                    OR: [
                        {
                            // Regra original: Passou da data agendada
                            status: { in: ["CONFIRMED", "PENDING", "AWAITING_EXAMS"] },
                            scheduleDate: { lt: neuteringExpirationDate }
                        },
                        {
                            // Nova regra: PENDENTE ou AGUARDANDO EXAMES há mais de 30 dias
                            status: { in: ["PENDING", "AWAITING_EXAMS"] },
                            createdAt: { lt: thirtyDaysAgo }
                        }
                    ]
                },
                include: { medicalRecord: true }
            }),
            prisma.emergencyAppointment.findMany({
                where: {
                    OR: [
                        {
                            // Regra original: Passou das 24h agendadas
                            status: { in: ["CONFIRMED", "PENDING"] },
                            scheduleDate: { lt: emergencyExpirationDate }
                        },
                        {
                            // Nova regra: PENDENTE há mais de 30 dias
                            status: "PENDING",
                            createdAt: { lt: thirtyDaysAgo }
                        }
                    ]
                },
                include: { medicalRecord: true }
            })
        ]);

        if (expiredNeuterings.length === 0 && expiredEmergencies.length === 0) {
            return; /* end if there is nothing to clean up */
        }

        /* log text */
        const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });
        const statusString = MEDICAL_RECORDS_MAP["CANCELLED"] || "Cancelado";
        const logEntry = `[${nowInBrazilShort}] Status alterado para "${statusString}" automaticamente pelo sistema (prazo expirado).`;

        /* do a list of prisma update promises */
        const updatePromises: any[] = [];

        for (const appt of expiredNeuterings) {
            const newHistory = appt.medicalRecord?.history
                ? `${appt.medicalRecord.history}\n${logEntry}`
                : logEntry;

            updatePromises.push(
                prisma.neuteringAppointment.update({
                    where: { id: appt.id },
                    data: {
                        status: "CANCELLED",
                        medicalRecord: appt.medicalRecord ? {
                            update: { history: newHistory }
                        } : undefined
                    }
                })
            );
        }

        for (const appt of expiredEmergencies) {
            const newHistory = appt.medicalRecord?.history
                ? `${appt.medicalRecord.history}\n${logEntry}`
                : logEntry;

            updatePromises.push(
                prisma.emergencyAppointment.update({
                    where: { id: appt.id },
                    data: {
                        status: "CANCELLED",
                        medicalRecord: appt.medicalRecord ? {
                            update: { history: newHistory }
                        } : undefined
                    }
                })
            );
        }

        await Promise.all(updatePromises); /* run all */

        console.log(`
            [CRON] Cleanup concluded:
            - ${expiredNeuterings.length} expired neutering appointments cancelled.
            - ${expiredEmergencies.length} expired emergency appointments cancelled.
        `);
        
    } catch (error) {
        console.error("[CRON] Job failed:", error);
    } finally {
        running = false;
    }
};

setInterval(updateExpiredAppointments, 1000 * 60 * 5);
updateExpiredAppointments();