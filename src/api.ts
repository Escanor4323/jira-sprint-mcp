import { env } from "./config/env";
import { jira } from "./jiraClient";

const DEFAULT_SEARCH_FIELDS = [
    "key",
    "summary",
    "status",
    "assignee",
    "timetracking",
    "timespent",
    "aggregatetimespent",
    "parent"
] as const;

export const JIRA_START_DATE_FIELD_KEY = "customfield_10015";

const EPIC_TASK_REQUIRED_FIELDS = [
    "summary",
    "status",
    "assignee",
    "timetracking",
    "timespent",
    "aggregatetimespent",
    "parent",
    "duedate",
    JIRA_START_DATE_FIELD_KEY
] as const;

type JiraSearchResult = {
    issues: any[];
    total: number;
    startAt: number;
    maxResults: number;
    nextPageToken?: string | null;
    isLast?: boolean;
};

/** GET /rest/api/3/myself — sanity/auth check */
export async function getMyself() {
    const { data } = await jira.get("/myself");
    return data;
}

/** GET /rest/api/3/dashboard — list dashboards */
export async function getDashboards() {
    const { data } = await jira.get("/dashboard");
    return data; // { dashboards: [...] }
}

/** POST /rest/api/3/search/jql — query issues via JQL */
export async function searchIssues(jql: string, fields?: string[], maxResults = 50, startAt = 0): Promise<JiraSearchResult> {
    const queryFields = fields ?? [...DEFAULT_SEARCH_FIELDS];

    const payload = {
        jql,
        maxResults,
        fields: queryFields
    };

    const { data } = await jira.post("/search/jql", payload);
    const queries = Array.isArray((data as any)?.queries) ? (data as any).queries : undefined;
    const results = queries?.length ? queries[0]?.results ?? queries[0] ?? {} : data ?? {};
    const issues = (results as any)?.issues ?? (data as any)?.issues ?? [];
    const resolvedTotal = (results as any)?.total ?? (data as any)?.total ?? issues.length ?? 0;
    const resolvedStartAt = (results as any)?.startAt ?? (data as any)?.startAt ?? 0;
    const resolvedMaxResults = (results as any)?.maxResults ?? (data as any)?.maxResults ?? maxResults;
    const nextPageToken = (results as any)?.nextPageToken ?? (data as any)?.nextPageToken ?? null;
    const isLast = (results as any)?.isLast ?? (data as any)?.isLast;
    return {
        issues,
        total: resolvedTotal,
        startAt: resolvedStartAt,
        maxResults: resolvedMaxResults,
        nextPageToken,
        isLast
    };
}

export async function getProjectEpics({
    projectKey,
    fields,
    maxResults = 50,
    startAt = 0
}: {
    projectKey?: string;
    fields?: string[];
    maxResults?: number;
    startAt?: number;
} = {}): Promise<JiraSearchResult> {
    const resolvedProjectKey = projectKey ?? env.PROJECT_KEY;
    if (!resolvedProjectKey) {
        throw new Error("PROJECT_KEY is not configured. Pass projectKey or set env.PROJECT_KEY.");
    }
    const jql = `project = ${resolvedProjectKey} AND issuetype = Epic`;
    return searchIssues(jql, fields, maxResults, startAt);
}

export async function getProjectTasks({
    projectKey,
    fields,
    maxResults = 50,
    startAt = 0
}: {
    projectKey?: string;
    fields?: string[];
    maxResults?: number;
    startAt?: number;
} = {}): Promise<JiraSearchResult> {
    const resolvedProjectKey = projectKey ?? env.PROJECT_KEY;
    if (!resolvedProjectKey) {
        throw new Error("PROJECT_KEY is not configured. Pass projectKey or set env.PROJECT_KEY.");
    }
    const jql = `project = ${resolvedProjectKey} AND issuetype = Task`;
    return searchIssues(jql, fields, maxResults, startAt);
}

export async function getEpicChildIssues(epicKey: string, {
    fields,
    maxResults = 50,
    startAt = 0
}: {
    fields?: string[];
    maxResults?: number;
    startAt?: number;
} = {}): Promise<JiraSearchResult> {
    if (!epicKey) {
        throw new Error("epicKey is required");
    }
    const jql = `"Epic Link" = ${epicKey}`;
    return searchIssues(jql, fields, maxResults, startAt);
}

export async function getEpicTasks(epicKey: string, {
    fields,
    maxResults = 50,
    startAt = 0
}: {
    fields?: string[];
    maxResults?: number;
    startAt?: number;
} = {}): Promise<JiraSearchResult> {
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
export async function getIssueWorklog(issueKeyOrId: string, startAt = 0, maxResults = 100) {
    const { data } = await jira.get(`/issue/${encodeURIComponent(issueKeyOrId)}/worklog`, {
        params: { startAt, maxResults }
    });
    return data; // { worklogs, total, ... }
}

export async function getIssueComments(issueKeyOrId: string, startAt = 0, maxResults = 50) {
    const { data } = await jira.get(`/issue/${encodeURIComponent(issueKeyOrId)}/comment`, {
        params: { startAt, maxResults }
    });
    return data;
}
