import { prisma } from "../../lib/prisma.js";
import type { CreatePetInput, UpdatePetInput, ListPetsParamsInput } from "./pets.schema";
import { HTTPException } from "hono/http-exception";
import { PETS_PER_USER_LIMIT } from "../../constants/constants.js"

/* admins here should be able to create pets for other users, this is necessary because when a user makes a emergency request, it
does not comes with a pet */

export const petsService = {

    /* admin only */
    async list(userRole: string, filters?: ListPetsParamsInput) {

        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        return await prisma.pet.findMany({
            where: {
                ownerId: filters?.userId, 
                species: filters?.species, 
                gender: filters?.gender,
                deletedAt: null,
                isTemporaryHome: filters?.isTemporaryHome,
                adoptionStatus: filters?.adoptionStatus,

                name: filters?.name ? {
                    contains: filters.name,
                    mode: 'insensitive'
                } : undefined,

                breed: filters?.breed ? {
                    contains: filters.breed,
                    mode: 'insensitive'
                } : undefined
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    async listByUser(userId: string, userRole: string, filters?: ListPetsParamsInput) {
        return await prisma.pet.findMany({
            where: {
                ownerId: userId,
                species: filters?.species, 
                gender: filters?.gender,
                deletedAt: userRole === "USER" ? null : undefined,
                isTemporaryHome: filters?.isTemporaryHome,
                adoptionStatus: userRole === "ADMIN" ? filters?.adoptionStatus : undefined,

                name: filters?.name ? {
                    contains: filters.name,
                    mode: 'insensitive'
                } : undefined,
                
                breed: filters?.breed ? {
                    contains: filters.breed,
                    mode: 'insensitive'
                } : undefined
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    async getById(petId: string, userId: string) {
        return await prisma.pet.findFirst({
            where: { 
                id: petId, 
                ownerId: userId,
                deletedAt: null,
            }
        });
    },

    async create(userId: string, userRole: string, data: CreatePetInput) {
        /* if the requester is an ADMIN and they sent a ownerId, they are trying to create a pet for another user */
        const targetOwnerId = (userRole === "ADMIN" && data.ownerId)  ? data.ownerId : userId;

        const petCount = await prisma.pet.count({
            where: {
                ownerId: targetOwnerId,
                deletedAt: null
            }
        });

        if (petCount >= PETS_PER_USER_LIMIT && userRole !== "ADMIN") {
            throw new HTTPException(400, { message: "Maximum pet limit per user reached" });
        }

        if (userRole !== "ADMIN") {
            delete data.chip;
            delete data.ownerId;
        }

        return await prisma.pet.create({
            data: {
                ...data,
                ownerId: targetOwnerId
            }
        });
    },

    /* users cannot update several data about pets to prevent them to confuse the clinic owners, when you create, if
    you made some mistake you should contact them to change */
    async update(petId: string, userId: string, userRole: string, data: UpdatePetInput) {
        const existingPet = await prisma.pet.findUnique({
            where: { id: petId }
        });

        if (!existingPet) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        if (existingPet.ownerId !== userId && userRole !== "ADMIN") {
            throw new HTTPException(403, { message: "You are not allowed to update this pet" });
        }

        if (existingPet.deletedAt !== null && userRole !== "ADMIN") {
            throw new HTTPException(403, { message: "You are not allowed to update this pet" });
        }

        if (userRole !== "ADMIN") {
            delete data.adoptionStatus;
            delete data.chip;
            delete data.breed;
            delete data.birthDate;
            delete data.coatColor;
        }

        return await prisma.pet.update({ 
            where: { id: petId },
            data: { ...data }
        });
    },

    /* admin only */
    async delete(petId: string, userRole: string) {

        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const existingPet = await prisma.pet.findUnique({
            where: { id: petId }
        });

        if (!existingPet) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        /* later on
        const activeAppointments = await prisma.appointment.count({
            where: {
                OR: [
                    { neutering: { petId: petId } },
                    { emergency: { petId: petId } }
                ],
                status: {
                    in: ['PENDING', 'AWAITING_CONFIRMATION', 'CONFIRMED']
                }
            }
        });

        if (activeAppointments > 0) {
            throw new HTTPException(403, { message: "You are not allowed to delete pets with future appointments. Please resolve them first"});
        } */

        return await prisma.pet.update({
            where: { id: petId },
            data: { deletedAt: new Date() }
        });
    }
};