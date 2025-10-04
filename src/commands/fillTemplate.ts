import readline from "readline";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { getEpicTasks, getIssueComments } from "../api";
import {
    populateSprintScheduleWorksheet,
    mapIssueToSprintTask,
    SprintComment,
    SprintTask
} from "../services/sprintTemplateWriter";
import { computeInitials } from "../utils/initials";
import { buildPerformanceSystemPrompt, buildTeamLeadSystemPrompt, gptClient } from "../utils/gptClient";

const TEMPLATE_RELATIVE_PATH = "src/templates/M1_GA1_Sprint_Schedule_Temp CS 4310.xlsx";
const TEMPLATE_PATH = path.resolve(process.cwd(), TEMPLATE_RELATIVE_PATH);
const DEFAULT_OUTPUT_DIRECTORY = path.resolve(process.cwd(), "outputs");
const DEFAULT_FILE_PREFIX = "epic";
const YES_RESPONSES = new Set(["y", "yes"]);
const MEMBER_START_ROW = 4;
const PERFORMANCE_COLUMN = "B";
const PERFORMANCE_START_ROW = 55;
const PLAN_INITIAL_HEADER_COLUMNS = ["G", "H", "I", "J", "K", "L", "M", "N", "O"] as const;
const ACTUAL_INITIAL_HEADER_COLUMNS = ["P", "Q", "R", "S", "T", "U", "V", "W", "X"] as const;

const TEAM_ROSTER: Array<{ name: string; role: string }> = [
    { name: "Joel Martinez", role: "Team Leader (TL)" },
    { name: "Jorge Magaña", role: "Planning Manager (PM)" },
    { name: "Epifanio Sarinana", role: "Quality Manager (QM)" },
    { name: "Isaac Zarate", role: "Support Manager (SM)" },
    { name: "Caitlin Gregory", role: "Customer Interface Manager (CIM)" },
    { name: "Ugyen Dorji", role: "Behavior Manager (BM)" },
    { name: "Damien Pimentel", role: "Data-Flow & Business Manager (DBM)" },
    { name: "Dylan Andrade", role: "Analyst Manager (AM)" }
];

type FillTemplateOptions = {
    outputPath?: string;
    maxTasks?: number;
    forceOverwrite?: boolean;
    disableGpt?: boolean;
};

type FillTemplateResult = {
    epic: string;
    file: string;
    tasksCount?: number;
    cancelled?: boolean;
    assignments?: TaskAssignmentRecord[];
    summary?: WorkSummary;
    performance?: MemberPerformance[];
};

type TaskAssignmentRecord = {
    key: string;
    summary: string;
    assignee: string | null;
    initials: string | null;
    originalEstimateSeconds: number | null;
    timeSpentSeconds: number | null;
};

type WorkSummary = {
    balancedDistribution: string;
    dueDateStrategy: string;
    timelinessAnalysis: string;
    dueDateAnalysis: string;
    reworkNarrative: string;
};

type MemberPerformance = {
    name: string;
    score: number;
    rationale: string;
};

type MemberSnapshot = {
    name: string;
    role: string;
    taskCount: number;
    planSeconds: number;
    actualSeconds: number;
    tasks: string[];
    commentHighlights: string[];
};

type MemberSnapshotMap = Map<string, MemberSnapshot>;

