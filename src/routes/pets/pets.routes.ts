import { Hono } from 'hono'
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { termsMiddleware } from '../../middleware/termsHandler';
import { HTTPException } from 'hono/http-exception';
import { petsService } from "./pets.service";
import { createPetSchema, adminCreatePetSchema, listPetsQuerySchema, adminUpdatePetSchema, listPetsForAdoptionQuerySchema, updatePetImageSchema } from './pets.schema';
import { strictRateLimiter } from '../../middleware/limitHandler';
import { uploadPhoto, deletePhoto } from '../../lib/s3.client';
import { prisma } from "../../lib/prisma.js";

const app = new Hono<AuthEnv>()

/* public route */

/* @desc list all pets for adoption, so not authenticated users can create adoption requests
   @route GET https://example.com/api/pets/adoption
   @access public (any) */
app.get('/adoption', strictRateLimiter(60 * 1000, 20), async (ctx) => {
	const rawQuery = ctx.req.query();
	const validation = listPetsForAdoptionQuerySchema.safeParse(rawQuery);

	if (!validation.success) {
		throw new HTTPException(400, {  message: "Invalid params", cause: validation.error })
    }

	const query = validation.data;

    const pets = await petsService.listForAdoption({
		gender: query.gender,
		species: query.species,
    });

    return ctx.json(pets, 200);
});

/* private routes */

app.use('*', authMiddleware);
app.use('*', termsMiddleware);

/* @desc list the current user's pet@route GET https://example.com/api/pets/me?name=Rex&species=DOG&breed=pitbulls with filtering
   
   @access private (USER, ADMIN) */
app.get('/me', strictRateLimiter(60 * 1000, 60), async (ctx) => {
    const user = ctx.get("user")!; /* authMiddle already make sure 'user' exists */

	const rawQuery = ctx.req.query();
	const validation = listPetsQuerySchema.safeParse(rawQuery);

	if (!validation.success) {
		throw new HTTPException(400, {  message: "Invalid query params", cause: validation.error })
    }

	const query = validation.data;
	const role = user.role ?? "USER"; 

    const pets = await petsService.listByUser(
        user.id, 
		role,
		{
			...query
		}
    );
	
    return ctx.json(pets, 200);
});

/* @desc list any pets with filtering
   @route GET https://example.com/api/pets/userId=1234&name=Rex&species=DOG&breed=pitbull
   @access private (ADMIN) */
app.get('/', strictRateLimiter(60 * 1000, 60), async (ctx) => {
    const user = ctx.get("user")!; /* authMiddle already make sure 'user' exists */
    
    const rawQuery = ctx.req.query();
    const validation = listPetsQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, {  message: "Invalid query params", cause: validation.error })
    }

    const query = validation.data;
    const role = user.role ?? "USER"; 

    // Pass the entire validated query (which includes page and limit defaults)
    const result = await petsService.listAll(role, query);

    return ctx.json(result, 200);
});

/* @desc get a specific pet data
   @route GET https://example.com/api/pets/details/:id
   @access private (USER, ADMIN) */
app.get('/details/:id', strictRateLimiter(60 * 1000, 60), async (ctx) => {
    const user = ctx.get("user")!; /* authMiddle already make sure 'user' exists */

    const petId = ctx.req.param('id');
	const role = user.role ?? "USER";

    // Pass the entire validated query (which includes page and limit defaults)
    const result = await petsService.getById(petId, user.id, role);
    return ctx.json(result, 200);
});

/* @desc create a new pet
   @route POST https://example.com/api/pets
   @access private (USER, ADMIN) */
app.post('/', strictRateLimiter(60 * 1000, 5), async (ctx) => {
	const user = ctx.get("user")!;

	const body = await ctx.req.parseBody();
	const validation = createPetSchema.safeParse(body);

	if (!validation.success) {
		throw new HTTPException(400, {  message: "Invalid body", cause: validation.error })
    }

    const { image, ...petData } = validation.data;

	const photoUrl = await uploadPhoto(image, "pets")

	const newPet = await petsService.create(user.id, {
		...petData,
		image: photoUrl
	});

	return ctx.json(newPet, 201);
})

/* @desc update a pet's image
   @route PATCH https://example.com/api/pets/:id/image
   @access private (USER, ADMIN) */
