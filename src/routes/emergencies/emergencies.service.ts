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

        let resultSpecies = data.species;
        if (data.petId) {
            const petExists = await prisma.pet.findUnique({ 
                where: { id: data.petId } 
            });
            if (!petExists) {
                throw new HTTPException(404, { message: "Result Pet ID does not exist" });
            }
            if (petExists.ownerId != userId && userRole != "ADMIN") {
                throw new HTTPException(401, { message: "You are not allowed to create an emergency appointment for this pet" });
            }
            resultSpecies = petExists.species; // if user selected a pet pass down the species from the pet to prevent inconsistency
        }

        return await prisma.emergencyAppointment.create({
            data: {
                ...data,
                userId,
                status: "PENDING",
                species: resultSpecies
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
                pet: { select: { id: true, name: true } } /* if it is a completed (or already have pet registered) appointment, we include the pet */
            },
            orderBy: { createdAt: 'desc' } /* ordered by creation date because pending emergencies does not have scheduleDate */
        });
    },

    /* admin only */
    async list(userRole: string, filters: ListEmergenciesQueryInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const limit = filters.limit;
        const page = filters.page;
        const skip = (page - 1) * limit;

        const appointments = await prisma.emergencyAppointment.findMany({
            where: {
                userId: filters.userId,
                status: filters.status,
                species: filters.species,
            },
            include: {
                user: { select: { name: true, phone: true, email: true } },
                pet: { select: { id: true, name: true } }
            },
            orderBy: [
                { status: 'asc' }, /* gets pending first */
                { createdAt: 'asc' }
            ],
            skip: skip,
            take: limit + 1, // O truque N+1
        });

        const hasNextPage = appointments.length > limit;

        if (hasNextPage) {
            appointments.pop();
        }

        return {
            data: appointments,
            meta: {
                currentPage: page,
                itemsPerPage: limit,
                hasNextPage,
                hasPrevPage: page > 1
            }
        };
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
        if (data.petId) {
            const petExists = await prisma.pet.findUnique({ 
                where: { id: data.petId } 
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