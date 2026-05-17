import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { 
    CreateGiveUpInput, UpdateGiveUpStatusInput, 
    CreateAdoptionInput, UpdateAdoptionStatusInput, 
    ListGiveUpRequestsQueryInput, ListAdoptionRequestsQueryInput
} from "./adoptions.schema";
import { ADOPTIONS_HISTORY_MAP } from "../../constants/constants.js";

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
            throw new HTTPException(400, { message: "Pet is already for adoption or adopted" });
        }

        /* checks if there is already a give up request for the pet */
        const existingRequest = await prisma.giveUpRequest.findFirst({
            where: { petId: data.petId, status: { in: ["PENDING"] } }
        });

        if (existingRequest) {
            throw new HTTPException(400, { message: "There is already an active or pending request for this pet" });
        }

        /* get now to create and update a medical record history */
        const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });

        const initialHistory = `[${nowInBrazilShort}] Pedido criado com status "${ADOPTIONS_HISTORY_MAP["PENDING"]}" pelo responsável.`;

        return await prisma.giveUpRequest.create({
            data: {
                ...data,
                userId,
                status: "PENDING",
                history: initialHistory
            }
        });
    },

    /* user action: cancel own give up request (hard delete) */
    async cancelGiveUp(requestId: string, userId: string) {
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
            throw new HTTPException(400, { message: `Cannot cancel an already accepted, cancelled or rejected give up request` });
        }

        return await prisma.giveUpRequest.delete({
            where: { 
                id: requestId 
            }
        });
    },

    /* routes for users to see their give up requests */
    async listGiveUpsByUser(userId: string, filters?: ListGiveUpRequestsQueryInput) {
        return await prisma.giveUpRequest.findMany({
            where: {
                userId,
                status: filters?.status ? { in: filters.status } : undefined,
            },
            include: {
                pet: { select: { id: true, name: true, species: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    /* admin only */
    async listGiveUps(userRole: string, filters: ListGiveUpRequestsQueryInput) {
        if (userRole !== "ADMIN" && userRole != "MANAGER") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        
        const limit = filters.limit;
        const page = filters.page;
        const skip = (page - 1) * limit;

        const requests = await prisma.giveUpRequest.findMany({
            where: {
                status: filters?.status ? { in: filters.status } : undefined,
                petId: filters.petId,
                userId: filters.userId,
            },
            include: {
                pet: { select: { name: true, species: true } },
                user: { select: { name: true, lastName: true, email: true, phone: true } }
            },
            orderBy: [
                { createdAt: 'desc' }, /* pending, awaiting_exams and cancelled has no date, so the oldest created comes first */
            ],
            skip: skip,
            take: limit + 1,
        });

        const hasNextPage = requests.length > limit;

        if (hasNextPage) {
            requests.pop();
        }

        return {
            data: requests,
            meta: {
                currentPage: page,
                itemsPerPage: limit,
                hasNextPage,
                hasPrevPage: page > 1
            }
        };
    },
 
    async getGiveUpById(requestId: string, userId: string, userRole: string) {
        const existingRequest = await prisma.giveUpRequest.findUnique({
            where: { id: requestId },
            include: {
                pet: {
                    select: {
                        name: true,
                        species: true,
                        gender: true,
                        size: true,
                        breed: true,
                        ownerId: true,
                        chip: true,
                        isNeutered: true,
                        allowEmergency: true,
                    }
                },
                user: {
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
            }
        });

        if (!existingRequest) {
            throw new HTTPException(404, { message: "Give up request not found" });
        }

        if ( userRole !== "ADMIN" && userRole !== "MANAGER" && existingRequest.pet.ownerId !== userId ) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        return existingRequest;
    },

    /* admin only */
    async updateGiveUpStatus(requestId: string, userRole: string, userName: string, data: UpdateGiveUpStatusInput) {
        if (userRole !== "ADMIN" && userRole !== "MANAGER") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const request = await prisma.giveUpRequest.findUnique({ 
            where: { id: requestId } 
        });
        
        if (!request) {
            throw new HTTPException(404, { message: "Give up request not found" });
        }

        if (request.status !== "PENDING") {
            throw new HTTPException(400, { message: "Cannot change the status of an already approved or rejected give up request." });
        }

        const nowInBrazil = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });

        const logEntry = `[${nowInBrazil}] Status alterado de "${ADOPTIONS_HISTORY_MAP[request.status]}" para "${ADOPTIONS_HISTORY_MAP[data.status]}" pelo administrador ${userName}`;
        
        let historyUpdate = request.history ? `${request.history}\n${logEntry}` : logEntry;

        /* if aproved, change pet adoption status to 'FOR_ADOPTION' */
        if (data.status === "APPROVED") {
            const [updatedGiveUpRequest, updatedPet] = await prisma.$transaction([
                prisma.giveUpRequest.update({
                    where: { id: requestId },
                    data: { status: "APPROVED", approvedAt: new Date(), history: historyUpdate }
                }),
                prisma.pet.update({
                    where: { id: request.petId },
                    data: { 
                        adoptionStatus: "FOR_ADOPTION",
                    }
                })
            ]);
            return updatedGiveUpRequest;
        }

        /* otherwise it is a reject */
        return await prisma.giveUpRequest.update({
            where: { id: requestId },
            data: { status: data.status }
        });
    },
    
    /* ------------ ADOPTION RELATED SERVICES ------------ */

    /* public, this must be guarded to prevent spam maybe with captcha, later on maybe use AI to check whether it is a valid reques too */
    async createAdoption(data: CreateAdoptionInput) {
        const pet = await prisma.pet.findUnique({ where: { id: data.petId } });

        if (!pet) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        if (pet.adoptionStatus !== "FOR_ADOPTION") {
            throw new HTTPException(400, { message: "This pet is not available for adoption" });
        }

        const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });

        const initialHistory = `[${nowInBrazilShort}] Pedido enviado com status ${ADOPTIONS_HISTORY_MAP["PENDING"]} por ${data.adopterName}`;

        return await prisma.adoptionRequest.create({
            data: {
                ...data,
                history: initialHistory,
                status: "PENDING"
            }
        });
    },

    /* there is no cancel adoption for users since it is a public schema */

    /* admin only, here they can accept (set pet as adoption), cancel or reject */
    async updateAdoptionStatus(requestId: string, userRole: string, userName: string, data: UpdateAdoptionStatusInput) {
        if (userRole !== "ADMIN" && userRole !== "MANAGER") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const request = await prisma.adoptionRequest.findUnique({ 
            where: { id: requestId } 
        });

        if (!request) {
            throw new HTTPException(404, { message: "Adoption Request not found" });
        }

        if (request.status !== "PENDING" && data.status !== "RETURNED") {
            throw new HTTPException(400, {
                message: "Only pending requests can be updated."
            });
        }

        if (request.status !== "APPROVED" && data.status === "RETURNED") {
            throw new HTTPException(400, {
                message: "Only approved requests can be returned."
            });
        }

        const nowInBrazil = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });

        const logEntry = `[${nowInBrazil}] Status alterado de "${ADOPTIONS_HISTORY_MAP[request.status]}" para "${ADOPTIONS_HISTORY_MAP[data.status]}" pelo administrador ${userName}`;
        
        let historyUpdate = request.history ? `${request.history}\n${logEntry}` : logEntry;

        if (data.status === "APPROVED" && request.status !== "APPROVED") {

            const activeNeutering = await prisma.neuteringAppointment.count({
                where: {
                    petId: request.petId,
                    status: { in: ["PENDING", "CONFIRMED", "AWAITING_EXAMS"] }
                }
            });

            const activeEmergency = await prisma.emergencyAppointment.count({
                where: {
                    petId: request.petId,
                    status: { in: ["PENDING", "CONFIRMED"] }
                }
            });
            
            if (activeEmergency || activeNeutering) {
                throw new HTTPException(400, {
                    message: "You cannot approve a adoption request for a pet that has an active neutering or emergency. Please resolve them first."
                });
            }

            await prisma.$transaction(async (tx) => {
                const petUpdateResult = await tx.pet.updateMany({
                    where: {
                        id: request.petId,
                        adoptionStatus: "FOR_ADOPTION"
                    },
                    data: {
                        adoptionStatus: "ADOPTED"
                    }
                });

                if (petUpdateResult.count === 0) {
                    throw new HTTPException(400, {
                        message: "Pet is no longer available for adoption"
                    });
                }

                const requestsToReject = await tx.adoptionRequest.findMany({
                    where: {
                        petId: request.petId,
                        id: { not: requestId },
                        status: "PENDING"
                    }
                });

                await Promise.all(
                    requestsToReject.map((adoptionRequest) =>
                        tx.adoptionRequest.update({
                            where: {
                                id: adoptionRequest.id
                            },
                            data: {
                                status: "REJECTED",
                                history:
                                    adoptionRequest.history ? 
                                        adoptionRequest.history + `\n [${nowInBrazil}] Pedido rejeitado automaticamente pois outro pedido de adoção para este pet foi aceito.`
                                        : `[${nowInBrazil}] Pedido rejeitado automaticamente pois outro pedido de adoção para este pet foi aceito.`
                            }
                        })
                    )
                );

                await tx.adoptionRequest.update({
                    where: { id: requestId },
                    data: {
                        status: "APPROVED",
                        adoptedAt: new Date(),
                        history: historyUpdate
                    }
                });
            });

            return {
                message: "Adoption approved successfully. Pet status set to ADOPTED."
            };
        }

        /* return pet logic */
        if (data.status === "RETURNED" && request.status === "APPROVED") {

            const updatedRequest = await prisma.$transaction(async (tx) => {

                const petUpdateResult = await tx.pet.updateMany({
                    where: {
                        id: request.petId,
                        adoptionStatus: "ADOPTED"
                    },
                    data: {
                        adoptionStatus: "NONE"
                    }
                });

                if (petUpdateResult.count === 0) {
                    throw new HTTPException(400, {
                        message: "Pet is no longer adopted"
                    });
                }

                const returnedRequest = await tx.adoptionRequest.update({
                    where: {
                        id: requestId
                    },
                    data: {
                        status: "RETURNED",
                        history: historyUpdate
                    }
                });

                return returnedRequest;
            });

            return updatedRequest;
        }

        /* rejected case */
        return await prisma.adoptionRequest.update({
            where: { id: requestId },
            data: { status: data.status, history: historyUpdate }
        });
    },

    /* there is no list adoptions by users because it is a public schema */

    /* admin only list adoption requests */
    async listAdoptions(userRole: string, filters: ListAdoptionRequestsQueryInput) {
        if (userRole !== "ADMIN" && userRole !== "MANAGER") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        
        const limit = filters.limit;
        const page = filters.page;
        const skip = (page - 1) * limit;

        const requests = await prisma.adoptionRequest.findMany({
            where: {
                status: filters?.status ? { in: filters.status } : undefined,
                petId: filters.petId,
            },
            include: {
                pet: { select: { name: true, species: true } },
            },
            orderBy: [
                { createdAt: 'desc' }, /* pending, awaiting_exams and cancelled has no date, so the oldest created comes first */
            ],
            skip: skip,
            take: limit + 1, 
        });

        const hasNextPage = requests.length > limit;

        if (hasNextPage) {
            requests.pop();
        }

        return {
            data: requests,
            meta: {
                currentPage: page,
                itemsPerPage: limit,
                hasNextPage,
                hasPrevPage: page > 1
            }
        };
    },

    /* only admins can see adoption request sent by the public */
    async getAdoptionById(neuteringId: string, userRole: string) {
        if (userRole !== "ADMIN" && userRole !== "MANAGER") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const existingRequest = await prisma.adoptionRequest.findUnique({
            where: { id: neuteringId },
            include: {
                pet: {
                    select: {
                        name: true,
                        species: true,
                        gender: true,
                        size: true,
                        breed: true,
                        ownerId: true,
                        chip: true,
                        isNeutered: true,
                        allowEmergency: true,
                    }
                }
            }
        });

        if (!existingRequest) {
            throw new HTTPException(404, { message: "Adoption request not found" });
        }

        return existingRequest;
    },

    /* get the most recent approved adoption for a specific pet, to show data on pet dashboard (user and admin) when pet is ADOPTED */
    async getLatestApprovedAdoption(userId: string, petId: string, userRole: string) {
        const existingPet = await prisma.pet.findUnique({
            where: { id: petId }
        });

        if (!existingPet) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        if (existingPet.ownerId !== userId && userRole !== "ADMIN" && userRole !== "MANAGER") {
            throw new HTTPException(404, { message: "Pet not found" });
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

        if (!latestAdoption) {
            throw new HTTPException(404, { message: "No approved adoptions found for this pet" });
        }

        return latestAdoption;
    },
};