export async function fillTemplateWithEpicTasks(epicKey: string, options: FillTemplateOptions = {}): Promise<FillTemplateResult> {
    if (!epicKey) {
        throw new Error("Epic key is required");
    }

    const destinationPath = resolveDestinationPath(epicKey, options.outputPath);

    ensureDirectory(path.dirname(destinationPath));

    if (!fs.existsSync(TEMPLATE_PATH)) {
        throw new Error(`Template not found at ${TEMPLATE_PATH}`);
    }

    if (fs.existsSync(destinationPath)) {
        const confirmed = options.forceOverwrite ? true : await confirmOverwrite(destinationPath);
        if (!confirmed) {
            console.log("Operation cancelled. Existing file left untouched.");
            return {
                epic: epicKey,
                file: destinationPath,
                cancelled: true
            };
        }
    } else {
        console.log(`Creating new sprint schedule at ${destinationPath}`);
    }

    fs.copyFileSync(TEMPLATE_PATH, destinationPath);

    const maxTasks = options.maxTasks ?? 50;
    const searchResult = await getEpicTasks(epicKey, {
        maxResults: maxTasks,
        fields: [
            "key",
            "summary",
            "status",
            "assignee",
            "timetracking",
            "timespent",
            "aggregatetimespent",
            "parent",
            "duedate",
            "customfield_10015"
        ]
    });

    const jiraTasks = searchResult.issues ?? [];
    const initialsMap = buildInitialsMap(jiraTasks);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(destinationPath);
    const worksheet = workbook.worksheets[0];

    populateInitialHeaderRow(worksheet, initialsMap);

    const resolveInitialsFn = (name: string) => resolveInitials(name, initialsMap);
    const mappedTasks = jiraTasks.map(issue => mapIssueToSprintTask(issue, resolveInitialsFn));
    const comments = await fetchCommentsForTasks(mappedTasks);

    populateSprintScheduleWorksheet(worksheet, mappedTasks, comments, resolveInitialsFn);

    populateTeamRoster(worksheet, initialsMap);

    const assignments = buildAssignmentRecords(mappedTasks);
    const summary = options.disableGpt
        ? buildFallbackWorkSummary(mappedTasks)
        : await buildWorkSummary(mappedTasks, comments);
    const performance = options.disableGpt
        ? buildFallbackPerformance()
        : await buildMemberPerformance(mappedTasks, comments);
    await populateSummarySection(worksheet, summary);
    populatePerformanceSection(worksheet, performance);

    await workbook.xlsx.writeFile(destinationPath);

    return {
        epic: epicKey,
        tasksCount: jiraTasks.length,
        file: destinationPath,
        assignments,
        summary,
        performance
    };
}

async function fetchCommentsForTasks(tasks: SprintTask[]): Promise<SprintComment[]> {
    const comments: SprintComment[] = [];
    for (const task of tasks) {
        if (!task.key) {
            continue;
        }
        const commentData = await getIssueComments(task.key);
        const taskComments = (commentData?.comments ?? []).map((comment: any) => ({
            taskKey: task.key,
            text: extractCommentText(comment)
        }));
        comments.push(...taskComments);
    }
    return comments;
}

async function buildWorkSummary(tasks: SprintTask[], comments: SprintComment[]): Promise<WorkSummary> {
    const systemPrompt = buildTeamLeadSystemPrompt();
    const userPrompt = createSummaryPrompt(tasks, comments);
    const response = await gptClient.complete({
        systemPrompt,
        userPrompt,
        temperature: 0.4,
        maxTokens: 600
    });

    return parseWorkSummary(response);
}

async function buildMemberPerformance(tasks: SprintTask[], comments: SprintComment[]): Promise<MemberPerformance[]> {
    const systemPrompt = buildPerformanceSystemPrompt();
    const userPrompt = createPerformancePrompt(tasks, comments);
    const response = await gptClient.complete({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 300
    });

    return parsePerformanceResponse(response, tasks);
}

function buildFallbackWorkSummary(tasks: SprintTask[]): WorkSummary {
    const tasksLabel = tasks.length === 1 ? "task" : "tasks";
    const planTotals = aggregateHours(tasks, task => task.plan.seconds);
    const actualTotals = aggregateHours(tasks, task => task.actual.seconds);
    const summarizeTotals = (totals: Array<{ name: string; seconds: number }>) =>
        totals.length === 0
            ? "No tracked time available."
            : totals
                .map(entry => `${entry.name}: ${formatSeconds(entry.seconds)}`)
                .join(" | ");

    const balancedDistribution = `Generated ${tasks.length} ${tasksLabel}. ${summarizeTotals(planTotals)}`;
    const dueDateStrategy = "GPT disabled; review sprint board for due date strategy.";
    const timelinessAnalysis = summarizeTotals(actualTotals);
    const dueDateAnalysis = "No AI analysis provided; verify staggered deadlines manually.";
    const reworkNarrative = "No AI rework narrative available.";

    return {
        balancedDistribution,
        dueDateStrategy,
        timelinessAnalysis,
        dueDateAnalysis,
        reworkNarrative
    };
}

function buildFallbackPerformance(): MemberPerformance[] {
    return TEAM_ROSTER.map(member => ({
        name: member.name,
        score: 92,
        rationale: "GPT disabled; score set manually."
    }));
}

function createPerformancePrompt(tasks: SprintTask[], comments: SprintComment[]): string {
    const snapshots = buildMemberSnapshots(tasks, comments);
    const payload = Array.from(snapshots.values()).map(snapshot => ({
        name: snapshot.name,
        role: snapshot.role,
        taskCount: snapshot.taskCount,
        planHours: secondsToHours(snapshot.planSeconds),
        actualHours: secondsToHours(snapshot.actualSeconds),
        tasks: snapshot.tasks,
        comments: snapshot.commentHighlights
    }));

    return `Assess each team member using the provided data. Return ONLY a JSON array. Data:
${JSON.stringify(payload, null, 2)}`;
}

