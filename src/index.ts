import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { ratesRouter } from "./routes/rates"
import { healthRouter } from "./routes/health"
import { binanceRouter } from "./routes/binance"
import { widgetRouter } from "./routes/widget"
import { rateLimitMiddleware } from "./middleware/rateLimit"
import { errorHandler } from "./middleware/errorHandler"
import { scheduled, cronRouter } from "./routes/cron"
import { NotificationService } from "./services/notificationService"
import { BCVScraper } from "./services/bcvScraper"

export type Env = {
  Bindings: {
    DB: D1Database
    RATES_KV: KVNamespace
    ALLOWED_ORIGINS: string
    RATE_LIMIT_PER_MINUTE: string
    CACHE_TTL_SECONDS: string
    DOLAR_API_URL: string
    CRON_API_KEY: string
  }
}

const app = new Hono<Env>()

app.use(logger())
app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["Content-Type"] }))
app.use(rateLimitMiddleware)
app.onError(errorHandler)

app.route("/rates", ratesRouter)
app.route("/health", healthRouter)
app.route("/binance", binanceRouter)
app.route("/cron", cronRouter)
app.route("/widget", widgetRouter)

app.get("/debug/scrape-bcv", async (c) => {
  try {
    const scraper = new BCVScraper()
    const rates = await scraper.scrape(true)
    return c.json({ success: true, rates })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Unknown" }, 500)
  }
})

app.post("/register-push-token", async (c) => {
  try {
    const { token, platform } = await c.req.json()
    if (!token || !platform) return c.json({ error: "Missing" }, 400)
    const ns = new NotificationService(c.env)
    await ns.registerPushToken(token, platform)
    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: "Failed" }, 500)
  }
})

app.notFound((c) => c.json({ error: "Not Found" }, 404))
export default { fetch: app.fetch, scheduled }
