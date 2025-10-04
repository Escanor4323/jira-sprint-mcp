import { Router } from "express";
import { log } from "../utils/logger";

export const webhookRouter = Router();

/**
 * Jira Webhook receiver.
 * Configure in Jira (System > Webhooks) to POST events to /webhook/jira
 * For local dev, expose with ngrok and use the public URL + /webhook/jira
 */
webhookRouter.post("/webhook/jira", (req, res) => {
    const event = req.body;
    // Basic sanity checks
    const eventType = event?.webhookEvent || event?.issue_event_type_name || "unknown";
    const issueKey = event?.issue?.key;
    log.info("Webhook received:", { eventType, issueKey });

    // TODO: push to a queue / update in-memory cache / write to DB
    // Example (pseudo):
    // if (eventType === "jira:issue_updated") { updateLocalReport(issueKey, event); }

    // Acknowledge quickly
    res.status(200).send("OK");
});