function buildMemberSnapshots(tasks: SprintTask[], comments: SprintComment[]): MemberSnapshotMap {
    const snapshotMap: MemberSnapshotMap = new Map();

    const ensureSnapshot = (name: string): MemberSnapshot => {
        const existing = snapshotMap.get(name);
        if (existing) {
            return existing;
        }
        const rosterEntry = TEAM_ROSTER.find(member => member.name === name);
        const snapshot: MemberSnapshot = {
            name,
            role: rosterEntry?.role ?? "Team Member",
            taskCount: 0,
            planSeconds: 0,
            actualSeconds: 0,
            tasks: [],
            commentHighlights: []
        };
        snapshotMap.set(name, snapshot);
        return snapshot;
    };

    tasks.forEach(task => {
        const assignee = task.assigneeDisplayName || "Unassigned";
        const snapshot = ensureSnapshot(assignee);
        snapshot.taskCount += 1;
        const planSeconds = typeof task.plan.seconds === "number" ? task.plan.seconds : 0;
        const actualSeconds = typeof task.actual.seconds === "number" ? task.actual.seconds : 0;
        snapshot.planSeconds += Number.isFinite(planSeconds) ? planSeconds : 0;
        snapshot.actualSeconds += Number.isFinite(actualSeconds) ? actualSeconds : 0;
        snapshot.tasks.push(`${task.key}: ${task.summary}`);
    });

    const topComments = aggregateCommentsByAssignee(tasks, comments);
    topComments.forEach((entries, name) => {
        const snapshot = ensureSnapshot(name);
        snapshot.commentHighlights.push(...entries.slice(0, 3));
    });

    TEAM_ROSTER.forEach(member => ensureSnapshot(member.name));

    return snapshotMap;
}

function aggregateCommentsByAssignee(tasks: SprintTask[], comments: SprintComment[]): Map<string, string[]> {
    const keyToAssignee = new Map<string, string>();
    tasks.forEach(task => {
        keyToAssignee.set(task.key, task.assigneeDisplayName || "Unassigned");
    });

    const commentMap = new Map<string, string[]>();
    comments.forEach(comment => {
        const assignee = keyToAssignee.get(comment.taskKey) || "Unassigned";
        const entries = commentMap.get(assignee) ?? [];
        if (comment.text && comment.text.trim().length > 0) {
            entries.push(`${comment.taskKey}: ${comment.text.trim()}`);
            commentMap.set(assignee, entries);
        }
    });
    return commentMap;
}

function secondsToHours(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return 0;
    }
    const hours = seconds / 3600;
    return Math.round(hours * 100) / 100;
}

function parsePerformanceResponse(raw: string, tasks: SprintTask[]): MemberPerformance[] {
    const safeRaw = raw.trim();
    if (!safeRaw) {
        return buildFallbackPerformance();
    }

    try {
        const parsed = JSON.parse(safeRaw);
        if (!Array.isArray(parsed)) {
            return buildFallbackPerformance();
        }

        return parsed
            .filter(entry => typeof entry?.name === "string")
            .map(entry => ({
                name: entry.name,
                score: clampScore(entry.score),
                rationale: typeof entry.rationale === "string" && entry.rationale.trim().length > 0
                    ? entry.rationale.trim()
                    : "Performance rationale not provided."
            }));
    } catch (error) {
        console.warn("Failed to parse GPT performance response", error);
        return buildFallbackPerformance();
    }
}

function clampScore(value: unknown): number {
    const score = typeof value === "number" ? value : 92;
    if (!Number.isFinite(score)) {
        return 92;
    }
    const rounded = Math.round(score);
    return Math.min(100, Math.max(60, rounded));
}

function extractCommentText(comment: any): string {
    if (!comment) {
        return "";
    }
    if (typeof comment.body === "string") {
        return comment.body;
    }
    if (comment.body?.content) {
        return flattenAtlassianDocument(comment.body.content).join(" ").trim();
    }
    return "";
}

function flattenAtlassianDocument(content: any[]): string[] {
    const parts: string[] = [];
    content.forEach(node => {
        if (!node) {
            return;
        }
        if (typeof node.text === "string") {
            parts.push(node.text);
        }
        if (Array.isArray(node.content)) {
            parts.push(...flattenAtlassianDocument(node.content));
        }
    });
    return parts;
}

