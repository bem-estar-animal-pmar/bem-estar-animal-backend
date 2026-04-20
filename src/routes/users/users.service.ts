import { ListUsersQueryInput } from "./users.schema";
import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";

export const usersService = {
        async list(userRole: string, filters: ListUsersQueryInput) {
            if (userRole !== "ADMIN") {
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
}