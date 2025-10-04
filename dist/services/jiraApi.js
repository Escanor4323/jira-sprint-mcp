"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jiraClient = void 0;
exports.getDashboards = getDashboards;
exports.searchIssues = searchIssues;
exports.getIssueWorklog = getIssueWorklog;
exports.getMyself = getMyself;
exports.getTask = getTask;
exports.tryCreateWebhook = tryCreateWebhook;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
const buffer_1 = require("buffer");
const baseURL = `${env_1.env.JIRA_BASE_URL}/rest/api/3`;
// Basic Auth header
const authString = buffer_1.Buffer.from(`${env_1.env.JIRA_EMAIL}:${env_1.env.JIRA_API_TOKEN}`).toString("base64");
exports.jiraClient = axios_1.default.create({
    baseURL,
    headers: {
        Authorization: `Basic ${authString}`,
        Accept: "application/json",
        "Content-Type": "application/json"
    },
    // You can set timeout if desired
    timeout: 20000
});
// ---------- Dashboards ----------
async function getDashboards() {
    const { data } = await exports.jiraClient.get("/dashboard");
    return data; // { dashboards: [...] }
}
async function searchIssues(params) {
    const queryFields = params.fields ?? [
        "key",
        "summary",
        "status",
        "assignee",
        "timetracking",
        "timespent",
        "aggregatetimespent",
        "parent"
    ];
    const payload = {
        jql: params.jql,
        maxResults: params.maxResults ?? 50,
        fields: queryFields
    };
    const { data } = await exports.jiraClient.post("/search/jql", payload);
    const queries = Array.isArray(data?.queries) ? data.queries : undefined;
    const results = queries?.length ? queries[0]?.results ?? queries[0] ?? {} : data ?? {};
    return results ?? {};
}
// ---------- Worklogs ----------
async function getIssueWorklog(issueKeyOrId, startAt = 0, maxResults = 100) {
    const { data } = await exports.jiraClient.get(`/issue/${encodeURIComponent(issueKeyOrId)}/worklog`, {
        params: { startAt, maxResults }
    });
    return data; // { worklogs: [...], total, ... }
}
// ---------- Myself (connection test) ----------
async function getMyself() {
    const { data } = await exports.jiraClient.get("/myself");
    return data;
}
// ---------- Tasks (Background Tasks API group) ----------
/**
 * Jira "Tasks" API group refers to long-running background tasks started by some operations.
 * These endpoints are not about "issue type Task". You usually have a taskId from a previous operation.
 */
async function getTask(taskId) {
    const { data } = await exports.jiraClient.get(`/task/${encodeURIComponent(taskId)}`);
    return data; // details of a long-running task
}
// ---------- Webhooks (NOTE) ----------
/**
 * Creating/deleting webhooks via REST requires app/OAuth context and proper scopes in Jira Cloud.
 * With Basic Auth (user + token), this may return 403. Kept here for completeness if you later move to OAuth.
 */
async function tryCreateWebhook(options) {
    try {
        const { data } = await exports.jiraClient.post(`/webhook`, {
            url: options.url,
            webhooks: [
                {
                    events: options.events,
                    jqlFilter: options.jqlFilter ?? ""
                }
            ]
        });
        return data;
    }
    catch (err) {
        logger_1.log.warn("Webhook create likely requires OAuth/Connect app context. Error:", err?.response?.status, err?.response?.data);
        throw err;
    }
}
