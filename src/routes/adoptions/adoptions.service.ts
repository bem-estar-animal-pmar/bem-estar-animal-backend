import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { 
    CreateGiveUpInput, UpdateGiveUpStatusInput, 
    CreateAdoptionInput, UpdateAdoptionStatusInput, 
    ListRequestsQueryInput 
} from "./adoptions.schema";

/* when aproving a adoption request, the pet status goes to ADOPTED, that means the owner IS NOT the owner o the pet owner field,
because adoptions can happen to people who do not necessarly have an account. If the user has an account and want to be attached 
to the pet, the admins should do it manually and update the pet status to HAS_OWNER (or maybe create a diff pet/user combo (better)) */

export const adoptionsService = {
    
    /* ------------ GIVE UP RELATED SERVICES ------------ */

    async createGiveUp(userId: string, data: CreateGiveUpInput) {
        const pet = await prisma.pet.findUnique({ 
            where: { id: data.petId } 
        });

        if (!pet) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        if (pet.ownerId !== userId) {
            throw new HTTPException(403, { message: "You can only give up your own pet" });
        }

        if (pet.adoptionStatus === "FOR_ADOPTION" || pet.adoptionStatus === "ADOPTED") {
            throw new HTTPException(400, { message: "Pet is already for adoption" });
        }

        /* checks if there is already a give up request for the pet */
        const existingRequest = await prisma.giveUpRequest.findFirst({
            where: { petId: data.petId, status: "PENDING" }
        });

        if (existingRequest) {
            throw new HTTPException(400, { message: "There is already a pending request for this pet" });
        }

        return await prisma.giveUpRequest.create({
            data: {
                userId,
                petId: data.petId,
                reason: data.reason,
                status: "PENDING"
            }
        });
    },

    /* user action: cancel own appointment */
    async cancelGiveUpByUser(requestId: string, userId: string) {
        const request = await prisma.giveUpRequest.findUnique({ 
            where: { id: requestId } 
        });

        if (!request) {
            throw new HTTPException(404, { message: "Give up request not found" });
        }

        if (request.userId !== userId) {
            throw new HTTPException(403, { message: "You can only cancel your own requests" });
        }

        if (request.status !== "PENDING") {
            throw new HTTPException(400, { message: `Cannot cancel a already completed, cancelled or rejected give up request` });
        }

        return await prisma.adoptionRequest.update({
            where: { id: requestId },
            data: { status: "CANCELLED_BY_USER"}
        });
    },

    /* admin only */
    async updateGiveUpStatus(requestId: string, userRole: string, data: UpdateGiveUpStatusInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const request = await prisma.giveUpRequest.findUnique({ 
            where: { id: requestId } 
        });
        
        if (!request) {
            throw new HTTPException(404, { message: "Give up request not found" });
        }

        /* if aproved, change pet adoption status to 'FOR_ADOPTION' and temporaryhome to true */
        if (data.status === "APPROVED" && request.status !== "APPROVED") {
            return await prisma.$transaction([
                prisma.giveUpRequest.update({
                    where: { id: requestId },
                    data: { status: "APPROVED" }
                }),
                prisma.pet.update({
                    where: { id: request.petId },
                    data: { 
                        adoptionStatus: "FOR_ADOPTION",
                    }
                })
            ]);
        }

        return await prisma.giveUpRequest.update({
            where: { id: requestId },
            data: { status: data.status }
        });
    },
    
    /* ------------ GIVE UP RELATED SERVICES ------------ */

    /* public */
    async createAdoption(data: CreateAdoptionInput) {
        const pet = await prisma.pet.findUnique({ where: { id: data.petId } });

        if (!pet) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        if (pet.adoptionStatus !== "FOR_ADOPTION") {
            throw new HTTPException(400, { message: "This pet is not available for adoption" });
        }

        return await prisma.adoptionRequest.create({
            data: {
                petId: data.petId,
                adopterName: data.adopterName,
                adopterEmail: data.adopterEmail,
                adopterPhone: data.adopterPhone,
                status: "PENDING"
            }
        });
    },

    /* admin only */
    async updateAdoptionStatus(requestId: string, userRole: string, data: UpdateAdoptionStatusInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const request = await prisma.adoptionRequest.findUnique({ 
            where: { id: requestId } 
        });

        if (!request) {
            throw new HTTPException(404, { message: "Adoption Request not found" });
        }

        if (data.status === "APPROVED" && request.status !== "APPROVED") {
            
            const rejectOthers = prisma.adoptionRequest.updateMany({
                where: { petId: request.petId, id: { not: requestId }, status: "PENDING" },
                data: { status: "REJECTED" }
            });

            const approveCurrent = prisma.adoptionRequest.update({
                where: { id: requestId },
                data: { status: "APPROVED" }
            });

            /* when an adoption is approved, we change the pet status to adopted */
            const updatePet = prisma.pet.update({
                where: { id: request.petId },
                data: { 
                    adoptionStatus: "ADOPTED",
                }
            });

            await prisma.$transaction([rejectOthers, approveCurrent, updatePet]);
            return { message: "Adoption approved and other requests rejected. Pet status set to ADOPTED" };
        }

        return await prisma.adoptionRequest.update({
            where: { id: requestId },
            data: { status: data.status }
        });
    },

    /* routes for users to see their give up requests */
    async listGiveUpsByUser(userId: string, filters?: ListRequestsQueryInput) {
        return await prisma.giveUpRequest.findMany({
            where: {
                userId,
                status: filters?.status,
            },
            include: {
                pet: { select: { id: true, name: true, species: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    /* admin only */
    async listGiveUps(userRole: string, filters?: ListRequestsQueryInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        
        return await prisma.giveUpRequest.findMany({
            where: {
                status: filters?.status,
                petId: filters?.petId,
                userId: filters?.userId,
            },
            include: {
                pet: { select: { name: true, species: true } },
                user: { select: { name: true, phone: true } }
            },
            orderBy: [ { status: 'asc' }, { createdAt: 'desc' } ]
        });
    },

    /* admin only list adoption requests */
    async listAdoptions(userRole: string, filters?: ListRequestsQueryInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        
        return await prisma.adoptionRequest.findMany({
            where: {
                status: filters?.status,
                petId: filters?.petId,
            },
            include: {
                pet: { select: { name: true, species: true } }
            },
            orderBy: [ { status: 'asc' }, { createdAt: 'desc' } ]
        });
    }
};