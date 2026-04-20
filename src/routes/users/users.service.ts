import { ListUsersQueryInput } from "./users.schema";
import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";

export const usersService = {
        async list(userRole: string, filters?: ListUsersQueryInput) {
            if (userRole !== "ADMIN") {
                throw new HTTPException(401, { message: "Unauthorized" });
            }

            return await prisma.user.findMany({
                where: {
                    id: filters?.id, 
                    cpf: filters?.cpf, 
                    role: filters?.role,
                },
                select: {
                    id: true,
                    name: true,
                    lastName: true,
                    role: true
                },
                orderBy: { createdAt: 'desc' }
            });
        },
}