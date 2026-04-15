import { prisma } from "../../lib/prisma.js";
import type { CreatePetInput, UpdatePetInput, ListPetsParamsInput, ListPetsForAdoptionParamsInput } from "./pets.schema";
import { HTTPException } from "hono/http-exception";
import { PETS_PER_USER_LIMIT } from "../../constants/constants.js"

/* admins here should be able to create pets for other users, this is necessary because when a user makes a emergency request, it
does not comes with a pet */

/* when aproving a adoption request, the pet status goes to ADOPTED, that means the owner IS NOT the owner of the pet owner field,
because adoptions can happen to people who do not necessary have an account. If the user has an account and want to be attached 
to the pet, the admins should do it manually and update the pet status to HAS_OWNER (or maybe create a diff pet/user combo (better)) */

export const petsService = {

    /* public, lists pets for adoption so not logged users can create adopt requests */
    async listForAdoption(filters?: ListPetsForAdoptionParamsInput) {
        return await prisma.pet.findMany({
            where: {
                species: filters?.species, 
                gender: filters?.gender,
                deletedAt: null,
                adoptionStatus: "FOR_ADOPTION",
            },
            select: {
                id: true,
                name: true,
                species: true,
                gender: true,
                breed: true,
                weight: true,
                coatColor: true,
                birthDate: true,
                /* we exclude ownerId, chip, createdAt, updatedAt, deletedAt from the result because
                the returned data is meant just to be shown to public users */
            },
            orderBy: { createdAt: 'desc' }
        });
    },

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
                adoptionStatus: filters?.adoptionStatus,
                name: filters?.name ? {
                    contains: filters.name,
                    mode: 'insensitive'
                } : undefined,
                breed: filters?.breed ? {
                    equals: filters.breed,
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
                adoptionStatus: userRole === "ADMIN" ? filters?.adoptionStatus : undefined,
                name: filters?.name ? {
                    contains: filters.name,
                    mode: 'insensitive'
                } : undefined,
                
                breed: filters?.breed ? {
                    equals: filters.breed,
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