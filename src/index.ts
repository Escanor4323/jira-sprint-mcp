#!/usr/bin/env node
import yargs, { Argv, CommandModule } from "yargs";
import { hideBin } from "yargs/helpers";
import {
    getDashboards,
    getEpicChildIssues,
    getEpicTasks,
    getIssueComments,
    getIssueWorklog,
    getMyself,
    getProjectEpics,
    getProjectTasks,
    searchIssues,
    JIRA_START_DATE_FIELD_KEY
} from "./api";
import { fillTemplateWithEpicTasks } from "./commands/fillTemplate";
import { saveJson } from "./utils/save";

type TaskAssignee = {
    accountId: string | null;
    displayName: string | null;
    emailAddress: string | null;
    active: boolean | null;
    timeZone: string | null;
};

type TaskSchedule = {
    dueDate: string | null;
    startDate: string | null;
};

const normalizeTaskAssignee = (rawAssignee: any): TaskAssignee | null => {
    if (!rawAssignee) {
        return null;
    }

    const {
        accountId = null,
        displayName = null,
        emailAddress = null,
        active,
        timeZone = null
    } = rawAssignee ?? {};

    return {
        accountId,
        displayName,
        emailAddress,
        active: typeof active === "boolean" ? active : null,
        timeZone
    };
};

const buildTaskSchedule = (fields: any): TaskSchedule => ({
    dueDate: fields?.duedate ?? null,
    startDate: fields?.[JIRA_START_DATE_FIELD_KEY] ?? null
});

const deriveAggregatedTimespent = (issueFields: any): number | null => {
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

// whoami
interface WhoamiArgs { out?: string }
const whoamiCmd: CommandModule<{}, WhoamiArgs> = {
    command: "whoami",
    describe: "Test Jira auth and print current user",
    builder: (y: Argv<{}>) =>
        y.option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const data = await getMyself();
        argv.out ? saveJson(argv.out, data) : console.dir(data, { depth: null });
    }
};

// dashboards
interface DashArgs { out?: string }
const dashboardsCmd: CommandModule<{}, DashArgs> = {
    command: "dashboards",
    describe: "Fetch dashboards",
    builder: (y) => y.option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const data = await getDashboards();
        argv.out ? saveJson(argv.out, data) : console.dir(data, { depth: null });
    }
};

// epics
interface EpicsArgs {
    max?: number;
    start?: number;
    fields?: string;
    out?: string;
}
const epicsCmd: CommandModule<{}, EpicsArgs> = {
    command: "epics",
    describe: "Fetch epics for the configured project (uses PROJECT_KEY env if set)",
    builder: (y) =>
        y
            .option("fields", { type: "string", describe: "Comma-separated fields list" })
            .option("max", { type: "number", default: 50, describe: "maxResults" })
            .option("start", { type: "number", default: 0, describe: "startAt" })
            .option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const fields = argv.fields ? argv.fields.split(",").map(s => s.trim()) : undefined;
        const data = await getProjectEpics({
            fields,
            maxResults: argv.max ?? 50,
            startAt: argv.start ?? 0
        });
        argv.out ? saveJson(argv.out, data) : console.dir(data, { depth: null });
    }
};

// tasks
interface TasksArgs {
    max?: number;
    start?: number;
    fields?: string;
    out?: string;
}
const tasksCmd: CommandModule<{}, TasksArgs> = {
    command: "tasks",
    describe: "Fetch tasks for the configured project (uses PROJECT_KEY env if set)",
    builder: (y) =>
        y
            .option("fields", { type: "string", describe: "Comma-separated fields list" })
            .option("max", { type: "number", default: 50, describe: "maxResults" })
            .option("start", { type: "number", default: 0, describe: "startAt" })
            .option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const fields = argv.fields ? argv.fields.split(",").map(s => s.trim()) : undefined;
        const data = await getProjectTasks({
            fields,
            maxResults: argv.max ?? 50,
            startAt: argv.start ?? 0
        });
        argv.out ? saveJson(argv.out, data) : console.dir(data, { depth: null });
    }
};

// issues
interface IssuesArgs {
    jql: string;
    fields?: string;
    max?: number;
    start?: number;
    out?: string;
}
const issuesCmd: CommandModule<{}, IssuesArgs> = {
    command: "issues",
    describe: "Search issues by JQL",
    builder: (y) =>
        y
            .option("jql", { type: "string", demandOption: true, describe: "JQL string" })
            .option("fields", { type: "string", describe: "Comma-separated fields list" })
            .option("max", { type: "number", default: 50, describe: "maxResults" })
            .option("start", { type: "number", default: 0, describe: "startAt" })
            .option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const fields = argv.fields ? argv.fields.split(",").map(s => s.trim()) : undefined;
        const data = await searchIssues(argv.jql, fields, argv.max ?? 50, argv.start ?? 0);
        argv.out ? saveJson(argv.out, data) : console.dir(data, { depth: null });
    }
};

