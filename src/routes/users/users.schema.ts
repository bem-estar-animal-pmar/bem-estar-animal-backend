import { z } from "zod";

export const listUsersQuerySchema = z.object({
    cpf: z.string()
        .max(11, "CPF must be less than 11 characters")
        .optional(),
    role: z.enum(["USER", "ADMIN"]).optional(),
    id: z.string()
        .max(50, "User ID must be less than 50 characters")
        .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;