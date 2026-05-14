import { z } from "zod";

const TriageAnswer = z.enum(["YES", "NO", "DONT_KNOW"]);

export const triageDataSchema = z.object({
    isNeutered: TriageAnswer.optional(),                 /* 1. Castrado? */
    isConscious: TriageAnswer.optional(),                /* 2. Consciente? */
    isHeadRaised: TriageAnswer.optional(),               /* 3. Cabeça levantada? */
    isBleeding: TriageAnswer.optional(),                 /* 4. Sangrando? */
    bleedingLocation: z.string().max(255).optional(),    /* 5. Onde é o sangramento? */
    isStanding: TriageAnswer.optional(),                 /* 6. Em pé? */
    hasStoodUp: TriageAnswer.optional(),                 /* 7. Ficou em pé em algum momento? */
    supportsAllPaws: TriageAnswer.optional(),            /* 8. Apoia todas as patas? */
    unsupportedPaw: z.string().max(255).optional(),      /* 9. Qual pata não apoia? */
    hasWalked: TriageAnswer.optional(),                  /* 10. Já andou? */
    hasExposedBone: TriageAnswer.optional(),             /* 11. Osso exposto? */
    exposedBone: z.string().max(255).optional(),         /* 11.2. Qual osso? */
    breathingDifficulty: TriageAnswer.optional(),        /* 12. Dificuldade de respirar? */
    hasEaten: TriageAnswer.optional(),                   /* 13. Já comeu? */
    hasDrunk: TriageAnswer.optional(),                   /* 13. Bebeu água? */
    hasVomited: TriageAnswer.optional(),                 /* 14. Teve vômito? */
    hasDiarrhea: TriageAnswer.optional(),                /* (Added from question 14 line) Diarreia? */
    symptomsDuration: z.string().max(255).optional(),    /* 15. Quantos dias? */
    otherSymptoms: z.string().max(1000).optional(),      /* 16. Algum outro sintoma? */
});

export const createEmergencySchema = z.object({
    name: z.string()
        .min(1, "Name cannot be empty")
        .max(28, "Name must be less than 28 characters"),
    species: z.enum(["DOG", "CAT"]),
    gender: z.enum(["MALE", "FEMALE"])
        .optional(),
    size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
    description: z.string()
        .min(10, "Please provide more details about the emergency")
        .max(500, "Description is too long")
        .optional(),
    petId: z.string() 
        .max(50, "Pet ID must be less than 50 characters")
        .optional(),
    triageData: triageDataSchema
        .optional(),
    temporaryHomeAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must confirm to be a temporary home during the pet treatment"
    }),
    animalChipAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must agree to have your pet microchipped"
    }),
    termsAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must agree that you have read the neutering terms"
    }),
});

export const adminCreateEmergencySchema = z.object({
    name: z.string()
        .min(1, "Name cannot be empty")
        .max(28, "Name must be less than 28 characters"),
    petId: z.string() 
        .max(50, "Pet ID must be less than 50 characters")
        .optional(),
    triageData: triageDataSchema
        .optional(),
    species: z.enum(["DOG", "CAT"]),
    gender: z.enum(["MALE", "FEMALE"])
        .optional(),
    size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
    description: z.string()
        .min(10, "Please provide more details about the emergency")
        .max(500, "Description is too long")
        .optional(),
    scheduleDate: z.coerce.date(),
    status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"]),
});

export const listEmergenciesQuerySchema = z.object({
    status: z.preprocess(
        (val) => {
            if (typeof val === "string") {
                return val.split(",").map(s => s.trim()).filter(Boolean);
            }
            return val;
        },
        z.array(
            z.enum([
                "PENDING",
                "CONFIRMED",
                "COMPLETED",
                "CANCELLED",
                "NO_SHOW"
            ])
        )
    ).optional(),
    userId: z.string()
        .optional(), /* admin-only */
    species: z.enum(["DOG", "CAT"])
        .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateEmergencyStatusSchema = z.object({
    status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"]).optional(),
    scheduleDate: z.coerce.date()
        .optional(),
    period: z.enum(["MORNING", "AFTERNOON"])
        .optional(),
    petId: z.string() 
        .max(50, "Pet ID must be less than 50 characters")
        .optional(), /* when the clinic finish the appointment, it should create a pet for the user and attach the pet ID */
}).superRefine((data, ctx) => {
    /* condition: when confirming the appointment, it must have date and period */
    if (data.status === "CONFIRMED" && (!data.scheduleDate || !data.period)) {
        ctx.addIssue({
            code: "custom",
            message: "Schedule date and period are required to confirm an emergency appointment",
            path: ["scheduleDate"]
        });
    }
});

export type CreateEmergencyInput = z.infer<typeof createEmergencySchema>;
export type TriageData = z.infer<typeof triageDataSchema>;
export type AdminCreateEmergencyInput = z.infer<typeof adminCreateEmergencySchema>;
export type ListEmergenciesQueryInput = z.infer<typeof listEmergenciesQuerySchema>;
export type UpdateEmergencyStatusInput = z.infer<typeof updateEmergencyStatusSchema>;