import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { CreateEmergencyInput, ListEmergenciesQueryInput, UpdateEmergencyStatusInput } from "./emergencies.schema";

/* here, admins should not be able to create emergency requests for other users, but they should be able to attach pets from 
other users (and create pets for other users) to any emergency request because the pet data is added later */

export const emergencyService = {
    
    async create(userId: string, data: CreateEmergencyInput) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            throw new HTTPException(404, { message: "User not found" });
        }

        if (user.blockedUntil && user.blockedUntil > new Date()) {
            throw new HTTPException(403, { message: `User is blocked until ${user.blockedUntil.toLocaleDateString()}` });
        }

        return await prisma.emergencyAppointment.create({
            data: {
                userId,
                species: data.species,
                size: data.size,
                description: data.description,
                status: "PENDING"
                /* dont pass scheduleDate, period and resultPetId */
            }
        });
    },

    async listByUser(userId: string, filters?: ListEmergenciesQueryInput) {
        return await prisma.emergencyAppointment.findMany({
            where: {
                userId,
                status: filters?.status,
                species: filters?.species,
            },
            include: {
                resultPet: { select: { id: true, name: true } } // Traz o pet caso já tenha sido finalizado
            },
            orderBy: { createdAt: 'desc' } // Aqui ordenamos por criação, pois os PENDING não têm data agendada
        });
    },

    /* admin only */
    async list(userRole: string, filters?: ListEmergenciesQueryInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        return await prisma.emergencyAppointment.findMany({
            where: {
                userId: filters?.userId,
                status: filters?.status,
                species: filters?.species,
            },
            include: {
                user: { select: { name: true, phone: true, email: true } },
                resultPet: { select: { id: true, name: true } }
            },
            orderBy: [
                { status: 'asc' }, /* gets pending first */
                { createdAt: 'asc' }
            ]
        });
    },

    /* admin only */
    async updateStatus(appointmentId: string, userRole: string, data: UpdateEmergencyStatusInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const appointment = await prisma.emergencyAppointment.findUnique({
            where: { id: appointmentId }
        });

        if (!appointment) {
            throw new HTTPException(404, { message: "Emergency appointment not found" });
        }

        // Se a clínica estiver definindo como COMPLETED e enviou um resultPetId, validamos se o pet existe
        if (data.status === "COMPLETED" && data.resultPetId) {
            const petExists = await prisma.pet.findUnique({ where: { id: data.resultPetId } });
            if (!petExists) {
                throw new HTTPException(404, { message: "Result Pet ID does not exist" });
            }
        }

        // Regra de punição também se aplica a emergências se o usuário acionar e não levar/aparecer
        if (data.status === "NO_SHOW" && appointment.status !== "NO_SHOW") {
            const blockUntilDate = new Date();
            blockUntilDate.setDate(blockUntilDate.getDate() + 30);

            return await prisma.$transaction([
                prisma.emergencyAppointment.update({
                    where: { id: appointmentId },
                    data: { ...data }
                }),
                prisma.user.update({
                    where: { id: appointment.userId },
                    data: { blockedUntil: blockUntilDate }
                })
            ]);
        }

        return await prisma.emergencyAppointment.update({
            where: { id: appointmentId },
            data: { ...data }
        });
    }
};