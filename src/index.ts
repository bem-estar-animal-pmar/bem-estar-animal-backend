import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text(`Hello Hono! ${process.env.NODE_ENV}`)
})

export default app
