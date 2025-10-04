import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { jiraRouter } from "./routes/jiraRoutes";
import { webhookRouter } from "./routes/webhookRoutes";

export const app = express();

// Middleware
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
if (env.CORS_ORIGIN) {
    app.use(cors({ origin: env.CORS_ORIGIN, credentials: false }));
}

// Routes
app.use(jiraRouter);
app.use(webhookRouter);

// Default root
app.get("/", (_req, res) => {
    res.json({ ok: true, message: "Jira integration server is running." });
});