app.patch('/:id/image', strictRateLimiter(60 * 1000, 5), async (ctx) => {
    const user = ctx.get("user")!;
    const petId = ctx.req.param('id');
    const role = user.role ?? "USER";

    const body = await ctx.req.parseBody();
    const validation = updatePetImageSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid body", cause: validation.error });
    }

    const existingPet = await prisma.pet.findUnique({
        where: { id: petId },
        select: { ownerId: true, image: true, adoptionStatus: true }
    });

    if (!existingPet) {
        throw new HTTPException(404, { message: "Pet not found" });
    }

    if (existingPet.ownerId !== user.id && user.role !== "ADMIN" && user.role !== "MANAGER") {
        throw new HTTPException(403, { message: "You do not have permission to perform this action" });
    }

    if (existingPet.adoptionStatus !== "NONE" && user.role === "USER") {
        throw new HTTPException(403, { message: "You cannot update data when a pet is for adoption or adopted" });
    }

    /* upload the new photo to R2 */
    const newPhotoUrl = await uploadPhoto(validation.data.image, "pets");

    /* update DB and get the old image URL */
    const { updatedPet, oldImage } = await petsService.updateImage(petId, user.id, role, newPhotoUrl);

    /* clean up the old photo from R2 if it exists */
    if (oldImage) {
        await deletePhoto(oldImage).catch(); /* catch error to prevent sending error to the frontend if the upload was succesfull */
    }

    return ctx.json(updatedPet, 200);
});

/* @desc remove a pet's image entirely
   @route DELETE https://example.com/api/pets/:id/image
   @access private (USER, ADMIN) */
app.delete('/:id/image', strictRateLimiter(60 * 1000, 5), async (ctx) => {
    const user = ctx.get("user")!;
    const petId = ctx.req.param('id');
    const role = user.role ?? "USER";

    /* set image to null in the DB and get the old image URL */
    const { updatedPet, oldImage } = await petsService.updateImage(petId, user.id, role, null);

    if (!oldImage) {
        throw new HTTPException(400, { message: "Pet does not currently have an image" });
    }

    await deletePhoto(oldImage);

    return ctx.json({ message: "Image successfully removed" }, 200);
});

/* @desc admin create a new pet for user, skipping any limit rules
   @route POST https://example.com/api/pets/admin/create-after-emergency
   @access private (ADMIN) */
app.post('/admin/create-after-emergency', strictRateLimiter(60 * 1000, 10), async (ctx) => {
	const user = ctx.get("user")!;

	const body = await ctx.req.parseBody();
	const validation = adminCreatePetSchema.safeParse(body);

	if (!validation.success) {
		throw new HTTPException(400, {  message: "Invalid body", cause: validation.error })
    }

    const { image, ownerId, ...petData } = validation.data;

	let photoUrl: string | undefined = undefined;

	if (image) {
		photoUrl = await uploadPhoto(image, "pets");
	}

	const role = user.role ?? "USER"; 
	const targetUserId = ownerId || user.id;

	const newPet = await petsService.CreateAfterEmergencyByAdmin(targetUserId, role, {
		...petData,
		...(photoUrl && { image: photoUrl })
	});
	return ctx.json(newPet, 201);
})

/* @desc update an user's pet fields 
   @route PATCH https://example.com/api/pets/:id
   @access private (USER, ADMIN) */
app.patch('/:id', strictRateLimiter(60 * 1000, 5), async (ctx) => {
	const user = ctx.get("user")!;

	const body = await ctx.req.json()
	const validation = adminUpdatePetSchema.safeParse(body)

	if (!validation.success) {
		throw new HTTPException(400, {  message: "Invalid body", cause: validation.error })
    }

	const petId = ctx.req.param('id');
	const role = user.role ?? "USER"; 

	const updatedPet = await petsService.updateByAdmin(petId, user.id, role, validation.data);
	return ctx.json(updatedPet, 200);
})

/* @desc delete an user's pet
   @route DELETE https://example.com/api/pets/:id
   @access private (ADMIN) */
app.delete('/:id', strictRateLimiter(60 * 1000, 5), async (ctx) => {
	const user = ctx.get("user")!;

	const petId = ctx.req.param('id');
	const role = user.role ?? "USER"; /* typescript thinks role is optional because of better auth, but it is not, 
	need this only for it to stop complaining */

	const deleted = await petsService.delete(petId, role);
	/* no need to check if (!deleted) here, service already does that */
	return ctx.json({ message: "Pet successfully deleted." });
})


/* routes related to adoption and give up requests */

/* @desc update a pet adoption status from FOR_ADOPTION to NONE
   @route PATCH https://example.com/api/pets/:id/undo-give-up
   @access private (USER, ADMIN) */
app.patch('/:id/undo-give-up', strictRateLimiter(60 * 1000, 5), async (ctx) => {
	const user = ctx.get("user")!;
	const petId = ctx.req.param('id');
	const role = user.role ?? "USER"; 

	const result = await petsService.undoGiveUp(petId, user.id, role);
	return ctx.json({ message: "Pet successfully removed from adoption list" });
})


/* @desc update a pet adoption status from ADOPTED to NONE (admin only)
   @route PATCH https://example.com/api/pets/:id/adoption-returnd
   @access private (ADMIN) */
app.patch('/:id/adoption-return', strictRateLimiter(60 * 1000, 5), async (ctx) => {
	const user = ctx.get("user")!;
	const petId = ctx.req.param('id');
	const role = user.role ?? "USER"; 

	const updatedPet = await petsService.returnPet(petId, user.name, role);
	return ctx.json({ message: "Pet successfully returned" });
})

export default app;