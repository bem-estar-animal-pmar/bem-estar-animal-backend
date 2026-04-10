import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { CreateEmergencyInput, ListEmergenciesQueryInput, UpdateEmergencyStatusInput } from "./emergencies.schema";

/* here, admins should not be able to create emergency requests for other users, but they should be able to attach pets from 
other users (and create pets for other users) to any emergency request because the pet data is added later */

/* they also should be able to create emergency requests for themselves (stray animals they found) */

export const emergencyService = {
    
    async create(userId: string, userRole: string, data: CreateEmergencyInput) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            throw new HTTPException(404, { message: "User not found" });
        }

        if (user.blockedUntil && user.blockedUntil > new Date()) {
            throw new HTTPException(403, { message: `User is blocked until ${user.blockedUntil.toLocaleDateString()}` });
        }

        if (userRole !== "ADMIN") {
            delete data.scheduleDate;
            delete data.period;
        }

        return await prisma.emergencyAppointment.create({
            data: {
                userId,
                status: "PENDING",
                ...data
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
                resultPet: { select: { id: true, name: true } } /* if it is a completed (or already have pet registered) appointment, we include the pet */
            },
            orderBy: { createdAt: 'desc' } /* ordered by creation date because pending emergencies does not have scheduleDate */
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
        
        /* if the clinic sent a petId to attach, we should check if it exists */
        if (data.resultPetId) {
            const petExists = await prisma.pet.findUnique({ 
                where: { id: data.resultPetId } 
            });
            if (!petExists) {
                throw new HTTPException(404, { message: "Result Pet ID does not exist" });
            }
        }
        
        /* punishment also happens if the emergency request was NO_SHOW */
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