function populateTeamRoster(worksheet: ExcelJS.Worksheet, initialsMap: Record<string, string>) {
    TEAM_ROSTER.forEach((member, index) => {
        const row = MEMBER_START_ROW + index;
        const initials = resolveInitials(member.name, initialsMap);
        worksheet.getCell(`A${row}`).value = member.name;
        worksheet.getCell(`C${row}`).value = initials;
        worksheet.getCell(`D${row}`).value = member.role;
    });
}

function populateInitialHeaderRow(worksheet: ExcelJS.Worksheet, initialsMap: Record<string, string>) {
    const initials = TEAM_ROSTER.map(member => resolveInitials(member.name, initialsMap));

    PLAN_INITIAL_HEADER_COLUMNS.forEach((column, index) => {
        worksheet.getCell(`${column}17`).value = initials[index] ?? null;
    });

    ACTUAL_INITIAL_HEADER_COLUMNS.forEach((column, index) => {
        worksheet.getCell(`${column}17`).value = initials[index] ?? null;
    });
}

function populatePerformanceSection(worksheet: ExcelJS.Worksheet, performance: MemberPerformance[]) {
    const normalized = mergePerformanceWithRoster(performance);
    normalized.forEach((entry, index) => {
        const row = PERFORMANCE_START_ROW + index;
        const cell = worksheet.getCell(`${PERFORMANCE_COLUMN}${row}`);
        cell.value = formatPerformanceCell(entry);
    });
}

function mergePerformanceWithRoster(performance: MemberPerformance[]): MemberPerformance[] {
    const byName = new Map(performance.map(entry => [entry.name.trim(), entry] as const));
    return TEAM_ROSTER.map(member => {
        const matched = byName.get(member.name) ?? byName.get(member.name.trim());
        return matched ?? {
            name: member.name,
            score: 90,
            rationale: "No performance data; defaulting to 90."
        };
    });
}

function formatPerformanceCell(performance: MemberPerformance): string {
    const clampedScore = clampScore(performance.score);
    const rationale = performance.rationale.trim() || "No rationale provided.";
    return `${performance.name}: ${clampedScore}/100 - ${rationale}`;
}

function buildAssignmentRecords(tasks: SprintTask[]): TaskAssignmentRecord[] {
    return tasks.map(task => ({
        key: task.key,
        summary: task.summary,
        assignee: task.assigneeDisplayName || null,
        initials: task.initials || null,
        originalEstimateSeconds: typeof task.plan.seconds === "number" ? task.plan.seconds : null,
        timeSpentSeconds: typeof task.actual.seconds === "number" ? task.actual.seconds : null
    }));
}

function createSummaryPrompt(tasks: SprintTask[], comments: SprintComment[]): string {
    const planTotals = aggregateHours(tasks, task => task.plan.seconds);
    const actualTotals = aggregateHours(tasks, task => task.actual.seconds);

    const lines: string[] = [
        "Balanced work analysis data:",
        ...tasks.map(task => `TASK ${task.key} | ${task.summary} | Assignee: ${task.assigneeDisplayName || "Unassigned"} | Plan: ${formatSeconds(task.plan.seconds)} | Actual: ${formatSeconds(task.actual.seconds)}`),
        "",
        "Plan totals by member:",
        ...planTotals.map(entry => `${entry.name}: ${formatSeconds(entry.seconds)}`),
        "",
        "Actual totals by member:",
        ...actualTotals.map(entry => `${entry.name}: ${formatSeconds(entry.seconds)}`),
        "",
        "Task comments:"
    ];
    comments.forEach(comment => {
        lines.push(`- ${comment.taskKey}: ${comment.text}`);
    });

    return `Using the following data, write separate responses for:
1) Balanced work effort distribution (decision, rationale, approach).
2) Due date strategy (explain use of staggered deadlines and review cadence).
3) Timeliness analysis (on-time delivery assessment).
4) Due date adherence analysis (specifically discuss staggered deadlines).
5) Rework explanation (if any rework happened, describe cause and affected sections).

Be concise (2-3 sentences per item) but concrete.

DATA:\n${lines.join("\n")}`;
}

function aggregateHours(tasks: SprintTask[], selector: (task: SprintTask) => number | null | undefined): Array<{ name: string; seconds: number }> {
    const totals = new Map<string, number>();
    tasks.forEach(task => {
        const seconds = selector(task);
        if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
            return;
        }
        const key = task.assigneeDisplayName || "Unassigned";
        totals.set(key, (totals.get(key) ?? 0) + seconds);
    });
    return Array.from(totals.entries()).map(([name, seconds]) => ({ name, seconds }));
}

function formatSeconds(seconds?: number | null): string {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
        return "n/a";
    }
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}

