"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JIRA_START_DATE_FIELD_KEY = void 0;
exports.getMyself = getMyself;
exports.getDashboards = getDashboards;
exports.searchIssues = searchIssues;
exports.getProjectEpics = getProjectEpics;
exports.getProjectTasks = getProjectTasks;
exports.getEpicChildIssues = getEpicChildIssues;
exports.getEpicTasks = getEpicTasks;
exports.getIssueWorklog = getIssueWorklog;
exports.getIssueComments = getIssueComments;
const env_1 = require("./config/env");
const jiraClient_1 = require("./jiraClient");
const DEFAULT_SEARCH_FIELDS = [
    "key",
    "summary",
    "status",
    "assignee",
    "timetracking",
    "timespent",
    "aggregatetimespent",
    "parent"
];
exports.JIRA_START_DATE_FIELD_KEY = "customfield_10015";
const EPIC_TASK_REQUIRED_FIELDS = [
    "summary",
    "status",
    "assignee",
    "timetracking",
    "timespent",
    "aggregatetimespent",
    "parent",
    "duedate",
    exports.JIRA_START_DATE_FIELD_KEY
];
/** GET /rest/api/3/myself — sanity/auth check */
async function getMyself() {
    const { data } = await jiraClient_1.jira.get("/myself");
    return data;
}
/** GET /rest/api/3/dashboard — list dashboards */
async function getDashboards() {
    const { data } = await jiraClient_1.jira.get("/dashboard");
    return data; // { dashboards: [...] }
}
/** POST /rest/api/3/search/jql — query issues via JQL */
async function searchIssues(jql, fields, maxResults = 50, startAt = 0) {
    const queryFields = fields ?? [...DEFAULT_SEARCH_FIELDS];
    const payload = {
        jql,
        maxResults,
        fields: queryFields
    };
    const { data } = await jiraClient_1.jira.post("/search/jql", payload);
    const queries = Array.isArray(data?.queries) ? data.queries : undefined;
    const results = queries?.length ? queries[0]?.results ?? queries[0] ?? {} : data ?? {};
    const issues = results?.issues ?? data?.issues ?? [];
    const resolvedTotal = results?.total ?? data?.total ?? issues.length ?? 0;
    const resolvedStartAt = results?.startAt ?? data?.startAt ?? 0;
    const resolvedMaxResults = results?.maxResults ?? data?.maxResults ?? maxResults;
    const nextPageToken = results?.nextPageToken ?? data?.nextPageToken ?? null;
    const isLast = results?.isLast ?? data?.isLast;
    return {
        issues,
        total: resolvedTotal,
        startAt: resolvedStartAt,
        maxResults: resolvedMaxResults,
        nextPageToken,
        isLast
    };
}
async function getProjectEpics({ projectKey, fields, maxResults = 50, startAt = 0 } = {}) {
    const resolvedProjectKey = projectKey ?? env_1.env.PROJECT_KEY;
    if (!resolvedProjectKey) {
        throw new Error("PROJECT_KEY is not configured. Pass projectKey or set env.PROJECT_KEY.");
    }
    const jql = `project = ${resolvedProjectKey} AND issuetype = Epic`;
    return searchIssues(jql, fields, maxResults, startAt);
}
async function getProjectTasks({ projectKey, fields, maxResults = 50, startAt = 0 } = {}) {
    const resolvedProjectKey = projectKey ?? env_1.env.PROJECT_KEY;
    if (!resolvedProjectKey) {
        throw new Error("PROJECT_KEY is not configured. Pass projectKey or set env.PROJECT_KEY.");
    }
    const jql = `project = ${resolvedProjectKey} AND issuetype = Task`;
    return searchIssues(jql, fields, maxResults, startAt);
}
async function getEpicChildIssues(epicKey, { fields, maxResults = 50, startAt = 0 } = {}) {
    if (!epicKey) {
        throw new Error("epicKey is required");
    }
    const jql = `"Epic Link" = ${epicKey}`;
    return searchIssues(jql, fields, maxResults, startAt);
}
async function getEpicTasks(epicKey, { fields, maxResults = 50, startAt = 0 } = {}) {
    if (!epicKey) {
        throw new Error("epicKey is required");
    }
    const mergedFields = fields
        ? Array.from(new Set([...fields, ...EPIC_TASK_REQUIRED_FIELDS]))
        : undefined;
    const jql = `"Epic Link" = ${epicKey} AND issuetype = Task`;
    return searchIssues(jql, mergedFields, maxResults, startAt);
}
/** GET /rest/api/3/issue/{key}/worklog — list worklogs for issue */
async function getIssueWorklog(issueKeyOrId, startAt = 0, maxResults = 100) {
    const { data } = await jiraClient_1.jira.get(`/issue/${encodeURIComponent(issueKeyOrId)}/worklog`, {
        params: { startAt, maxResults }
    });
    return data; // { worklogs, total, ... }
}
async function getIssueComments(issueKeyOrId, startAt = 0, maxResults = 50) {
    const { data } = await jiraClient_1.jira.get(`/issue/${encodeURIComponent(issueKeyOrId)}/comment`, {
        params: { startAt, maxResults }
    });
    return data;
}
