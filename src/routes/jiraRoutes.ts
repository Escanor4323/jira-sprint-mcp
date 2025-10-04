import { Router } from "express";
import { getDashboards, getIssueWorklog, getMyself, searchIssues, getTask } from "../services/jiraApi";
import { log } from "../utils/logger";

export const jiraRouter = Router();

/**
 * Quick health/auth check – confirms Basic Auth is working.
 */
jiraRouter.get("/api/jira/myself", async (_req, res) => {
    try {
        const me = await getMyself();
        res.json({ ok: true, me });
    } catch (err: any) {
        log.error("GET /api/jira/myself failed", err?.response?.status, err?.response?.data);
        res.status(err?.response?.status || 500).json({ ok: false, error: err?.response?.data || "Failed" });
    }
});

/**
 * Get dashboards available to the authenticated user.
 */
jiraRouter.get("/api/jira/dashboards", async (_req, res) => {
    try {
        const dashboards = await getDashboards();
        res.json(dashboards);
    } catch (err: any) {
        log.error("GET /api/jira/dashboards failed", err?.response?.status, err?.response?.data);
        res.status(err?.response?.status || 500).json({ error: err?.response?.data || "Failed to fetch dashboards" });
    }
});

/**
 * Search issues by JQL.
 * Example: GET /api/jira/issues?jql=project=ABC%20AND%20issuetype%20in%20(Epic,Task)
 */
jiraRouter.get("/api/jira/issues", async (req, res) => {
    const jql = (req.query.jql as string) || "ORDER BY created DESC";
    const fields = (req.query.fields as string)?.split(",").map(s => s.trim()).filter(Boolean);
    try {
        const data = await searchIssues({ jql, fields });
        res.json(data);
    } catch (err: any) {
        res.status(err?.response?.status || 500).json({ error: err?.response?.data || "Failed to search issues" });
    }
});

/**
 * Get worklogs for an issue.
 * Example: GET /api/jira/issues/ABC-123/worklog
 */
jiraRouter.get("/api/jira/issues/:key/worklog", async (req, res) => {
    const key = req.params.key;
    const startAt = req.query.startAt ? Number(req.query.startAt) : 0;
    const maxResults = req.query.maxResults ? Number(req.query.maxResults) : 100;
    try {
        const data = await getIssueWorklog(key, startAt, maxResults);
        res.json(data);
    } catch (err: any) {
        res.status(err?.response?.status || 500).json({ error: err?.response?.data || "Failed to fetch worklog" });
    }
});

/**
 * Background task details (NOT issue type Task).
 * Example: GET /api/jira/tasks/12345
 */
jiraRouter.get("/api/jira/tasks/:taskId", async (req, res) => {
    try {
        const data = await getTask(req.params.taskId);
        res.json(data);
    } catch (err: any) {
        res.status(err?.response?.status || 500).json({ error: err?.response?.data || "Failed to fetch task" });
    }
});
