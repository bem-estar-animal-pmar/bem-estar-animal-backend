import { AdminUpdateUserInput, ListUsersQueryInput } from "./users.schema";
import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import { CURRENT_PRIVACY_POLICY_VERSION, CURRENT_TERMS_OF_SERVICE_VERSION, ROLE_STATUS_MAP } from "../../constants/constants";
import { appendHistory } from "../../lib/history";

export const usersService = {
    async list(userRole: string, filters: ListUsersQueryInput) {
        if (userRole !== "ADMIN" && userRole !== "MANAGER") {
            throw new HTTPException(403, { message: "You do not have permission to perform this action" });
        }

        const limit = filters.limit;
        const page = filters.page;
        const skip = (page - 1) * limit;

        const users = await prisma.user.findMany({
            where: {
                id: filters.id, 
                name: filters.name ? {
                    contains: filters.name,
                    mode: 'insensitive' 
                } : undefined,
                email: filters.email ? {
                    contains: filters.email,
                    mode: 'insensitive' 
                } : undefined,
                role: filters.role,
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                lastName: true,
                role: true
            },
            orderBy: { createdAt: 'desc' },
            skip: skip,
            take: limit + 1,
        });

        const hasNextPage = users.length > limit;

        if (hasNextPage) {
            users.pop(); 
        }

        return {
            data: users,
            meta: {
                currentPage: page,
                itemsPerPage: limit,
                hasNextPage,
                hasPrevPage: page > 1
            }
        };
    },

    async getById(targetUserId: string, requesterUserId: string, requesterRole: string) {
        const existingUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
                id: true,
                name: true,
                lastName: true,
                email: true,
                phone: true,
                role: true,
                createdAt: true,
                cep: true,
                cpf: true,
                street: true,
                number: true,
                state: true,
                neighborhood: true,
                city: true,
                blockedUntil: true,
                deletedAt: true,
                termsAcceptedAt: true,
                privacyAcceptedAt: true,
                termsVersion: true,
                privacyVersion: true,
                suspendedAt: true,
                updatedAt: true,
                emailVerified: true,
                history: requesterRole !== "USER" ? true : false,
            }
        });

        if (!existingUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        const isAdmin = requesterRole === "ADMIN" || requesterRole === "MANAGER";
        const isOwner = requesterUserId === targetUserId;

        if (!isAdmin && !isOwner) {
            throw new HTTPException(404, { message: "User not found" });
        }

        return existingUser;
    },

    async updateByAdmin( targetUserId: string, requesterRole: string, data: AdminUpdateUserInput ) {
        if (requesterRole !== "ADMIN") {
            throw new HTTPException(403, { message: "You do not have permission to perform this action" });
        }

        const existingUser = await prisma.user.findUnique({
            where: { id: targetUserId }
        });

        if (!existingUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        if (data.cpf && data.cpf !== existingUser.cpf) {
            const cpfInUse = await prisma.user.findFirst({
                where: {
                    cpf: data.cpf,
                    NOT: {
                        id: targetUserId
                    }
                }
            });

            if (cpfInUse) {
                throw new HTTPException(409, {
                    message: "CPF already in use"
                });
            }
        }

        const changedFields: string[] = [];

        if (data.name && data.name !== existingUser.name) {
            changedFields.push(
                `nome alterado de "${existingUser.name}" para "${data.name}"`
            );
        }

        if (data.lastName && data.lastName !== existingUser.lastName) {
            changedFields.push(
                `sobrenome alterado de "${existingUser.lastName}" para "${data.lastName}"`
            );
        }

        if (data.phone && data.phone !== existingUser.phone) {
            changedFields.push(
                `telefone alterado`
            );
        }

        if (data.cpf && data.cpf !== existingUser.cpf) {
            changedFields.push(
                `CPF alterado`
            );
        }

        if (data.cep && data.cep !== existingUser.cep) {
            changedFields.push(
                `Campo CEP alterado de "${existingUser.cep}" para "${data.cep}"`
            );
        }

        if (data.street && data.street !== existingUser.street) {
            changedFields.push(
                `Campo rua alterada de "${existingUser.street}" para "${data.street}"`
            );
        }

        if (data.neighborhood && data.neighborhood !== existingUser.neighborhood) {
            changedFields.push(
                `Campo bairro alterado de "${existingUser.neighborhood}" para "${data.neighborhood}"`
            );
        }

        if (data.city && data.city !== existingUser.city) {
            changedFields.push(
                `Campo cidade alterada de "${existingUser.city}" para "${data.city}"`
            );
        }

        if (data.state && data.state !== existingUser.state) {
            changedFields.push(
                `Campo estado alterado de "${existingUser.state}" para "${data.state}"`
            );
        }

        if (data.number && data.number !== existingUser.number) {
            changedFields.push(
                `Campo número alterado de "${existingUser.number}" para "${data.number}"`
            );
        }
        

        const history =
            changedFields.length > 0
                ? appendHistory(
                    existingUser.history,
                    `${changedFields.join(", ")} pelo administrador do SISTEMA`
                )
                : existingUser.history;

        return await prisma.user.update({
            where: { id: targetUserId },
            data: {
                ...data,
                history: history
            }
        });
    },

    async updateBlockByAdmin( targetUserId: string, requesterRole: string, blockedUntil: Date | null) {
        if (requesterRole !== "ADMIN") {
            throw new HTTPException(403, { message: "You do not have permission to perform this action" });
        }

        const existingUser = await prisma.user.findUnique({
            where: { id: targetUserId }
        });

        if (!existingUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        const history = appendHistory(
            existingUser.history,
            blockedUntil
                ? `Usuário bloqueado até ${blockedUntil.toLocaleDateString("pt-BR")} pelo administrador do SISTEMA`
                : `Bloqueio removido pelo administrador do SISTEMA`
        );

        return await prisma.user.update({
            where: {
                id: targetUserId
            },
            data: {
                blockedUntil,
                history: history
            }
        });
    },

    async updateRoleByAdmin( targetUserId: string, requesterRole: string, newRole: "USER" | "MANAGER", requesterUserId: string ) {
        if (requesterRole !== "ADMIN") {
            throw new HTTPException(403, { message: "You do not have permission to perform this action" });
        }

        const existingUser = await prisma.user.findUnique({
            where: {
                id: targetUserId
            }
        });

        if (!existingUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        if (targetUserId === requesterUserId) {
            throw new HTTPException(400, {
                message: "You cannot change your own role"
            });
        }

        if (existingUser.role === "ADMIN") {
            throw new HTTPException(403, {
                message: "Cannot change admin role"
            });
        }

        if (existingUser.role === newRole) {
            throw new HTTPException(400, { message: "User already has this role" });
        }

        const history = appendHistory(
            existingUser.history,
            `Cargo alterado de "${ROLE_STATUS_MAP[existingUser.role]}" para "${ROLE_STATUS_MAP[newRole]}" pelo administrador do SISTEMA`
        );

        return await prisma.user.update({
            where: {
                id: targetUserId
            },
            data: {
                role: newRole,
                history: history
            }
        });
    },

    /* user routes only for terms (LGPD) */

    async reacceptTerms(userId: string) {
        const now = new Date();

        return await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                termsAcceptedAt: now,
                privacyAcceptedAt: now,
                termsVersion: CURRENT_TERMS_OF_SERVICE_VERSION,
                privacyVersion: CURRENT_PRIVACY_POLICY_VERSION
            }
        });
    },

    async revokeTerms(userId: string) {
        const existingUser = await prisma.user.findUnique({
            where: {
                id: userId
            }
        });

        if (!existingUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        return await prisma.$transaction([
            prisma.user.update({
                where: {
                    id: userId
                },
                data: {
                    termsAcceptedAt: null,
                    privacyAcceptedAt: null,
                }
            }),
            prisma.session.deleteMany({
                where: {
                    userId
                }
            })
        ]);
    },

    async suspendFraudulentAccount(targetUserId: string, requesterRole: string) {
        if (requesterRole !== "ADMIN") {
            throw new HTTPException(403, { message: "You do not have permission to perform this action" });
        }

        const existingUser = await prisma.user.findUnique({
            where: { id: targetUserId }
        });

        if (!existingUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        if (existingUser.suspendedAt) {
            throw new HTTPException(409, { message: "User already suspended" });
        }

        const now = new Date();
        const releasedCpf = `FRAUD_RELEASED_${now.getTime()}`;

        const history = appendHistory(
            existingUser.history,
            `Conta SUSPENSA PERMANENTEMENTE pelo administrador do SISTEMA por FRAUDE. CPF original liberado.`
        );

        return await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: targetUserId },
                data: {
                    suspendedAt: now,
                    cpf: releasedCpf, /* free real victim cpf */
                    /* keep the email intact so the fraudster hits the @@unique constraint if they try again */
                    name: "Conta",
                    lastName: "Suspensa",
                    phone: "00000000000",
                    cep: "00000000",
                    street: "Removido",
                    neighborhood: "Removido",
                    city: "Removido",
                    state: "XX",
                    number: "00",
                    history: history
                }
            });
            
            await tx.session.deleteMany({ where: { userId: targetUserId } });
            await tx.account.deleteMany({ where: { userId: targetUserId } });
            await tx.verification.deleteMany({ where: { identifier: existingUser.email } });
            
            const logEntry = `Status alterado para "Cancelado" automaticamente pelo administrador do SISTEMA. (Conta Suspensa)`;

            const activeNeuterings = await tx.neuteringAppointment.findMany({
                where: {
                    userId: targetUserId,
                    status: { in: ["PENDING", "AWAITING_EXAMS", "CONFIRMED"] }
                },
                include: { medicalRecord: true }
            });

            for (const appointment of activeNeuterings) {
                let medicalRecordUpdate = undefined;
                if (appointment.medicalRecord) {
                    medicalRecordUpdate = {
                        update: {
                            history: appendHistory(appointment.medicalRecord.history, logEntry)
                        }
                    };
                }
                await tx.neuteringAppointment.update({
                    where: { id: appointment.id },
                    data: {
                        status: "CANCELLED",
                        medicalRecord: medicalRecordUpdate
                    }
                });
            }

            const activeEmergencies = await tx.emergencyAppointment.findMany({
                where: {
                    userId: targetUserId,
                    status: { in: ["PENDING", "CONFIRMED"] }
                },
                include: { medicalRecord: true }
            });

            for (const emergency of activeEmergencies) {
                let medicalRecordUpdate = undefined;
                if (emergency.medicalRecord) {
                    medicalRecordUpdate = {
                        update: {
                            history: appendHistory(emergency.medicalRecord.history, logEntry)
                        }
                    };
                }
                await tx.emergencyAppointment.update({
                    where: { id: emergency.id },
                    data: {
                        status: "CANCELLED",
                        medicalRecord: medicalRecordUpdate
                    }
                });
            }

            const activeGiveUps = await tx.giveUpRequest.findMany({
                where: {
                    userId: targetUserId,
                    status: "PENDING"
                }
            });

            for (const giveUp of activeGiveUps) {
                await tx.giveUpRequest.update({
                    where: { id: giveUp.id },
                    data: {
                        status: "REJECTED", 
                        history: appendHistory(giveUp.history, logEntry)
                    }
                });
            }

            const userPets = await tx.pet.findMany({
                where: { ownerId: targetUserId },
                select: { id: true }
            });
            const userPetIds = userPets.map(pet => pet.id);

            if (userPetIds.length > 0) {
                const activeAdoptions = await tx.adoptionRequest.findMany({
                    where: {
                        petId: { in: userPetIds },
                        status: "PENDING"
                    }
                });

                for (const adoption of activeAdoptions) {
                    await tx.adoptionRequest.update({
                        where: { id: adoption.id },
                        data: {
                            status: "REJECTED",
                            history: appendHistory(adoption.history, logEntry)
                        }
                    });
                }
                
                await tx.pet.updateMany({
                    where: { 
                        id: { in: userPetIds },
                        adoptionStatus: "FOR_ADOPTION" 
                    },
                    data: { adoptionStatus: "NONE" }
                });
            }
        });
    },

    async deactivateAccount(targetUserId: string) {
        const existingUser = await prisma.user.findUnique({
            where: { 
                id: targetUserId 
            }
        });

        if (!existingUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        if (existingUser.deletedAt) {
            throw new HTTPException(409, { message: "Account is already deactivated" });
        }

        const now = new Date();
        const history = appendHistory(
            existingUser.history,
            `Conta desativada pelo próprio usuário. (Aguardando prazo de exclusão ou retenção legal)`
        );

        return await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: targetUserId },
                data: {
                    deletedAt: now,
                    history: history
                }
            });
            
            await tx.session.deleteMany({ where: { userId: targetUserId } });

            const logEntry = `Status alterado para "Cancelado" automaticamente. (Conta desativada pelo usuário)`;

            const activeNeuterings = await tx.neuteringAppointment.findMany({
                where: {
                    userId: targetUserId,
                    status: { in: ["PENDING", "AWAITING_EXAMS", "CONFIRMED"] }
                },
                include: { medicalRecord: true }
            });

            for (const appointment of activeNeuterings) {
                let medicalRecordUpdate = undefined;
                if (appointment.medicalRecord) {
                    medicalRecordUpdate = {
                        update: {
                            history: appendHistory(appointment.medicalRecord.history, logEntry)
                        }
                    };
                }
                await tx.neuteringAppointment.update({
                    where: { id: appointment.id },
                    data: {
                        status: "CANCELLED",
                        medicalRecord: medicalRecordUpdate
                    }
                });
            }

            const activeEmergencies = await tx.emergencyAppointment.findMany({
                where: {
                    userId: targetUserId,
                    status: { in: ["PENDING", "CONFIRMED"] }
                },
                include: { medicalRecord: true }
            });

            for (const emergency of activeEmergencies) {
                let medicalRecordUpdate = undefined;
                if (emergency.medicalRecord) {
                    medicalRecordUpdate = {
                        update: {
                            history: appendHistory(emergency.medicalRecord.history, logEntry)
                        }
                    };
                }
                await tx.emergencyAppointment.update({
                    where: { id: emergency.id },
                    data: {
                        status: "CANCELLED",
                        medicalRecord: medicalRecordUpdate
                    }
                });
            }

            const activeGiveUps = await tx.giveUpRequest.findMany({
                where: {
                    userId: targetUserId,
                    status: "PENDING"
                }
            });

            for (const giveUp of activeGiveUps) {
                await tx.giveUpRequest.update({
                    where: { id: giveUp.id },
                    data: {
                        status: "REJECTED", 
                        history: appendHistory(giveUp.history, logEntry)
                    }
                });
            }

            const userPets = await tx.pet.findMany({
                where: { ownerId: targetUserId },
                select: { id: true }
            });
            const userPetIds = userPets.map(pet => pet.id);

            if (userPetIds.length > 0) {
                const activeAdoptions = await tx.adoptionRequest.findMany({
                    where: {
                        petId: { in: userPetIds },
                        status: "PENDING"
                    }
                });

                for (const adoption of activeAdoptions) {
                    await tx.adoptionRequest.update({
                        where: { id: adoption.id },
                        data: {
                            status: "REJECTED",
                            history: appendHistory(adoption.history, logEntry)
                        }
                    });
                }
                
                await tx.pet.updateMany({
                    where: { 
                        id: { in: userPetIds },
                        adoptionStatus: "FOR_ADOPTION" 
                    },
                    data: { adoptionStatus: "NONE" }
                });
            }
        });
    },

    async reactivateAccount(targetUserId: string) {
        const existingUser = await prisma.user.findUnique({
            where: { id: targetUserId }
        });

        if (!existingUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        if (existingUser.suspendedAt) {
            throw new HTTPException(403, { message: "Cannot reactivate a suspended account" });
        }

        if (!existingUser.deletedAt) {
            throw new HTTPException(400, { message: "Account is not deactivated" });
        }

        const history = appendHistory(
            existingUser.history,
            `Conta REATIVADA pelo próprio usuário.`
        );

        return await prisma.user.update({
            where: { id: targetUserId },
            data: {
                deletedAt: null,
                history: history
            }
        });
    }
}