import axios, {AxiosInstance} from "axios";
import {env} from "../config/env";
import {log} from "../utils/logger";
import {Buffer} from "buffer";

const baseURL = `${env.JIRA_BASE_URL}/rest/api/3`;

// Basic Auth header
const authString = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");

export const jiraClient: AxiosInstance = axios.create({
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
export async function getDashboards() {
    const {data} = await jiraClient.get("/dashboard");
    return data; // { dashboards: [...] }
}

// ---------- Issues (Search via JQL) ----------
export type SearchIssuesParams = {
    jql: string;
    fields?: string[];
    maxResults?: number;
    startAt?: number;
};

export async function searchIssues(params: SearchIssuesParams) {
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

    const {data} = await jiraClient.post("/search/jql", payload);
    const queries = Array.isArray((data as any)?.queries) ? (data as any).queries : undefined;
    const results = queries?.length ? queries[0]?.results ?? queries[0] ?? {} : data ?? {};
    return results ?? {};
}

// ---------- Worklogs ----------
export async function getIssueWorklog(issueKeyOrId: string, startAt = 0, maxResults = 100) {
    const {data} = await jiraClient.get(`/issue/${encodeURIComponent(issueKeyOrId)}/worklog`, {
        params: {startAt, maxResults}
    });
    return data; // { worklogs: [...], total, ... }
}

// ---------- Myself (connection test) ----------
export async function getMyself() {
    const {data} = await jiraClient.get("/myself");
    return data;
}

// ---------- Tasks (Background Tasks API group) ----------
/**
 * Jira "Tasks" API group refers to long-running background tasks started by some operations.
 * These endpoints are not about "issue type Task". You usually have a taskId from a previous operation.
 */
export async function getTask(taskId: string) {
    const {data} = await jiraClient.get(`/task/${encodeURIComponent(taskId)}`);
    return data; // details of a long-running task
}

// ---------- Webhooks (NOTE) ----------
/**
 * Creating/deleting webhooks via REST requires app/OAuth context and proper scopes in Jira Cloud.
 * With Basic Auth (user + token), this may return 403. Kept here for completeness if you later move to OAuth.
 */
export async function tryCreateWebhook(options: {
    url: string;
    events: string[];
    jqlFilter?: string;
}) {
    try {
        const {data} = await jiraClient.post(`/webhook`, {
            url: options.url,
            webhooks: [
                {
                    events: options.events,
                    jqlFilter: options.jqlFilter ?? ""
                }
            ]
        });
        return data;
    } catch (err: any) {
        log.warn("Webhook create likely requires OAuth/Connect app context. Error:", err?.response?.status, err?.response?.data);
        throw err;
    }
}
