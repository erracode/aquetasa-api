import { MiddlewareHandler } from 'hono'
import { Env } from '../index'

// Simple in-memory rate limiting per IP
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export const rateLimitMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const maxRequests = parseInt(c.env.RATE_LIMIT_PER_MINUTE || '30')
  const windowMs = 60 * 1000 // 1 minute
  
  // Get client IP
  const clientIP = c.req.header('CF-Connecting-IP') || 
                   c.req.header('X-Forwarded-For') || 
                   'unknown'
  
  const key = `${clientIP}`
  const now = Date.now()
  
  // Clean up old entries periodically (simple cleanup)
  if (Math.random() < 0.01) { // 1% chance per request
    const cutoff = now - windowMs
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime < cutoff) {
        rateLimitStore.delete(k)
      }
    }
  }
  
  // Get or create rate limit entry
  let entry = rateLimitStore.get(key)
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + windowMs
    }
  }
  
  // Check limit
  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
    c.header('Retry-After', retryAfter.toString())
    c.header('X-RateLimit-Limit', maxRequests.toString())
    c.header('X-RateLimit-Remaining', '0')
    c.header('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString())
    return c.json({
      error: 'Rate limit exceeded',
      message: `Maximum ${maxRequests} requests per minute exceeded. Try again in ${retryAfter} seconds.`
    }, 429)
  }
  
  // Increment count
  entry.count++
  rateLimitStore.set(key, entry)
  
  // Set rate limit headers
  c.header('X-RateLimit-Limit', maxRequests.toString())
  c.header('X-RateLimit-Remaining', (maxRequests - entry.count).toString())
  c.header('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString())
  
  await next()
}
