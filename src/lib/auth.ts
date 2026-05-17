import { betterAuth } from "better-auth";

import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";

import { APIError } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { z } from "zod";
import { cpf } from "cpf-cnpj-validator";
import { CURRENT_PRIVACY_POLICY_VERSION, CURRENT_TERMS_OF_SERVICE_VERSION } from "../constants/constants.js";

export const userRegisterSchema = z.object({
    password: z.string().trim()
        .min(8, "Password is expected to have more than 8 characters")
        .max(60, "Password is expected to have less than 60 characters")
        .regex(/[A-Z]/, "Password is expected to have at least one uppercase letter")
        .regex(/[a-z]/, "Password is expected to have at least one lowercase letter")
        .regex(/[0-9]/, "Password is expected to have at least one number")
        .regex(/[\W_]/, "Password is expected to have at least one symbol"),
    name: z.string().trim()
        .min(1, "Name can't be blank")
        .max(20, "Name is expected to have less than 20 characters")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/, "Name must contain only letters"),
    lastName: z.string().trim()
        .min(1, "Last name can't be blank")
        .max(40, "Last name is expected to have less than 40 characters")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/, "Last name must contain only letters"),
    phone: z.string().trim()
        .regex(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, "Invalid phone number format")
        .transform((value) => value.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
    cpf: z.string().trim()
        .refine((value) => cpf.isValid(value), {
            message: "Invalid CPF",
        })
        .transform((val) => val.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
    cep: z.string()
        .regex(/^\d{5}-?\d{3}$/, "Invalid CEP")
        .transform((value) => value.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
    street: z.string().trim()
        .min(1, "Street is required")
        .max(200, "Street is expected to have less than 200 characters"),
    neighborhood: z.string().min(1, "Neighborhood is required")
        .max(100, "Neighborhood is expected to have less than 100 characters"),
    city: z.string().trim()
        .min(1, "City is required")
        .max(100, "City is expected to have less than 100 characters"),
    state: z.string().trim()
        .length(2, "State must be UF (2 characters)"),
    number: z.string().trim()
        .min(1, "Number is required")
        .max(16, "Number is expected to have less than 16 characters")
});

export const userUpdateSchema = z.object({
    name: z.string().trim()
        .min(1, "Name can't be blank")
        .max(20, "Name is expected to have less than 20 characters")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/, "Name must contain only letters"),
    lastName: z.string().trim()
        .min(1, "Last name can't be blank")
        .max(40, "Last name is expected to have less than 40 characters")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/, "Last name must contain only letters"),
    phone: z.string().trim()
        .regex(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, "Invalid phone number format")
        .transform((value) => value.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
    cpf: z.string().trim()
        .refine((value) => cpf.isValid(value), {
            message: "Invalid CPF",
        })
        .transform((val) => val.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
    cep: z.string()
        .regex(/^\d{5}-?\d{3}$/, "Invalid CEP")
        .transform((value) => value.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
});

export const passwordUpdateSchema = z.object({
    newPassword: z.string().trim()
        .min(8, "Password is expected to have more than 8 characters")
        .max(60, "Password is expected to have less than 60 characters")
        .regex(/[A-Z]/, "Password is expected to have at least one uppercase letter")
        .regex(/[a-z]/, "Password is expected to have at least one lowercase letter")
        .regex(/[0-9]/, "Password is expected to have at least one number")
        .regex(/[\W_]/, "Password is expected to have at least one symbol"),
    token: z.string().trim()
        .min(1, "Token can't be blank")
        .max(200, "Token is expected to have less than 200 characters"),


});

const allowedOrigins = process.env.ALLOWED_CORS_URLS ? JSON.parse(process.env.ALLOWED_CORS_URLS) : ["http://localhost:3000"];

const getTrustedOrigins = () => {
    if (process.env.NODE_ENV !== "production") {
        return ["http://localhost:3000"];
    }
    return allowedOrigins;
};

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        sendResetPassword: async ({user, url, token}, request) => {
            /* should update here later to an e-mail provider to send the verification url to the user */
            console.log(`Verification URL: ${url}`);
        },
    },
    emailVerification: {
        sendOnSignUp: true, /* when register, it will automatically send an email */
        autoSignInAfterVerification: true,/* user sign in after verification */
        sendVerificationEmail: async ({ user, url, token }, request) => {
            /* here is where we should add an e-mail provider to send a mail with the
            verification url to the user, for now, we just log on the console */
            console.log(url)
        }
    },
    user: {
        additionalFields: {
            role: {
                type: "string",
                required: false,
                defaultValue: "USER",
                input: false, /* never let the frontend set its own role */
            },
            lastName: {
                type: "string",
                required: true, /* enforces validation before hitting the DB */
                input: true,    /* allows this field to be passed from the signUp client */
                returned: false
            },
            phone: {
                type: "string",
                required: true,
                input: true,
                returned: false
            },
            cpf: {
                type: "string",
                required: true,
                input: true,
                returned: false
            },
            cep: {
                type: "string",
                required: true,
                input: true,
                returned: false
            },
            street: {
                type: "string",
                required: true,
                input: true,
                returned: false
            },
            neighborhood: {
                type: "string",
                required: true,
                input: true,
                returned: false
            },
            city: {
                type: "string",
                required: true,
                input: true,
                returned: false
            },
            state: {
                type: "string",
                required: true,
                input: true,
                returned: false
            },
            number: {
                type: "string",
                required: true,
                input: true,
                returned: false
            },
            history: {
                type: "string",
                required: false,
                input: false, /* Set automatically by DB or server, not frontend */
                returned: false
            },
            termsAcceptedAt: {
                type: "date",
                required: false,
                input: false, /* Set automatically by DB or server, not frontend */
                returned: false
            },
            termsVersion: { 
                type: "string", 
                required: false, 
                input: true, /* input must be true because we inject this field on the before hook, even being true, our 
                    zod schema prevents user from sending it from the client */ 
                returned: false 
            },
            privacyAcceptedAt: {
                type: "date",
                required: false,
                input: false, /* Set automatically by DB or server, not frontend */
                returned: false
            },
            privacyVersion: { 
                type: "string", 
                required: false, 
                input: true, /* input must be true because we inject this field on the before hook, even being true, our 
                    zod schema prevents user from sending it from the client */ 
                returned: false 
            },
            blockedUntil: {
                type: "date",
                required: false,
                input: false,     /* user nor admin can set blockedUntil, it automatically goes to true if a status is NO_SHOW */
                returned: false
            },
            deletedAt: {
                type: "date",
                required: false,
                input: false,
                returned: false
            }
        }
    },
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path === "/sign-up/email") { /* this guarantees this middleware only runs on register by e-mail route */
                const body = ctx.body;
                const validation = userRegisterSchema.safeParse(body);
                if (!validation.success) {
                    throw new APIError("BAD_REQUEST", {
                        message: validation.error.issues[0].message
                    });
                }

                /* since our cpf field is unique, we must check if there is already an user registered with it to
                throw an error and send a response to the frontend, if you don't do that, a generic error will be sent
                and the front will have no clue what is the problem */
                const existingUser = await prisma.user.findUnique({
                    where: { cpf: validation.data.cpf },
                });

                if (existingUser) {
                    throw new APIError("BAD_REQUEST", {
                        message: "This CPF already exists",
                    });
                }
                
                return {
                    context: {
                        ...ctx,
                        body: {
                            ...ctx.body,
                            ...validation.data,
                            image: "", /* for now we won't allow users set image urls */
                            termsVersion: CURRENT_TERMS_OF_SERVICE_VERSION,
                            privacyVersion: CURRENT_PRIVACY_POLICY_VERSION
                        },
                    }
                };
            }
           
            if (ctx.path === "/reset-password") { /* this is for the new reset password route, we should parse the same password rules here */
                const body = ctx.body;
                const validation = passwordUpdateSchema.safeParse(body);
                if (!validation.success) {
                    throw new APIError("BAD_REQUEST", {
                        message: validation.error.issues[0].message
                    });
                }
            }


            if (ctx.path === "/update-user") { /* this guarantees this middleware only runs when user tries to udpate their data */
                const body = ctx.body;
                const validation = userUpdateSchema.partial().safeParse(body);

                throw new APIError("BAD_REQUEST", {
                    message: "Unauthorized"
                });
                /*
                if (!validation.success) {
                    throw new APIError("BAD_REQUEST", {
                        message: validation.error.issues[0].message
                    });
                }
                return {
                    context: {
                        ...ctx,
                        body: {
                            ...ctx.body,
                            ...validation.data,
                            image: "", // for now we won't allow users set image urls 
                        }
                    }
                }; */
            }
        })
    },
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: getTrustedOrigins(), /* allow next (port 3000) to access this provider */
    advanced: {
        useSecureCookies: process.env.NODE_ENV === "production"
    }
});