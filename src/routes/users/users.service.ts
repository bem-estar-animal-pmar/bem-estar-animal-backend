import { AdminUpdateUserInput, ListUsersQueryInput } from "./users.schema";
import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import { CURRENT_PRIVACY_POLICY_VERSION, CURRENT_TERMS_OF_SERVICE_VERSION, ROLE_STATUS_MAP } from "../../constants/constants";

const appendHistory = ( currentHistory: string | null,  message: string ) => {
    const nowInBrazil = new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short"
    });

    const entry = `[${nowInBrazil}] ${message}`;

    return currentHistory
        ? `${currentHistory}\n${entry}`
        : entry;
};

export const usersService = {
    async list(userRole: string, filters: ListUsersQueryInput) {
        if (userRole !== "ADMIN" && userRole !== "MANAGER") {
            throw new HTTPException(401, { message: "Unauthorized" });
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
                updatedAt: true,
                emailVerified: true,
                history: requesterRole !== "USER" ? true : false,
            }
        });

        if (!existingUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        const isAdmin = requesterRole === "ADMIN";
        const isOwner = requesterUserId === targetUserId;

        if (!isAdmin && !isOwner) {
            throw new HTTPException(404, { message: "User not found" });
        }

        return existingUser;
    },

    async updateByAdmin( targetUserId: string, requesterRole: string, data: AdminUpdateUserInput ) {
        if (requesterRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
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
                `CEP alterado de "${existingUser.cep}" para "${data.cep}"`
            );
        }

        if (data.street && data.street !== existingUser.street) {
            changedFields.push(
                `rua alterada de "${existingUser.street}" para "${data.street}"`
            );
        }

        if (data.neighborhood && data.neighborhood !== existingUser.neighborhood) {
            changedFields.push(
                `bairro alterado de "${existingUser.neighborhood}" para "${data.neighborhood}"`
            );
        }

        if (data.city && data.city !== existingUser.city) {
            changedFields.push(
                `cidade alterada de "${existingUser.city}" para "${data.city}"`
            );
        }

        if (data.state && data.state !== existingUser.state) {
            changedFields.push(
                `estado alterado de "${existingUser.state}" para "${data.state}"`
            );
        }

        if (data.number && data.number !== existingUser.number) {
            changedFields.push(
                `número alterado de "${existingUser.number}" para "${data.number}"`
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
            throw new HTTPException(401, { message: "Unauthorized" });
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
            throw new HTTPException(401, { message: "Unauthorized"});
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
}