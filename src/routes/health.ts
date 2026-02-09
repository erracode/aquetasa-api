import { Hono } from 'hono'
import { Env } from '../index'

export const healthRouter = new Hono<Env>()

healthRouter.get('/', async (c) => {
  const db = c.env.DB
  
  // Check database connection
  let dbStatus = 'unknown'
  try {
    await db.prepare('SELECT 1').first()
    dbStatus = 'connected'
  } catch (error) {
    dbStatus = 'disconnected'
  }
  
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    version: '1.0.0'
  })
})
