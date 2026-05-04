import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { CreateEmergencyInput, ListEmergenciesQueryInput, UpdateEmergencyStatusInput } from "./emergencies.schema";
import { MEDICAL_RECORDS_MAP } from "../../constants/constants";

/* here, admins should not be able to create emergency requests for other users, but they should be able to attach pets from
other users (and create pets for other users) to any emergency request because the pet data is added later */

/* they also should be able to create emergency requests for themselves (stray animals they found) */

export const emergencyService = {
   
    async create(userId: string, userRole: string, data: CreateEmergencyInput) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });


        if (!user) {
            throw new HTTPException(404, { message: "User not found" });
        }


        if (user.blockedUntil && user.blockedUntil > new Date()) {
            throw new HTTPException(403, { message: `User is blocked until ${user.blockedUntil.toLocaleDateString()}` });
        }


        if (userRole !== "ADMIN") {
            delete data.scheduleDate;
            delete data.period;
        }


        let resultSpecies = data.species;
        if (data.petId) {
            const petExists = await prisma.pet.findUnique({
                where: { id: data.petId }
            });
            if (!petExists) {
                throw new HTTPException(404, { message: "Result Pet ID does not exist" });
            }
            if (petExists.ownerId != userId && userRole != "ADMIN") {
                throw new HTTPException(401, { message: "You are not allowed to create an emergency appointment for this pet" });
            }
            resultSpecies = petExists.species; // if user selected a pet pass down the species from the pet to prevent inconsistency
        }


        const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });


        const creator = userRole === "ADMIN" ? `pelo administrador ${user.name}` : "pelo usuário";
        const initialHistory = `[${nowInBrazilShort}] Pedido criado com status ${MEDICAL_RECORDS_MAP["PENDING"]} ${creator}.`;


        return await prisma.emergencyAppointment.create({
            data: {
                ...data,
                userId,
                status: "PENDING",
                species: resultSpecies,
                medicalRecord: {
                    create: {
                        petId: data.petId || undefined, /* can be undefined if it's a stray animal */
                        notes: "",
                        history: initialHistory
                    }
                }
            }
        });
    },


    async listByUser(userId: string, filters?: ListEmergenciesQueryInput) {
        return await prisma.emergencyAppointment.findMany({
            where: {
                userId,
                status: filters?.status,
                species: filters?.species,
            },
            include: {
                pet: { select: { id: true, name: true } } /* if it is a completed (or already have pet registered) appointment, we include the pet */
            },
            orderBy: { createdAt: 'desc' } /* ordered by creation date because pending emergencies does not have scheduleDate */
        });
    },


    /* admin only */
    async list(userRole: string, filters: ListEmergenciesQueryInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }


        const limit = filters.limit;
        const page = filters.page;
        const skip = (page - 1) * limit;


        const appointments = await prisma.emergencyAppointment.findMany({
            where: {
                userId: filters.userId,
                status: filters.status,
                species: filters.species,
            },
            include: {
                user: { select: { name: true, phone: true, email: true } },
                pet: { select: { id: true, name: true } }
            },
            orderBy: [
                { scheduleDate: 'desc' }, /* most recent comes first (confirmed, completed and no_show) */
                { createdAt: 'desc' } /* pending, awaiting_exams and cancelled has no date, so the oldest created comes first */
            ],
            skip: skip,
            take: limit + 1, // O truque N+1
        });


        const hasNextPage = appointments.length > limit;


        if (hasNextPage) {
            appointments.pop();
        }


        return {
            data: appointments,
            meta: {
                currentPage: page,
                itemsPerPage: limit,
                hasNextPage,
                hasPrevPage: page > 1
            }
        };
    },


    /* admin only */
    async updateStatus(appointmentId: string, userId: string, data: UpdateEmergencyStatusInput) {
        const user = await prisma.user.findUnique({
            where: {id: userId}
        })
        if (!user) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        if (user.role !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const appointment = await prisma.emergencyAppointment.findUnique({
            where: { id: appointmentId },
            include: {medicalRecord: true}
        });


        if (!appointment) {
            throw new HTTPException(404, { message: "Emergency appointment not found" });
        }
       
        /* if the clinic sent a petId to attach, we should check if it exists */
        if (data.petId) {
            const petExists = await prisma.pet.findUnique({
                where: { id: data.petId }
            });
            if (!petExists) {
                throw new HTTPException(404, { message: "Result Pet ID does not exist" });
            }
        }


        /* Prepare the history log if the status is changing and a medical record exists */
        let medicalRecordUpdate = undefined;
        if (data.status && data.status !== appointment.status && appointment.medicalRecord) {
            const nowInBrazil = new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                dateStyle: "short",
                timeStyle: "short"
            });

            const creator = `pelo administrador ${user.name}`;
            const logEntry = `[${nowInBrazil}] Status alterado de ${MEDICAL_RECORDS_MAP[appointment.status]} para ${MEDICAL_RECORDS_MAP[data.status]} ${creator}`;
           
            /* if the admin is attaching a new petId during this status update, we also update the medical record's petId */
            medicalRecordUpdate = {
                update: {
                    petId: data.petId || appointment.medicalRecord.petId,
                    history: appointment.medicalRecord.history
                        ? `${appointment.medicalRecord.history}\n${logEntry}`
                        : logEntry
                }
            };
        }
       
        /* punishment also happens if the emergency request was NO_SHOW */
        if (data.status === "NO_SHOW" && appointment.status !== "NO_SHOW") {
            const blockUntilDate = new Date();
            blockUntilDate.setDate(blockUntilDate.getDate() + 30);


            return await prisma.$transaction([
                prisma.emergencyAppointment.update({
                    where: { id: appointmentId },
                    data: {
                        ...data,
                        medicalRecord: medicalRecordUpdate
                    }
                }),
                prisma.user.update({
                    where: { id: appointment.userId },
                    data: { blockedUntil: blockUntilDate }
                })
            ]);
        }


        /* rule: you cannot confirm  appointments without date */
        if ((data.status === "CONFIRMED") && !data.scheduleDate && !appointment.scheduleDate) {
            throw new HTTPException(403, { message: "To confirm an emergency appointment you must set a date." });
        }


        return await prisma.emergencyAppointment.update({
            where: { id: appointmentId },
            data: { ...data,
                medicalRecord: medicalRecordUpdate
            }
        });
    }
};