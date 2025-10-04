#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const api_1 = require("./api");
const fillTemplate_1 = require("./commands/fillTemplate");
const save_1 = require("./utils/save");
const normalizeTaskAssignee = (rawAssignee) => {
    if (!rawAssignee) {
        return null;
    }
    const { accountId = null, displayName = null, emailAddress = null, active, timeZone = null } = rawAssignee ?? {};
    return {
        accountId,
        displayName,
        emailAddress,
        active: typeof active === "boolean" ? active : null,
        timeZone
    };
};
const buildTaskSchedule = (fields) => ({
    dueDate: fields?.duedate ?? null,
    startDate: fields?.[api_1.JIRA_START_DATE_FIELD_KEY] ?? null
});
const deriveAggregatedTimespent = (issueFields) => {
    const rawAggregated = typeof issueFields?.aggregatetimespent === "number" ? issueFields.aggregatetimespent : null;
    if (rawAggregated === null) {
        return null;
    }
    const timetracking = issueFields?.timetracking ?? {};
    const timeSpentSeconds = typeof timetracking?.timeSpentSeconds === "number"
        ? timetracking.timeSpentSeconds
        : typeof issueFields?.timespent === "number"
            ? issueFields.timespent
            : null;
    if (timeSpentSeconds !== null && rawAggregated <= timeSpentSeconds) {
        return null;
    }
    return rawAggregated;
};
const whoamiCmd = {
    command: "whoami",
    describe: "Test Jira auth and print current user",
    builder: (y) => y.option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const data = await (0, api_1.getMyself)();
        argv.out ? (0, save_1.saveJson)(argv.out, data) : console.dir(data, { depth: null });
    }
};
const dashboardsCmd = {
    command: "dashboards",
    describe: "Fetch dashboards",
    builder: (y) => y.option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const data = await (0, api_1.getDashboards)();
        argv.out ? (0, save_1.saveJson)(argv.out, data) : console.dir(data, { depth: null });
    }
};
const epicsCmd = {
    command: "epics",
    describe: "Fetch epics for the configured project (uses PROJECT_KEY env if set)",
    builder: (y) => y
        .option("fields", { type: "string", describe: "Comma-separated fields list" })
        .option("max", { type: "number", default: 50, describe: "maxResults" })
        .option("start", { type: "number", default: 0, describe: "startAt" })
        .option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const fields = argv.fields ? argv.fields.split(",").map(s => s.trim()) : undefined;
        const data = await (0, api_1.getProjectEpics)({
            fields,
            maxResults: argv.max ?? 50,
            startAt: argv.start ?? 0
        });
        argv.out ? (0, save_1.saveJson)(argv.out, data) : console.dir(data, { depth: null });
    }
};
const tasksCmd = {
    command: "tasks",
    describe: "Fetch tasks for the configured project (uses PROJECT_KEY env if set)",
    builder: (y) => y
        .option("fields", { type: "string", describe: "Comma-separated fields list" })
        .option("max", { type: "number", default: 50, describe: "maxResults" })
        .option("start", { type: "number", default: 0, describe: "startAt" })
        .option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const fields = argv.fields ? argv.fields.split(",").map(s => s.trim()) : undefined;
        const data = await (0, api_1.getProjectTasks)({
            fields,
            maxResults: argv.max ?? 50,
            startAt: argv.start ?? 0
        });
        argv.out ? (0, save_1.saveJson)(argv.out, data) : console.dir(data, { depth: null });
    }
};
const issuesCmd = {
    command: "issues",
    describe: "Search issues by JQL",
    builder: (y) => y
        .option("jql", { type: "string", demandOption: true, describe: "JQL string" })
        .option("fields", { type: "string", describe: "Comma-separated fields list" })
        .option("max", { type: "number", default: 50, describe: "maxResults" })
        .option("start", { type: "number", default: 0, describe: "startAt" })
        .option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const fields = argv.fields ? argv.fields.split(",").map(s => s.trim()) : undefined;
        const data = await (0, api_1.searchIssues)(argv.jql, fields, argv.max ?? 50, argv.start ?? 0);
        argv.out ? (0, save_1.saveJson)(argv.out, data) : console.dir(data, { depth: null });
    }
};
const epicIssuesCmd = {
    command: "epic-issues <epic>",
    describe: "Fetch child issues for a specific epic",
    builder: (y) => y
        .positional("epic", { type: "string", demandOption: true, describe: "Epic key (e.g. PROJ-123)" })
        .option("fields", { type: "string", describe: "Comma-separated fields list" })
        .option("max", { type: "number", default: 50, describe: "maxResults" })
        .option("start", { type: "number", default: 0, describe: "startAt" })
        .option("summary", { type: "boolean", default: false, describe: "Output condensed summary" })
        .option("tasks", { type: "boolean", default: false, describe: "Only fetch task issues for the epic" })
        .option("comments", { type: "boolean", default: false, describe: "Include comments for each task (requires --tasks)" })
        .option("assignee", { type: "boolean", default: false, describe: "Include assignee and schedule data for each task (requires --tasks)" })
        .option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const summaryFields = [
            "key",
            "summary",
            "status",
            "timetracking",
            "timespent",
            "aggregatetimespent",
            "parent"
        ];
        const taskFields = [
            "key",
            "summary",
            "status",
            "assignee",
            "timetracking",
            "timespent",
            "aggregatetimespent",
            "parent",
            "duedate",
            api_1.JIRA_START_DATE_FIELD_KEY
        ];
        const parsedFields = argv.fields ? argv.fields.split(",").map(s => s.trim()) : undefined;
        const fields = argv.summary || argv.tasks ? Array.from(new Set([...(parsedFields ?? []), ...(argv.tasks ? taskFields : summaryFields)])) : parsedFields;
        if (argv.tasks) {
            const includeExtendedFields = argv.assignee ?? false;
            const data = await (0, api_1.getEpicTasks)(argv.epic, {
                fields,
                maxResults: argv.max ?? 50,
                startAt: argv.start ?? 0
            });
            const tasks = (data.issues ?? []).map((issue) => {
                const issueFields = issue?.fields ?? {};
                const status = issueFields.status ?? {};
                const timetracking = issueFields.timetracking ?? {};
                const assignee = includeExtendedFields ? normalizeTaskAssignee(issueFields.assignee) : undefined;
                const schedule = includeExtendedFields ? buildTaskSchedule(issueFields) : undefined;
                const aggregatedTimespent = deriveAggregatedTimespent(issueFields);
                return {
                    id: issue.id ?? null,
                    key: issue.key ?? issue.id,
                    summary: issueFields.summary ?? null,
                    status: {
                        name: status.name ?? null
                    },
                    timetracking: {
                        originalEstimate: timetracking.originalEstimate ?? null,
                        originalEstimateSeconds: timetracking.originalEstimateSeconds ?? null,
                        timeSpent: timetracking.timeSpent ?? null,
                        timeSpentSeconds: timetracking.timeSpentSeconds ?? issueFields.timespent ?? null,
                        remainingEstimate: timetracking.remainingEstimate ?? null,
                        remainingEstimateSeconds: timetracking.remainingEstimateSeconds ?? null,
                        aggregatetimespent: aggregatedTimespent
                    },
                    ...(includeExtendedFields ? { assignee, schedule } : {}),
                    _issueFields: issueFields
                };
            });
            if (argv.comments) {
                const tasksWithComments = await Promise.all(tasks.map(async (task) => {
                    const commentsData = await (0, api_1.getIssueComments)(task.key ?? task.id);
                    return {
                        ...task,
                        comments: commentsData?.comments ?? []
                    };
                }));
                const tasksPayload = {
                    epic: argv.epic,
                    total: data.total,
                    startAt: data.startAt,
                    maxResults: data.maxResults,
                    tasks: tasksWithComments.map(({ _issueFields, ...rest }) => rest)
                };
                argv.out ? (0, save_1.saveJson)(argv.out, tasksPayload) : console.dir(tasksPayload, { depth: null });
                return;
            }
            const tasksPayload = {
                epic: argv.epic,
                total: data.total,
                startAt: data.startAt,
                maxResults: data.maxResults,
                tasks: tasks.map(({ _issueFields, ...rest }) => rest)
            };
            argv.out ? (0, save_1.saveJson)(argv.out, tasksPayload) : console.dir(tasksPayload, { depth: null });
            return;
        }
        const data = await (0, api_1.getEpicChildIssues)(argv.epic, {
            fields,
            maxResults: argv.max ?? 50,
            startAt: argv.start ?? 0
        });
        if (argv.summary) {
            const tasks = (data.issues ?? []).map((issue) => {
                const issueFields = issue?.fields ?? {};
                const status = issueFields.status ?? {};
                const timetracking = issueFields.timetracking ?? {};
                return {
                    key: issue.key ?? issue.id,
                    summary: issueFields.summary ?? null,
                    status: {
                        id: status.id ?? null,
                        name: status.name ?? null
                    },
                    timetracking: {
                        originalEstimate: timetracking.originalEstimate ?? null,
                        originalEstimateSeconds: timetracking.originalEstimateSeconds ?? null,
                        timeSpent: timetracking.timeSpent ?? null,
                        timeSpentSeconds: timetracking.timeSpentSeconds ?? issueFields.timespent ?? null,
                        remainingEstimate: timetracking.remainingEstimate ?? null,
                        remainingEstimateSeconds: timetracking.remainingEstimateSeconds ?? null,
                        aggregatetimespent: issueFields.aggregatetimespent ?? null
                    }
                };
            });
            const summaryPayload = {
                epic: argv.epic,
                total: data.total,
                startAt: data.startAt,
                maxResults: data.maxResults,
                tasks
            };
            argv.out ? (0, save_1.saveJson)(argv.out, summaryPayload) : console.dir(summaryPayload, { depth: null });
            return;
        }
        argv.out ? (0, save_1.saveJson)(argv.out, data) : console.dir(data, { depth: null });
    }
};
const worklogCmd = {
    command: "worklog <issueKey>",
    describe: "Fetch worklogs for a single issue",
    builder: (y) => y
        .positional("issueKey", { type: "string", describe: "Issue key or id" })
        .option("start", { type: "number", default: 0, describe: "startAt" })
        .option("max", { type: "number", default: 100, describe: "maxResults" })
        .option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const key = argv.issueKey;
        if (!key) {
            throw new Error("issueKey is required (usage: worklog <issueKey>)");
        }
        const data = await (0, api_1.getIssueWorklog)(key, argv.start ?? 0, argv.max ?? 100);
        argv.out ? (0, save_1.saveJson)(argv.out, data) : console.dir(data, { depth: null });
    }
};
const fillTemplateCmd = {
    command: "fill-template <epic>",
    describe: "Copy the sprint template and fill task summaries for an epic",
    builder: (y) => y
        .positional("epic", { type: "string", demandOption: true, describe: "Epic key (e.g. PROJ-123)" })
        .option("out", { type: "string", describe: "Output XLSX path" })
        .option("max", { type: "number", default: 20, describe: "Maximum number of tasks to fill" })
        .option("yes", { type: "boolean", default: false, describe: "Overwrite output without confirmation" })
        .option("noGPT", { type: "boolean", default: false, describe: "Skip GPT summary generation" }),
    handler: async (argv) => {
        const result = await (0, fillTemplate_1.fillTemplateWithEpicTasks)(argv.epic, {
            outputPath: argv.out,
            maxTasks: argv.max,
            forceOverwrite: argv.yes ?? false,
            disableGpt: argv.noGPT ?? false
        });
        console.dir(result, { depth: null });
    }
};
(0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .scriptName("jira-pull")
    .usage("$0 <cmd> [args]")
    .command(whoamiCmd)
    .command(dashboardsCmd)
    .command(epicsCmd)
    .command(tasksCmd)
    .command(issuesCmd)
    .command(epicIssuesCmd)
    .command(worklogCmd)
    .command(fillTemplateCmd)
    .demandCommand(1)
    .strict()
    .help()
    .parse();
