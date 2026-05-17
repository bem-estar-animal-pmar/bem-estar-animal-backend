import { AdminUpdateUserInput, ListUsersQueryInput } from "./users.schema";
import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";

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

        return await prisma.user.update({
            where: { id: targetUserId },
            data: {
                ...data
            },
            select: {
                id: true,
                name: true,
                lastName: true,
                cpf: true,
                phone: true,
                cep: true,
                street: true,
                neighborhood: true,
                city: true,
                state: true,
                number: true,
                email: true,
                role: true
            }
        });
    }
}