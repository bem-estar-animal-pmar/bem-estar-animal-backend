import { Hono } from 'hono'
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { HTTPException } from 'hono/http-exception';
import { petsService } from "./pets.service";
import { createPetSchema, adminCreatePetSchema, listPetsQuerySchema, adminUpdatePetSchema, listPetsForAdoptionQuerySchema } from './pets.schema';

const app = new Hono<AuthEnv>()

/* public route */

/* @desc list all pets for adoption, so not authenticated users can create adoption requests
   @route GET https://example.com/api/pets/adoption
   @access public (any) */
app.get('/adoption', async (ctx) => {
	const rawQuery = ctx.req.query();
	const validation = listPetsForAdoptionQuerySchema.safeParse(rawQuery);

	if (!validation.success) {
		throw new HTTPException(400, {  message: "Validation Error. Invalid params", cause: validation.error })
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

/* @desc list the current user's pet@route GET https://example.com/api/pets/me?name=Rex&species=DOG&breed=pitbulls with filtering
   
   @access private (USER, ADMIN) */
app.get('/me', async (ctx) => {
    const user = ctx.get("user")!; /* authMiddle already make sure 'user' exists */

	const rawQuery = ctx.req.query();
	const validation = listPetsQuerySchema.safeParse(rawQuery);

	if (!validation.success) {
		throw new HTTPException(400, {  message: "Validation failed. Invalid filters", cause: validation.error })
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
app.get('/', async (ctx) => {
    const user = ctx.get("user")!; /* authMiddle already make sure 'user' exists */
    
    const rawQuery = ctx.req.query();
    const validation = listPetsQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, {  message: "Validation Error. Invalid params", cause: validation.error })
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
app.get('/details/:id', async (ctx) => {
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
app.post('/', async (ctx) => {
	const user = ctx.get("user")!;

	const body = await ctx.req.json();
	const validation = createPetSchema.safeParse(body);

	if (!validation.success) {
		throw new HTTPException(400, {  message: "Validation Error. Invalid body", cause: validation.error })
    }

	const newPet = await petsService.create(user.id, validation.data);
	return ctx.json(newPet, 201);
})

/* @desc admin create a new pet for user, skipping any limit rules
   @route POST https://example.com/api/pets/admin
   @access private (ADMIN) */
app.post('/admin', async (ctx) => {
	const user = ctx.get("user")!;

	const body = await ctx.req.json();
	const validation = adminCreatePetSchema.safeParse(body);

	if (!validation.success) {
		throw new HTTPException(400, {  message: "Validation Error. Invalid body", cause: validation.error })
    }

	const role = user.role ?? "USER"; 
	const targetUserId = validation.data.ownerId || user.id;

	const newPet = await petsService.createByAdmin(targetUserId, role, validation.data);
	return ctx.json(newPet, 201);
})

/* @desc update an user's pet fields 
   @route PATCH https://example.com/api/pets/:id
   @access private (USER, ADMIN) */
app.patch('/:id', async (ctx) => {
	const user = ctx.get("user")!;

	const body = await ctx.req.json()
	const validation = adminUpdatePetSchema.safeParse(body)

	if (!validation.success) {
		throw new HTTPException(400, {  message: "Validation Error. Invalid body", cause: validation.error })
    }

	const petId = ctx.req.param('id');
	const role = user.role ?? "USER"; 

	const updatedPet = await petsService.updateByAdmin(petId, user.id, role, validation.data);
	return ctx.json(updatedPet, 200);
})

/* @desc delete an user's pet
   @route DELETE https://example.com/api/pets/:id
   @access private (ADMIN) */
app.delete('/:id', async (ctx) => {
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
app.patch('/:id/undo-give-up', async (ctx) => {
	const user = ctx.get("user")!;
	const petId = ctx.req.param('id');
	const role = user.role ?? "USER"; 

	const result = await petsService.undoGiveUp(petId, user.id, role);
	return ctx.json({ message: "Pet successfully removed from adoption list" });
})


/* @desc update a pet adoption status from ADOPTED to NONE (admin only)
   @route PATCH https://example.com/api/pets/:id/adoption-returnd
   @access private (ADMIN) */
app.patch('/:id/adoption-return', async (ctx) => {
	const user = ctx.get("user")!;
	const petId = ctx.req.param('id');
	const role = user.role ?? "USER"; 

	const updatedPet = await petsService.returnPet(petId, user.id, role);
	return ctx.json({ message: "Pet successfully returned" });
})

export default app;