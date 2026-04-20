import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { CreateMedicalRecordInput, UpdateMedicalRecordInput, ListMedicalRecordsQueryInput } from "./medical-records.schema";

export const medicalRecordService = {

    /* admin only */
    async create(userRole: string, data: CreateMedicalRecordInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        let finalPetId: string | undefined = undefined;

        if (data.neuteringAppointmentId) {
            const neutering = await prisma.neuteringAppointment.findUnique({
                where: { id: data.neuteringAppointmentId },
                include: { medicalRecord: true }
            });

            if (!neutering) {
                throw new HTTPException(404, { message: "Neutering appointment not found" });
            }
            if (neutering.medicalRecord) {
                throw new HTTPException(400, { message: "This appointment already has a medical record" });
            }
            
            finalPetId = neutering.petId;
        }

        if (data.emergencyAppointmentId) {
            const emergency = await prisma.emergencyAppointment.findUnique({
                where: { id: data.emergencyAppointmentId },
                include: { medicalRecord: true }
            });

            if (!emergency) {
                throw new HTTPException(404, { message: "Emergency appointment not found" });
            }
            if (!emergency.petId) {
                throw new HTTPException(400, { message: "You must attach a pet to this emergency appointment before creating a medical record" })
            }
            if (emergency.medicalRecord) {
                throw new HTTPException(400, { message: "This appointment already has a medical record" });
            }

            finalPetId = emergency.petId;
        }

        if (!finalPetId) {
            throw new HTTPException(400, { message: "Either neuteringAppointmentId or emergencyAppointmentId must be provided" });
        }

        return await prisma.medicalRecord.create({
            data: {
                notes: data.notes,
                petId: finalPetId,
                neuteringAppointmentId: data.neuteringAppointmentId,
                emergencyAppointmentId: data.emergencyAppointmentId
            }
        });
    },

    async update(recordId: string, userRole: string, data: UpdateMedicalRecordInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const record = await prisma.medicalRecord.findUnique({ 
            where: { id: recordId } 
        });

        if (!record) {
            throw new HTTPException(404, { message: "Medical record not found" });
        }

        return await prisma.medicalRecord.update({
            where: { id: recordId },
            data: { notes: data.notes }
        });
    },

    async list(userRole: string, filters: ListMedicalRecordsQueryInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        return await prisma.medicalRecord.findMany({
            where: {
                petId: filters.petId,
                deletedAt: null
            },
            include: {
                neuteringAppointment: { select: { scheduleDate: true, status: true } },
                emergencyAppointment: { select: { scheduleDate: true, status: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    /* admin only: util for frontend */
    async getByAppointmentId(appointmentId: string, type: "NEUTERING" | "EMERGENCY", userRole: string) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const whereClause = type === "NEUTERING" 
            ? { neuteringAppointmentId: appointmentId, deletedAt: null } 
            : { emergencyAppointmentId: appointmentId, deletedAt: null };

        return await prisma.medicalRecord.findUnique({
            where: whereClause
        });
    },

    async delete(recordId: string, userRole: string) {
        if (userRole !== "ADMIN") throw new HTTPException(401, { message: "Unauthorized" });

        const record = await prisma.medicalRecord.findUnique({ where: { id: recordId } });
        if (!record || record.deletedAt) throw new HTTPException(404, { message: "Medical record not found" });

        return await prisma.medicalRecord.update({
            where: { id: recordId },
            data: { deletedAt: new Date() }
        });
    }
};