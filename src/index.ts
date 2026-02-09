import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { ratesRouter } from './routes/rates'
import { healthRouter } from './routes/health'
import { rateLimitMiddleware } from './middleware/rateLimit'
import { errorHandler } from './middleware/errorHandler'
import { scheduled } from './routes/cron'

export type Env = {
  Bindings: {
    DB: D1Database
    ALLOWED_ORIGINS: string
    RATE_LIMIT_PER_MINUTE: string
    CACHE_TTL_SECONDS: string
    DOLAR_API_URL: string
  }
}

const app = new Hono<Env>()

// Middleware
app.use(logger())
app.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || ['*']
    return allowedOrigins.includes('*') || allowedOrigins.includes(origin) ? origin : null
  },
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400
}))
app.use(rateLimitMiddleware)

// Error handling
app.onError(errorHandler)

// Routes
app.route('/rates', ratesRouter)
app.route('/health', healthRouter)

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404)
})

export default {
  fetch: app.fetch,
  scheduled
}