// epic-issues
interface EpicIssuesArgs {
    epic: string;
    max?: number;
    start?: number;
    fields?: string;
    out?: string;
    summary?: boolean;
    tasks?: boolean;
    comments?: boolean;
    assignee?: boolean;
}

const epicIssuesCmd: CommandModule<{}, EpicIssuesArgs> = {
    command: "epic-issues <epic>",
    describe: "Fetch child issues for a specific epic",
    builder: (y) =>
        y
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
            JIRA_START_DATE_FIELD_KEY
        ];
        const parsedFields = argv.fields ? argv.fields.split(",").map(s => s.trim()) : undefined;
        const fields = argv.summary || argv.tasks ? Array.from(new Set([...(parsedFields ?? []), ...(argv.tasks ? taskFields : summaryFields)])) : parsedFields;

        if (argv.tasks) {
            const includeExtendedFields = argv.assignee ?? false;
            const data = await getEpicTasks(argv.epic, {
                fields,
                maxResults: argv.max ?? 50,
                startAt: argv.start ?? 0
            });

            const tasks = (data.issues ?? []).map((issue: any) => {
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
                const tasksWithComments = await Promise.all(
                    tasks.map(async (task) => {
                        const commentsData = await getIssueComments(task.key ?? task.id);
                        return {
                            ...task,
                            comments: commentsData?.comments ?? []
                        };
                    })
                );

                const tasksPayload = {
                    epic: argv.epic,
                    total: data.total,
                    startAt: data.startAt,
                    maxResults: data.maxResults,
                    tasks: tasksWithComments.map(({ _issueFields, ...rest }) => rest)
                };

                argv.out ? saveJson(argv.out, tasksPayload) : console.dir(tasksPayload, { depth: null });
                return;
            }

            const tasksPayload = {
                epic: argv.epic,
                total: data.total,
                startAt: data.startAt,
                maxResults: data.maxResults,
                tasks: tasks.map(({ _issueFields, ...rest }) => rest)
            };

            argv.out ? saveJson(argv.out, tasksPayload) : console.dir(tasksPayload, { depth: null });
            return;
        }

        const data = await getEpicChildIssues(argv.epic, {
            fields,
            maxResults: argv.max ?? 50,
            startAt: argv.start ?? 0
        });

        if (argv.summary) {
            const tasks = (data.issues ?? []).map((issue: any) => {
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
            argv.out ? saveJson(argv.out, summaryPayload) : console.dir(summaryPayload, { depth: null });
            return;
        }

        argv.out ? saveJson(argv.out, data) : console.dir(data, { depth: null });
    }
};

// worklog
interface WorklogArgs { issueKey?: string; start?: number; max?: number; out?: string }
const worklogCmd: CommandModule<{}, WorklogArgs> = {
    command: "worklog <issueKey>",
    describe: "Fetch worklogs for a single issue",
    builder: (y) =>
        y
            .positional("issueKey", { type: "string", describe: "Issue key or id" })
            .option("start", { type: "number", default: 0, describe: "startAt" })
            .option("max", { type: "number", default: 100, describe: "maxResults" })
            .option("out", { type: "string", describe: "Optional file path to save JSON" }),
    handler: async (argv) => {
        const key = argv.issueKey;
        if (!key) {
            throw new Error("issueKey is required (usage: worklog <issueKey>)");
        }
        const data = await getIssueWorklog(key, argv.start ?? 0, argv.max ?? 100);
        argv.out ? saveJson(argv.out, data) : console.dir(data, { depth: null });
    }
};

interface FillTemplateArgs {
    epic: string;
    out?: string;
    max?: number;
    yes?: boolean;
    noGPT?: boolean;
}

const fillTemplateCmd: CommandModule<{}, FillTemplateArgs> = {
    command: "fill-template <epic>",
    describe: "Copy the sprint template and fill task summaries for an epic",
    builder: (y) =>
        y
            .positional("epic", { type: "string", demandOption: true, describe: "Epic key (e.g. PROJ-123)" })
            .option("out", { type: "string", describe: "Output XLSX path" })
            .option("max", { type: "number", default: 20, describe: "Maximum number of tasks to fill" })
            .option("yes", { type: "boolean", default: false, describe: "Overwrite output without confirmation" })
            .option("noGPT", { type: "boolean", default: false, describe: "Skip GPT summary generation" }),
    handler: async (argv) => {
        const result = await fillTemplateWithEpicTasks(argv.epic, {
            outputPath: argv.out,
            maxTasks: argv.max,
            forceOverwrite: argv.yes ?? false,
            disableGpt: argv.noGPT ?? false
        });
        console.dir(result, { depth: null });
    }
};

yargs(hideBin(process.argv))
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
