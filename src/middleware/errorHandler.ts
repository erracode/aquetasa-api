import { ErrorHandler } from 'hono'
import { Env } from '../index'

export const errorHandler: ErrorHandler<Env> = (err, c) => {
  console.error('Error:', err)
  
  const isDevelopment = false // Set to true for local debugging
  
  if (err.message?.includes('Rate limit')) {
    return c.json({
      error: 'Rate limit exceeded',
      message: err.message
    }, 429)
  }
  
  if (err.message?.includes('API unavailable') || err.message?.includes('fetch')) {
    return c.json({
      error: 'Service Unavailable',
      message: 'Unable to fetch exchange rates. Please try again later.'
    }, 503)
  }
  
  return c.json({
    error: 'Internal Server Error',
    message: isDevelopment ? err.message : 'An unexpected error occurred'
  }, 500)
}
