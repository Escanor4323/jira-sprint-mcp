"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jiraRouter = void 0;
const express_1 = require("express");
const jiraApi_1 = require("../services/jiraApi");
const logger_1 = require("../utils/logger");
exports.jiraRouter = (0, express_1.Router)();
/**
 * Quick health/auth check – confirms Basic Auth is working.
 */
exports.jiraRouter.get("/api/jira/myself", async (_req, res) => {
    try {
        const me = await (0, jiraApi_1.getMyself)();
        res.json({ ok: true, me });
    }
    catch (err) {
        logger_1.log.error("GET /api/jira/myself failed", err?.response?.status, err?.response?.data);
        res.status(err?.response?.status || 500).json({ ok: false, error: err?.response?.data || "Failed" });
    }
});
/**
 * Get dashboards available to the authenticated user.
 */
exports.jiraRouter.get("/api/jira/dashboards", async (_req, res) => {
    try {
        const dashboards = await (0, jiraApi_1.getDashboards)();
        res.json(dashboards);
    }
    catch (err) {
        logger_1.log.error("GET /api/jira/dashboards failed", err?.response?.status, err?.response?.data);
        res.status(err?.response?.status || 500).json({ error: err?.response?.data || "Failed to fetch dashboards" });
    }
});
/**
 * Search issues by JQL.
 * Example: GET /api/jira/issues?jql=project=ABC%20AND%20issuetype%20in%20(Epic,Task)
 */
exports.jiraRouter.get("/api/jira/issues", async (req, res) => {
    const jql = req.query.jql || "ORDER BY created DESC";
    const fields = req.query.fields?.split(",").map(s => s.trim()).filter(Boolean);
    try {
        const data = await (0, jiraApi_1.searchIssues)({ jql, fields });
        res.json(data);
    }
    catch (err) {
        res.status(err?.response?.status || 500).json({ error: err?.response?.data || "Failed to search issues" });
    }
});
/**
 * Get worklogs for an issue.
 * Example: GET /api/jira/issues/ABC-123/worklog
 */
exports.jiraRouter.get("/api/jira/issues/:key/worklog", async (req, res) => {
    const key = req.params.key;
    const startAt = req.query.startAt ? Number(req.query.startAt) : 0;
    const maxResults = req.query.maxResults ? Number(req.query.maxResults) : 100;
    try {
        const data = await (0, jiraApi_1.getIssueWorklog)(key, startAt, maxResults);
        res.json(data);
    }
    catch (err) {
        res.status(err?.response?.status || 500).json({ error: err?.response?.data || "Failed to fetch worklog" });
    }
});
/**
 * Background task details (NOT issue type Task).
 * Example: GET /api/jira/tasks/12345
 */
exports.jiraRouter.get("/api/jira/tasks/:taskId", async (req, res) => {
    try {
        const data = await (0, jiraApi_1.getTask)(req.params.taskId);
        res.json(data);
    }
    catch (err) {
        res.status(err?.response?.status || 500).json({ error: err?.response?.data || "Failed to fetch task" });
    }
});
