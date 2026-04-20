import { z } from "zod";

export const listUsersQuerySchema = z.object({
    cpf: z.string()
        .max(11, "CPF must be less than 11 characters")
        .optional(),
    role: z.enum(["USER", "ADMIN"]).optional(),
    id: z.string() /* admin-only filter */
        .max(50, "User ID must be less than 50 characters")
        .optional(),
});

export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;