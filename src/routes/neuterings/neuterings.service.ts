import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { CreateNeuteringInput, UpdateNeuteringStatusInput, ListNeuteringsQueryInput } from "./neuterings.schema";
import {
    MAX_PETS_PER_MONTH_BY_CPF,
    MAX_DAY_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST,
    MIN_PET_AGE_FOR_NEUTERING, MAX_PET_AGE_FOR_NEUTERING,
    MIN_PET_WEIGHT_FOR_NEUTERING,
    MAX_PET_WEIGHT_FOR_NEUTERING,
    BRACHYCEPHALIC_BREEDS,
    MEDICAL_RECORDS_MAP
} from "../../constants/constants";


/* frontend will receive absolute 00:00 dates in UTC-0 it must not convert the date to local timezone or it may
change the day and cause bugs */


/* it is ok to not allow admin creates neutering requests for other users, because user is meant to attatch their pet
to the request on the moment of creation */


export const neuteringService = {
    async create(userId: string, data: CreateNeuteringInput) {


        const pet = await prisma.pet.findUnique({
            where: { id: data.petId }
        });


        const user = await prisma.user.findUnique({
            where: {id: userId}
        })


        if (!user || !pet) {
            throw new HTTPException(404, { message: "User or Pet not found" });
        }


        if (pet.ownerId !== userId) {
            throw new HTTPException(403, { message: "You can only schedule appointments for your own pet" });
        }


        if (user.role !== "ADMIN") {
            delete data.scheduleDate;
            delete data.period;
        }


        /* pets with active neutering appointments or already neutered cannot create another request */
        const activeAppointment = await prisma.neuteringAppointment.findFirst({
            where: {
                petId: data.petId,
                status: {
                    in: ["PENDING", "AWAITING_EXAMS", "CONFIRMED", "COMPLETED"]
                }
            }
        });


        if (activeAppointment) {
            throw new HTTPException(400, { message: "This pet already has an active neutering appointment or is already neutered" });
        }


        if (!data.termsAccepted || !data.animalFastAccepted || !data.animalChipAccepted) {
            throw new HTTPException(400, { message: "You must agree with all terms and declarations" });


        }


        /* constraint: only pets between 3 months and 8 years can be neutered */
        const today = new Date();
        let ageInMonths = (today.getFullYear() - pet.birthDate.getFullYear()) * 12 + (today.getMonth() - pet.birthDate.getMonth());
        if (today.getDate() < pet.birthDate.getDate()) {
            ageInMonths--;
        }


        if (ageInMonths < MIN_PET_AGE_FOR_NEUTERING || ageInMonths > MAX_PET_AGE_FOR_NEUTERING) {
            throw new HTTPException(400, { message: "Neutering is only allowed for pets between 3 months and 8 years old" });
        }


        /* constraint: pets below 3 kg or above 15 kg must do exams */
        let neuteringStatus:'PENDING' | 'AWAITING_EXAMS' = "PENDING";


        if (pet.species === "DOG" && pet.gender === "FEMALE") {
            if ((pet.weight <= MIN_PET_WEIGHT_FOR_NEUTERING) || pet.weight > MAX_PET_WEIGHT_FOR_NEUTERING) {
                neuteringStatus = "AWAITING_EXAMS";
            }
        }


        /* constraint: brachycephalic pets must do exams */
        if (pet.breed && BRACHYCEPHALIC_BREEDS.includes(pet.breed)) {
            neuteringStatus = "AWAITING_EXAMS";
        }


        /* get now to create and update a medical record history */
        const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });


        const creator = user.role === "ADMIN" ? `pelo administrador ${user.name}` : "pelo usuário";
        const initialHistory = `[${nowInBrazilShort}] Pedido criado com status ${MEDICAL_RECORDS_MAP[neuteringStatus]} ${creator}.`;


        /* admins are allowed to skip any rules for neutering request creation */
        if (user.role === "ADMIN") {
            return await prisma.neuteringAppointment.create({
                data: {
                    userId,
                    petId: data.petId,
                    status: neuteringStatus,
                    medicalRecord: {
                        create: {
                            petId: data.petId,
                            notes: "",
                            history: initialHistory
                        }
                    }
                },
                include: { /* return pet data so frontend can show on success screen */
                    pet: {
                        select: { name: true, species: true }
                    }
                }
            });
        }


        /* rule 1: if user is blocked by NO_SHOW, don't allow the request */
        if (user.blockedUntil && user.blockedUntil > new Date()) {
            throw new HTTPException(403, {message: `User is blocked from scheduling until ${user.blockedUntil.toLocaleDateString()}`});
        }


        /* rule 2: monthly limit of MAX_PETS_PER_MONTH_BY_CPF appointments per CPF */
        const nowInBrazil = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        const startOfMonth = new Date(Date.UTC(nowInBrazil.getFullYear(), nowInBrazil.getMonth(), 1));
        const endOfMonth = new Date(Date.UTC(nowInBrazil.getFullYear(), nowInBrazil.getMonth() + 1, 0));


        const monthlyCount = await prisma.neuteringAppointment.count({
            where: {
                userId,
                scheduleDate: { gte: startOfMonth, lte: endOfMonth },
                status: { not: "CANCELLED" }
            }
        });


        if (monthlyCount >= MAX_PETS_PER_MONTH_BY_CPF) {
            throw new HTTPException(400, { message: "Monthly limit of neutering appointments reached for this CPF" });
        }


        return await prisma.neuteringAppointment.create({
            data: {
                userId,
                petId: data.petId,
                status: neuteringStatus,
                medicalRecord: {
                    create: {
                        petId: data.petId,
                        notes: "",
                        history: initialHistory
                    }
                }
            },
            include: { /* return pet data so frontend can show on success screen */
                pet: {
                    select: { name: true, species: true }
                }
            }
        });
    },


    async getById(neuteringId: string, userId: string, userRole: string) {
        const existingNeutering = await prisma.neuteringAppointment.findUnique({
            where: { id: neuteringId },
            include: {
                pet: { select: { name: true, species: true, ownerId: true, chip: true } },
                user: { select: { name: true, lastName: true, email: true, phone: true } }
            },
        });


        if (!existingNeutering) {
            throw new HTTPException(404, { message: "Neutering not found" });
        }


        if (existingNeutering.userId !== userId && userRole !== "ADMIN") {
            throw new HTTPException(404, { message: "Neutering not found" });
        }


        return existingNeutering;
    },


    async checkSlotAvailability(date: Date, period: string, limit: number) {
        const count = await prisma.neuteringAppointment.count({
            where: {
                scheduleDate: date,
                period: period,
                status: { in: ["PENDING", "CONFIRMED", "AWAITING_EXAMS", "COMPLETED"] }
            }
        });


        if (count >= limit) {
            throw new HTTPException(400, { message: "No more slots available for this date and period" });
        }
    },


    async listByUser(userId: string, filters?: ListNeuteringsQueryInput) {
        return await prisma.neuteringAppointment.findMany({
            where: {
                userId,
                status: filters?.status ? { in: filters.status } : undefined,
                petId: filters?.petId,
                scheduleDate: {
                    gte: filters?.startDate,
                    lte: filters?.endDate
                }
            },
            include: {
                pet: { select: { name: true, species: true, gender: true, breed: true } },
                medicalRecord: { select: { id: true, notes: true, history: true} }
            },
            orderBy: [
                { createdAt: 'desc' }
            ]
        });
    },


    /* admin only */
    async list(userRole: string, filters: ListNeuteringsQueryInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }


        const limit = filters.limit;
        const page = filters.page;
        const skip = (page - 1) * limit;


        const appointments = await prisma.neuteringAppointment.findMany({
            where: {
                userId: filters.userId,
                status: filters?.status ? { in: filters.status } : undefined,
                petId: filters.petId,
                scheduleDate: {
                    gte: filters.startDate,
                    lte: filters.endDate
                }
            },
            include: {
                pet: { select: { name: true, species: true, ownerId: true } },
                user: { select: { name: true, lastName: true, email: true, phone: true } }
            },
            orderBy: [
                { scheduleDate: 'desc' }, /* most recent comes first (confirmed, completed and no_show) */
                { createdAt: 'asc' } /* pending, awaiting_exams and cancelled has no date, so the oldest created comes first */
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
    async updateStatus(appointmentId: string, userId: string, data: UpdateNeuteringStatusInput) {
        const user = await prisma.user.findUnique({
            where: {id: userId}
        })
        if (!user) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        if (user.role !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }


        const appointment = await prisma.neuteringAppointment.findUnique({
            where: { id: appointmentId },
            include: { medicalRecord: true }
        });


        if (!appointment) {
            throw new HTTPException(404, { message: "Neutering appointment not found" });
        }
   
        /*repare the history log if the status is changing and a medical record exists */
        let medicalRecordUpdate = undefined;
        if (data.status && data.status !== appointment.status && appointment.medicalRecord) {
            const nowInBrazil = new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                dateStyle: "short",
                timeStyle: "short"
            });

            const creator = `pelo administrador ${user.name}`;
            const logEntry = `[${nowInBrazil}] Status alterado de ${MEDICAL_RECORDS_MAP[appointment.status]} para ${MEDICAL_RECORDS_MAP[data.status]} ${creator}`;
           
            medicalRecordUpdate = {
                update: {
                    history: appointment.medicalRecord.history
                        ? `${appointment.medicalRecord.history}\n${logEntry}`
                        : logEntry
                }
            };
        }


        /* rule: if admin set as NO_SHOW, we automatically block the user for a month */
        if (data.status === "NO_SHOW" && appointment.status !== "NO_SHOW") {
            const blockUntilDate = new Date();
            blockUntilDate.setDate(blockUntilDate.getDate() + 30); /* add 30 days */


            /* we use transaction to update appointment and user status at the same time */
            return await prisma.$transaction([
                prisma.neuteringAppointment.update({
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
            throw new HTTPException(403, { message: "To confirm a neutering appointment you must set a date." });
        }


        /* update for when status is !== NO_SHOW */
        return await prisma.neuteringAppointment.update({
            where: { id: appointmentId },
            data: {
                ...data,
                medicalRecord: medicalRecordUpdate
            }
        });
    },


    /* user action: cancel own appointment */
    async cancel(appointmentId: string, userId: string) {
        const user = await prisma.user.findUnique({
            where: {id: userId}
        })
        if (!user) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const appointment = await prisma.neuteringAppointment.findUnique({
            where: { id: appointmentId },
            include: { medicalRecord: true }
        });


        if (!appointment) {
            throw new HTTPException(404, { message: "Appointment not found" });
        }


        if (appointment.userId !== userId && user.role !== "ADMIN") {
            throw new HTTPException(403, { message: "You can only cancel your own appointments" });
        }


        if (appointment.status === "COMPLETED" || appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
            throw new HTTPException(400, { message: `Cannot cancel an appointment with status ${appointment.status}` });
        }

        /* rule: you can only cancel confirmed appointments > 24 hours before the appointment */
        if (user.role !== "ADMIN" && appointment.status === "CONFIRMED" && appointment.scheduleDate !== null) {
            const nowInBrazil = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
            const today = new Date(Date.UTC(nowInBrazil.getFullYear(), nowInBrazil.getMonth(), nowInBrazil.getDate()));
            const msInADay = 1000 * 60 * 60 * 24;
            const daysDifference = (appointment.scheduleDate.getTime() - today.getTime()) / msInADay;


            if (daysDifference < MAX_DAY_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST) {
                throw new HTTPException(400, { message: `Cancellations must be made at least ${MAX_DAY_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST * 24} hours in advance. If you still want to cancel contact the clinic` });
            }
        }

        let medicalRecordUpdate = undefined;
        if (appointment.medicalRecord) {
            const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                dateStyle: "short",
                timeStyle: "short"
            });
            const creator = user.role === "ADMIN" ? `pelo administrador ${user.name}` : "pelo usuário";
            const logEntry = `[${nowInBrazilShort}] Status alterado para ${MEDICAL_RECORDS_MAP["CANCELLED"]} ${creator}.`;

            medicalRecordUpdate = {
                update: {
                    history: appointment.medicalRecord.history
                        ? `${appointment.medicalRecord.history}\n${logEntry}`
                        : logEntry
                }
            };
        }

        return await prisma.neuteringAppointment.update({
            where: { id: appointmentId },
            data: {
                status: "CANCELLED",
                medicalRecord: medicalRecordUpdate
            }
        });
    }
};