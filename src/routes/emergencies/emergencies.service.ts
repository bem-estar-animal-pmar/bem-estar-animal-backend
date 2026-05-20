import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { CreateEmergencyInput, AdminCreateEmergencyInput, ListEmergenciesQueryInput, UpdateEmergencyStatusInput, TriageData } from "./emergencies.schema";
import { MEDICAL_RECORDS_MAP, MAX_DAY_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST, MAX_CANCELLATIONS_PER_WEEK } from "../../constants/constants";
import { appendHistory } from "../../lib/history.js";

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
            if (petExists.adoptionStatus === "ADOPTED") {
                throw new HTTPException(400, { message: "This pet is adopted, which means you cannot schedule neuterings anymore. Pet data is for read only now." });
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

        const now = new Date(); 
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

        const recentCancellations = await prisma.emergencyAppointment.count({
            where: {
                userId,
                status: "CANCELLED",
                updatedAt: { gte: sevenDaysAgo, lte: now } 
            }
        });

        if (recentCancellations >= MAX_CANCELLATIONS_PER_WEEK) {
            throw new HTTPException(429, { 
                message: `Maximum limit for appointments cancellation reached. Please wait a few days to schedule online again, or contact the clinic directly.` 
            });
        }

        const creator = `pelo responsável`;
        const initialHistory = `Pedido criado com status "${MEDICAL_RECORDS_MAP["PENDING"]}" ${creator}.`;

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
                        petId: data.petId || undefined, 
                        notes: "",
                        history: appendHistory(null, initialHistory)
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
                ...(userRole !== "USER" && { /* only include medicalRecord if userRole is admin */
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
        if (userRole !== "ADMIN" && userRole !== "MANAGER" && existingEmergency.user.id !== userId) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        return {
            ...existingEmergency,
            triageData: existingEmergency.triageData as TriageData | null
        };
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

        if (appointment.userId !== userId && user.role !== "ADMIN" && user.role !== "MANAGER") {
            throw new HTTPException(403, { message: "You can only cancel your own appointments" });
        }

        if (appointment.status === "COMPLETED" || appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
            throw new HTTPException(400, { message: `Cannot cancel an appointment with status ${appointment.status}` });
        }

        /* rule: you can only cancel confirmed appointments > 24 hours before the appointment */
        if (user.role !== "ADMIN" && user.role !== "MANAGER" && appointment.status === "CONFIRMED" && appointment.scheduleDate !== null) {
            // const nowInBrazil = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
            const now = new Date();
            const msInAnHour = 1000 * 60 * 60;
            
            const hoursDifference = (appointment.scheduleDate.getTime() - now.getTime()) / msInAnHour;
            const requiredHoursLimit = MAX_DAY_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST * 24;

            if (hoursDifference < requiredHoursLimit) {
                throw new HTTPException(400, { 
                    message: `Cancellations must be made at least ${requiredHoursLimit} hours in advance. se quiser cancelar, entre em contato com a clínica.` 
                });
            }
        }

        let medicalRecordUpdate = undefined;
        if (appointment.medicalRecord) {
            const creator = user.role !== "USER" ? `pelo gerente ${user.name}` : "pelo responsável";
            const logEntry = `Status alterado para "${MEDICAL_RECORDS_MAP["CANCELLED"]}" ${creator}`;

            medicalRecordUpdate = {
                update: {
                    history: appendHistory(appointment.medicalRecord.history, logEntry)
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

        if (user.role !== "ADMIN" && user.role !== "MANAGER") {
            throw new HTTPException(401, { message: "Unauthorized" });
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

        const creator = `pelo gerente ${user.name}`;
        const initialHistory = `Pedido criado com status "${MEDICAL_RECORDS_MAP[data.status]}" ${creator}.`;

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
                        petId: data.petId || undefined, 
                        notes: "",
                        history: appendHistory(null, initialHistory)
                    }
                }
            }
        });
    },

    async list(userRole: string, filters: ListEmergenciesQueryInput) {
        if (userRole !== "ADMIN" && userRole !== "MANAGER") {
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
        if (user.role !== "ADMIN" && user.role !== "MANAGER") {
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

        /* prepare the history log if status, date, or period are changing and a medical record exists */
        let medicalRecordUpdate = undefined;
        if (appointment.medicalRecord) {
            const creator = `pelo gerente ${user.name}`;
            const logEntries: string[] = [];

            /* 1. Check for Status changes */
            if (data.status !== undefined && data.status !== appointment.status) {
                logEntries.push(`Status alterado de "${MEDICAL_RECORDS_MAP[appointment.status] || appointment.status}" para "${MEDICAL_RECORDS_MAP[data.status] || data.status}" ${creator}`);
            }

            /* 2. Check for Date changes */
            if (data.scheduleDate !== undefined) {
                const newDateMs = data.scheduleDate ? new Date(data.scheduleDate).getTime() : null;
                const oldDateMs = appointment.scheduleDate ? new Date(appointment.scheduleDate).getTime() : null;

                if (newDateMs !== oldDateMs) {
                    const formatUtcDateBR = (d: Date | string | null | undefined) => {
                        if (!d) return "Não definida";
                        const dateObj = new Date(d);
                        const day = String(dateObj.getUTCDate()).padStart(2, '0');
                        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
                        const year = dateObj.getUTCFullYear();
                        
                        const hours = String(dateObj.getUTCHours()).padStart(2, '0');
                        const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
                        
                        return `${day}/${month}/${year} às ${hours}:${minutes}`;
                    };
                    
                    logEntries.push(`Data e/ou hora alterada de "${formatUtcDateBR(appointment.scheduleDate)}" para "${formatUtcDateBR(data.scheduleDate)}" ${creator}`);
                }
            }

            /* 3. Check for Period changes */
            if (data.period !== undefined && data.period !== appointment.period) {
                const formatPeriod = (p: string | null | undefined) => {
                    if (p === "MORNING") return "Manhã";
                    if (p === "AFTERNOON") return "Tarde";
                    return "Não definido";
                };
                
                logEntries.push(`Período alterado de "${formatPeriod(appointment.period)}" para "${formatPeriod(data.period)}" ${creator}`);
            }

            /* If there are any changes to log, process them sequentially through the helper */
            if (logEntries.length > 0) {
                let updatedHistory = appointment.medicalRecord.history;
                
                for (const log of logEntries) {
                    updatedHistory = appendHistory(updatedHistory, log);
                }

                medicalRecordUpdate = {
                    update: {
                        history: updatedHistory
                    }
                };
            }
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