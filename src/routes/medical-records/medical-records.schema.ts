import { z } from "zod";

export const idParamSchema = z.string()
    .max(50, "ID Params must be less than 50 characters");

export const createMedicalRecordSchema = z.object({
    notes: z.string()
    .min(1, "Notes cannot be empty")
    .max(8000, "Notes must be less than 8000 characters"),
    neuteringAppointmentId: z.string().optional(),
    emergencyAppointmentId: z.string().optional(),
}).superRefine((data, ctx) => {
    const hasNeutering = !!data.neuteringAppointmentId;
    const hasEmergency = !!data.emergencyAppointmentId;

    if (!hasNeutering && !hasEmergency) {
        ctx.addIssue({
            code: "custom",
            message: "You must link the medical record to either a Neutering or Emergency appointment",
            path: ["neuteringAppointmentId"]
        });
    }

    if (hasNeutering && hasEmergency) {
        ctx.addIssue({
            code: "custom",
            message: "A medical record cannot be linked to two different appointments at the same time",
            path: ["emergencyAppointmentId"]
        });
    }
});

export const updateMedicalRecordSchema = z.object({
    notes: z.string().min(5, "Medical notes must contain at least 5 characters"),
});

export const listMedicalRecordsQuerySchema = z.object({
    petId: z.string()
        .max(50, "Pet ID must be less than 50 characters")
        .optional(),
});


export type IdParamInput = z.infer<typeof idParamSchema>;
export type CreateMedicalRecordInput = z.infer<typeof createMedicalRecordSchema>;
export type UpdateMedicalRecordInput = z.infer<typeof updateMedicalRecordSchema>;
export type ListMedicalRecordsQueryInput = z.infer<typeof listMedicalRecordsQuerySchema>;