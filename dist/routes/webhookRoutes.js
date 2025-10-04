"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRouter = void 0;
const express_1 = require("express");
const logger_1 = require("../utils/logger");
exports.webhookRouter = (0, express_1.Router)();
/**
 * Jira Webhook receiver.
 * Configure in Jira (System > Webhooks) to POST events to /webhook/jira
 * For local dev, expose with ngrok and use the public URL + /webhook/jira
 */
exports.webhookRouter.post("/webhook/jira", (req, res) => {
    const event = req.body;
    // Basic sanity checks
    const eventType = event?.webhookEvent || event?.issue_event_type_name || "unknown";
    const issueKey = event?.issue?.key;
    logger_1.log.info("Webhook received:", { eventType, issueKey });
    // TODO: push to a queue / update in-memory cache / write to DB
    // Example (pseudo):
    // if (eventType === "jira:issue_updated") { updateLocalReport(issueKey, event); }
    // Acknowledge quickly
    res.status(200).send("OK");
});
