import { prisma } from "../../lib/prisma.js";
import type { CreatePetInput, AdminCreatePetInput, AdminUpdatePetInput, ListPetsParamsInput, ListPetsForAdoptionParamsInput } from "./pets.schema";
import { HTTPException } from "hono/http-exception";
import { PETS_PER_USER_LIMIT } from "../../constants/constants.js"

/* admins here should be able to create pets for other users, this is necessary because when a user makes a emergency request, it
does not comes with a pet */

/* when aproving a adoption request, the pet status goes to ADOPTED, that means the owner IS NOT the owner of the pet owner field,
because adoptions can happen to people who do not necessary have an account. If the user has an account and want to be attached 
to the pet, the admins should do it manually and update the pet status to HAS_OWNER (or maybe create a diff pet/user combo (better)) */

export const petsService = {

    /* services related to adoption and give up */

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
                isNeutered: true,
                /* we exclude ownerId, chip, createdAt, updatedAt, deletedAt from the result because
                the returned data is meant just to be shown to public users */
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    async undoGiveUp(petId: string, userId: string, userRole: string) {
        const existingPet = await prisma.pet.findUnique({
            where: { id: petId }
        });

        if (!existingPet) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        if (userRole !== "ADMIN" && existingPet.ownerId !== userId) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        if (existingPet.adoptionStatus !== "FOR_ADOPTION") {
            throw new HTTPException(401, { message: "Cannot cancel give up beucase pet is adopted or already not for adoption" });
        }

        return await prisma.pet.updateMany({ /* call it agaion with updateMany to avoid race condition */
            where: {
                id: petId,
                adoptionStatus: "FOR_ADOPTION"
            },
            data: {
                adoptionStatus: "NONE"
            }
        });
    },

    /* admin only: undo a pet adoption */
    async returnPet(petId: string, userId: string, userRole: string) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const existingPet = await prisma.pet.findUnique({
            where: { id: petId }
        });

        if (!existingPet) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        if (existingPet.adoptionStatus !== "ADOPTED") {
            throw new HTTPException(401, { message: "Pet is not adopted" });
        }

        const latestAdoption = await prisma.adoptionRequest.findFirst({
            where: {
                petId: petId,
                status: "APPROVED",
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        /* if there is an approved adoption, set it as returned and change pet adoptionStatus */
        if (latestAdoption) {
            const [, updatedPet] = await prisma.$transaction([
                prisma.adoptionRequest.update({
                    where: { id: latestAdoption.id },
                    data: {
                        status: "RETURNED"
                    }
                }),
                prisma.pet.update({
                    where: { id: existingPet.id },
                    data: { adoptionStatus: "NONE" }
                })
            ]);
            return updatedPet;
        }
        /* if not, only update pet adoptionStatus */
        return await prisma.pet.update({
            where: { id: existingPet.id },
            data: { adoptionStatus: "NONE" }
        })

    },

    /* general pet services */

    /* user, admin services */

    async listByUser(userId: string, userRole: string, filters?: ListPetsParamsInput) {
        return await prisma.pet.findMany({
            where: {
                ownerId: userId,
                species: filters?.species, 
                gender: filters?.gender,
                deletedAt: userRole === "USER" ? null : undefined,
                adoptionStatus: userRole === "ADMIN" ? filters?.adoptionStatus : undefined,
                homeStatus: userRole === "ADMIN" ? filters?.homeStatus : undefined,
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

    /* admin can request pet from a user, users can only request their own */
    async getById(petId: string, userId: string, userRole: string) {
        const existingPet = await prisma.pet.findUnique({
            where: { id: petId },
            include: {
                owner: { 
                    select: { 
                        name: true, 
                        lastName: true, 
                        email: true, 
                        phone: true, 
                        cep: true,
                        street: true, 
                        neighborhood: true,
                        city: true,
                        state: true,
                        number: true
                    } 
                }
            },
        });

        if (!existingPet) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        if (existingPet.ownerId !== userId && userRole !== "ADMIN") {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        return existingPet;
    },

    async create(userId: string, data: CreatePetInput) {
        const petCount = await prisma.pet.count({
            where: {
                ownerId: userId,
                deletedAt: null
            }
        });

        if (petCount >= PETS_PER_USER_LIMIT) {
            throw new HTTPException(400, { message: "Maximum pet limit per user reached" });
        }

        return await prisma.pet.create({
            data: {
                ...data,
                ownerId: userId
            }
        });
    },

    /* admin only services */

    /* admins are allowed to create pets for other users, mostly happens after an emergency completion */
    async createByAdmin(targetUserId: string, userRole: string, data: AdminCreatePetInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        const userExists = await prisma.user.findUnique({
            where: {
                id: targetUserId
            }
        })
        if (!userExists) {
            throw new HTTPException(401, { message: "User not found" });
        }
        return await prisma.pet.create({
            data: {
                ...data,
                ownerId: targetUserId
            }
        });
    },

    async updateByAdmin(petId: string, userId: string, userRole: string, data: AdminUpdatePetInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        const existingPet = await prisma.pet.findUnique({
            where: { id: petId }
        });

        if (!existingPet) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        return await prisma.pet.update({ 
            where: { id: petId },
            data: { ...data }
        });
    },

    /* admin only */
    async listAll(userRole: string, filters: ListPetsParamsInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const limit = filters.limit;
        const page = filters.page;
        const skip = (page - 1) * limit;

        const pets = await prisma.pet.findMany({
            where: {
                ownerId: filters.userId, 
                species: filters.species, 
                gender: filters.gender,
                deletedAt: null,
                adoptionStatus: filters.adoptionStatus,
                name: filters.name ? {
                    contains: filters.name,
                    mode: 'insensitive'
                } : undefined,
                breed: filters.breed ? {
                    equals: filters.breed,
                } : undefined,
                chip: filters.chip ? {
                    equals: filters.chip,
                } : undefined,
            },
            include: {
                owner: { select: { name: true, lastName: true, email: true, phone: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip: skip,
            take: limit + 1, // The N+1 trick
        });

        const hasNextPage = pets.length > limit;

        if (hasNextPage) {
            pets.pop(); 
        }

        return {
            data: pets,
            meta: {
                currentPage: page,
                itemsPerPage: limit,
                hasNextPage,
                hasPrevPage: page > 1
            }
        };
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

        const activeNeuterings = await prisma.neuteringAppointment.count({
            where: {
                petId: petId,
                status: {
                    in: ['PENDING', 'AWAITING_EXAMS', 'CONFIRMED']
                }
            }
        });

        const activeEmergencies = await prisma.emergencyAppointment.count({
            where: {
                petId: petId,
                status: {
                    in: ['PENDING', 'CONFIRMED']
                }
            }
        });

        if (activeNeuterings > 0 || activeEmergencies > 0) {
            throw new HTTPException(403, { message: "You are not allowed to delete pets with future appointments. Please resolve them first"});
        } 

        return await prisma.pet.update({
            where: { id: petId },
            data: { deletedAt: new Date() }
        });
    }
};