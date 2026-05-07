import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { CreateEmergencyInput, AdminCreateEmergencyInput, ListEmergenciesQueryInput, UpdateEmergencyStatusInput } from "./emergencies.schema";
import { MEDICAL_RECORDS_MAP, MAX_DAY_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST } from "../../constants/constants";

/* here, admins should not be able to create emergency requests for other users, but they should be able to attach pets from
other users (and create pets for other users) to any emergency request because the pet data is added later */

/* they also should be able to create emergency requests for themselves (stray animals they found) */

export const emergencyService = {

    /* user services */

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

        let {name, species, gender, size} = {...data}
        
        if (data.petId) {
            const petExists = await prisma.pet.findUnique({
                where: { id: data.petId }
            });
            if (!petExists) {
                throw new HTTPException(404, { message: "Result Pet ID does not exist" });
            }
            if (petExists.ownerId != userId) {
                throw new HTTPException(401, { message: "You are not allowed to create an emergency appointment for this pet" });
            }
            if (petExists.allowEmergency === false) {
                throw new HTTPException(401, { message: "This pet is not allowed to emergency request." });
            }
            
            /* pets with active emergency appointments cannot create another request */
            const activeAppointment = await prisma.emergencyAppointment.findFirst({
                where: {
                    petId: data.petId,
                    status: {
                        in: ["PENDING", "CONFIRMED"]
                    }
                }
            });

            if (activeAppointment) {
                throw new HTTPException(400, { message: "This pet already has an active emergency appointment" });
            }

            name = petExists.name;
            species = petExists.species;
            gender = petExists.gender;
            size = petExists.size;
        }

        const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });

        const creator = userRole === "ADMIN" ? `pelo administrador ${user.name}` : `pelo usuário ${user.name}`;
        const initialHistory = `[${nowInBrazilShort}] Pedido criado com status ${MEDICAL_RECORDS_MAP["PENDING"]} ${creator}.`;

        return await prisma.emergencyAppointment.create({
            data: {
                ...data,
                userId,
                status: "PENDING",
                name: name,
                species: species,
                gender: gender,
                size: size,
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

    async getById(emergencyId: string, userId: string, userRole: string) {
        const existingEmergency = await prisma.emergencyAppointment.findUnique({
            where: { id: emergencyId },
            include: {
                pet: {
                    select: {
                        name: true,
                        species: true,
                        gender: true,
                        size: true,
                        breed: true,
                        ownerId: true,
                        chip: true,
                        isNeutered: true,
                        allowEmergency: true,
                    }
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        lastName: true,
                        email: true,
                        phone: true,
                        cep: true,
                        street: true,
                        neighborhood: true,
                        city: true,
                        state: true,
                        number: true
                    }
                },
                ...(userRole === "ADMIN" && { /* only include medicalRecord if userRole is admin */
                    medicalRecord: {
                        select: {
                            id: true,
                            notes: true,
                            history: true
                        }
                    }
                })
            }
        });

        if (!existingEmergency) {
            throw new HTTPException(404, { message: "Emergency not found" });
        }

        // owner authorization
        if (userRole !== "ADMIN" && existingEmergency.user.id !== userId) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        return existingEmergency;
    },

    async listByUser(userId: string, filters?: ListEmergenciesQueryInput) {
        return await prisma.emergencyAppointment.findMany({
            where: {
                userId,
                status: filters?.status ? { in: filters.status } : undefined,
                species: filters?.species,
            },
            include: {
                pet: { select: { id: true, name: true, allowEmergency: true } } /* if it is a completed (or already have pet registered) appointment, we include the pet */
            },
            orderBy: { createdAt: 'desc' } /* ordered by creation date because pending emergencies does not have scheduleDate */
        });
    },

    /* user action: cancel own appointment */
    async cancel(emergencyId: string, userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        })
        if (!user) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const appointment = await prisma.emergencyAppointment.findUnique({
            where: { id: emergencyId },
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
            const creator = user.role === "ADMIN" ? `pelo administrador ${user.name}` : "pelo tutor";
            const logEntry = `[${nowInBrazilShort}] Status alterado para ${MEDICAL_RECORDS_MAP["CANCELLED"]} ${creator}`;

            medicalRecordUpdate = {
                update: {
                    history: appointment.medicalRecord.history
                        ? `${appointment.medicalRecord.history}\n${logEntry}`
                        : logEntry
                }
            };
        }

        return await prisma.emergencyAppointment.update({
            where: { id: emergencyId },
            data: {
                status: "CANCELLED",
                medicalRecord: medicalRecordUpdate
            }
        });
    },

    /* admin only services */

    /* used to register already finished stray animal emergencies by the clinic */
    async createByAdmin(userId: string, userRole: string, data: AdminCreateEmergencyInput) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            throw new HTTPException(404, { message: "User not found" });
        }

        let {name, species, gender, size} = {...data}
        
        if (data.petId) {
            const petExists = await prisma.pet.findUnique({
                where: { id: data.petId }
            });
            if (!petExists) {
                throw new HTTPException(404, { message: "Result Pet ID does not exist" });
            }
            if (petExists.ownerId != userId) {
                throw new HTTPException(401, { message: "You can only register appointments for clinic pets created by your account" });
            }
            
            /* pets with active emergency appointments cannot create another request */
            const activeAppointment = await prisma.emergencyAppointment.findFirst({
                where: {
                    petId: data.petId,
                    status: {
                        in: ["PENDING", "CONFIRMED"]
                    }
                }
            });

            if (activeAppointment) {
                throw new HTTPException(400, { message: "This pet already has an active emergency appointment" });
            }

            name = petExists.name;
            species = petExists.species;
            gender = petExists.gender;
            size = petExists.size;
        }

        const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });

        const creator = userRole === "ADMIN" ? `pelo administrador ${user.name}` : `pelo tutor ${user.name}`;
        const initialHistory = `[${nowInBrazilShort}] Pedido criado com status ${MEDICAL_RECORDS_MAP[data.status]} ${creator}.`;

        return await prisma.emergencyAppointment.create({
            data: {
                ...data,
                userId,
                status: data.status,
                name: name,
                species: species,
                gender: gender,
                size: size,
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
                status: filters?.status ? { in: filters.status } : undefined,
                species: filters.species,
            },
            include: {
                user: { select: { name: true, lastName: true, phone: true, email: true } },
                pet: { select: { id: true, name: true,  allowEmergency: true } }
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