function parseWorkSummary(raw: string): WorkSummary {
    const sections: Record<string, string> = {
        balancedDistribution: extractSection(raw, /Balanced[\s\S]*?(?=Due|Timeliness|$)/i),
        dueDateStrategy: extractSection(raw, /Due date strategy[\s\S]*?(?=Timeliness|Due date adherence|$)/i),
        timelinessAnalysis: extractSection(raw, /Timeliness analysis[\s\S]*?(?=Due date adherence|Rework|$)/i),
        dueDateAnalysis: extractSection(raw, /Due date adherence[\s\S]*?(?=Rework explanation|$)/i),
        reworkNarrative: extractSection(raw, /Rework explanation[\s\S]*/i)
    };

    return {
        balancedDistribution: sections.balancedDistribution,
        dueDateStrategy: sections.dueDateStrategy,
        timelinessAnalysis: sections.timelinessAnalysis,
        dueDateAnalysis: sections.dueDateAnalysis,
        reworkNarrative: sections.reworkNarrative
    };
}

function extractSection(text: string, regex: RegExp): string {
    const match = text.match(regex);
    if (!match) {
        return "";
    }
    return match[0]
        .replace(/^Balanced work effort distribution[:\-\s]*/i, "")
        .replace(/^Due date strategy[:\-\s]*/i, "")
        .replace(/^Timeliness analysis[:\-\s]*/i, "")
        .replace(/^Due date adherence analysis[:\-\s]*/i, "")
        .replace(/^Rework explanation[:\-\s]*/i, "")
        .trim();
}

async function populateSummarySection(worksheet: ExcelJS.Worksheet, summary: WorkSummary) {
    const safeValue = (value: string) => value && value.trim().length > 0 ? value.trim() : "No updates provided.";
    worksheet.getCell("B43").value = safeValue(summary.balancedDistribution);
    worksheet.getCell("B44").value = safeValue(summary.timelinessAnalysis);
    worksheet.getCell("B45").value = safeValue(summary.dueDateAnalysis);
    worksheet.getCell("B46").value = safeValue(summary.dueDateStrategy);
    worksheet.getCell("B47").value = safeValue(summary.reworkNarrative);
}

function resolveDestinationPath(epicKey: string, requestedOutputPath?: string): string {
    if (requestedOutputPath) {
        return path.isAbsolute(requestedOutputPath)
            ? requestedOutputPath
            : path.resolve(process.cwd(), requestedOutputPath);
    }
    const fileName = `${DEFAULT_FILE_PREFIX}-${epicKey}-filled.xlsx`;
    return path.join(DEFAULT_OUTPUT_DIRECTORY, fileName);
}

function ensureDirectory(directoryPath: string) {
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
    }
}

async function confirmOverwrite(filePath: string): Promise<boolean> {
    console.log(`File already exists at ${filePath}.`);
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.warn("No interactive TTY available. Aborting to avoid overwriting the existing file.");
        return false;
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (query: string) => new Promise<string>(resolve => rl.question(query, resolve));
    const answer = (await question("Overwrite this file? (Y/N): ")).trim().toLowerCase();
    rl.close();

    return YES_RESPONSES.has(answer);
}

function buildInitialsMap(jiraIssues: any[]): Record<string, string> {
    const names = new Set<string>();
    TEAM_ROSTER.forEach(member => names.add(member.name));
    jiraIssues.forEach(issue => {
        const name = String(issue?.fields?.assignee?.displayName ?? "").trim();
        if (name) {
            names.add(name);
        }
    });

    const map: Record<string, string> = {};
    for (const name of names) {
        map[name] = computeInitials(name);
    }

    tweakInitialsForKnownConflicts(map);
    return map;
}

function tweakInitialsForKnownConflicts(initialsMap: Record<string, string>) {
    const joelKey = Object.keys(initialsMap).find(name => name.startsWith("Joel Martinez"));
    const jorgeKey = Object.keys(initialsMap).find(name => name.startsWith("Jorge Maga"));

    if (joelKey) {
        initialsMap[joelKey] = computeInitials(joelKey);
    }
    if (jorgeKey && computeInitials(jorgeKey) === initialsMap[joelKey ?? ""]) {
        const lastLetter = jorgeKey.replace(/[^A-Za-z]/g, "").slice(-1)
            || initialsMap[jorgeKey].slice(-1)
            || "N";
        initialsMap[jorgeKey] = `${initialsMap[jorgeKey][0]}${lastLetter.toUpperCase()}`;
    }
}

function resolveInitials(name: string, map: Record<string, string>): string {
    const trimmed = name?.trim() ?? "";
    if (!trimmed) {
        return "";
    }
    return map[trimmed] ?? computeInitials(trimmed);
}

