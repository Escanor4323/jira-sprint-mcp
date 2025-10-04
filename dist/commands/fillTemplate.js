"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillTemplateWithEpicTasks = fillTemplateWithEpicTasks;
const readline_1 = __importDefault(require("readline"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const exceljs_1 = __importDefault(require("exceljs"));
const api_1 = require("../api");
const sprintTemplateWriter_1 = require("../services/sprintTemplateWriter");
const initials_1 = require("../utils/initials");
const gptClient_1 = require("../utils/gptClient");
const TEMPLATE_RELATIVE_PATH = "src/templates/M1_GA1_Sprint_Schedule_Temp CS 4310.xlsx";
const TEMPLATE_PATH = path_1.default.resolve(process.cwd(), TEMPLATE_RELATIVE_PATH);
const DEFAULT_OUTPUT_DIRECTORY = path_1.default.resolve(process.cwd(), "outputs");
const DEFAULT_FILE_PREFIX = "epic";
const YES_RESPONSES = new Set(["y", "yes"]);
const MEMBER_START_ROW = 4;
const PERFORMANCE_COLUMN = "B";
const PERFORMANCE_START_ROW = 55;
const PLAN_INITIAL_HEADER_COLUMNS = ["G", "H", "I", "J", "K", "L", "M", "N", "O"];
const ACTUAL_INITIAL_HEADER_COLUMNS = ["P", "Q", "R", "S", "T", "U", "V", "W", "X"];
const TEAM_ROSTER = [
    { name: "Joel Martinez", role: "Team Leader (TL)" },
    { name: "Jorge Magaña", role: "Planning Manager (PM)" },
    { name: "Epifanio Sarinana", role: "Quality Manager (QM)" },
    { name: "Isaac Zarate", role: "Support Manager (SM)" },
    { name: "Caitlin Gregory", role: "Customer Interface Manager (CIM)" },
    { name: "Ugyen Dorji", role: "Behavior Manager (BM)" },
    { name: "Damien Pimentel", role: "Data-Flow & Business Manager (DBM)" },
    { name: "Dylan Andrade", role: "Analyst Manager (AM)" }
];
async function fillTemplateWithEpicTasks(epicKey, options = {}) {
    if (!epicKey) {
        throw new Error("Epic key is required");
    }
    const destinationPath = resolveDestinationPath(epicKey, options.outputPath);
    ensureDirectory(path_1.default.dirname(destinationPath));
    if (!fs_1.default.existsSync(TEMPLATE_PATH)) {
        throw new Error(`Template not found at ${TEMPLATE_PATH}`);
    }
    if (fs_1.default.existsSync(destinationPath)) {
        const confirmed = options.forceOverwrite ? true : await confirmOverwrite(destinationPath);
        if (!confirmed) {
            console.log("Operation cancelled. Existing file left untouched.");
            return {
                epic: epicKey,
                file: destinationPath,
                cancelled: true
            };
        }
    }
    else {
        console.log(`Creating new sprint schedule at ${destinationPath}`);
    }
    fs_1.default.copyFileSync(TEMPLATE_PATH, destinationPath);
    const maxTasks = options.maxTasks ?? 50;
    const searchResult = await (0, api_1.getEpicTasks)(epicKey, {
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
    const workbook = new exceljs_1.default.Workbook();
    await workbook.xlsx.readFile(destinationPath);
    const worksheet = workbook.worksheets[0];
    populateInitialHeaderRow(worksheet, initialsMap);
    const resolveInitialsFn = (name) => resolveInitials(name, initialsMap);
    const mappedTasks = jiraTasks.map(issue => (0, sprintTemplateWriter_1.mapIssueToSprintTask)(issue, resolveInitialsFn));
    const comments = await fetchCommentsForTasks(mappedTasks);
    (0, sprintTemplateWriter_1.populateSprintScheduleWorksheet)(worksheet, mappedTasks, comments, resolveInitialsFn);
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
async function fetchCommentsForTasks(tasks) {
    const comments = [];
    for (const task of tasks) {
        if (!task.key) {
            continue;
        }
        const commentData = await (0, api_1.getIssueComments)(task.key);
        const taskComments = (commentData?.comments ?? []).map((comment) => ({
            taskKey: task.key,
            text: extractCommentText(comment)
        }));
        comments.push(...taskComments);
    }
    return comments;
}
async function buildWorkSummary(tasks, comments) {
    const systemPrompt = (0, gptClient_1.buildTeamLeadSystemPrompt)();
    const userPrompt = createSummaryPrompt(tasks, comments);
    const response = await gptClient_1.gptClient.complete({
        systemPrompt,
        userPrompt,
        temperature: 0.4,
        maxTokens: 600
    });
    return parseWorkSummary(response);
}
async function buildMemberPerformance(tasks, comments) {
    const systemPrompt = (0, gptClient_1.buildPerformanceSystemPrompt)();
    const userPrompt = createPerformancePrompt(tasks, comments);
    const response = await gptClient_1.gptClient.complete({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 300
    });
    return parsePerformanceResponse(response, tasks);
}
function buildFallbackWorkSummary(tasks) {
    const tasksLabel = tasks.length === 1 ? "task" : "tasks";
    const planTotals = aggregateHours(tasks, task => task.plan.seconds);
    const actualTotals = aggregateHours(tasks, task => task.actual.seconds);
    const summarizeTotals = (totals) => totals.length === 0
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
function buildFallbackPerformance() {
    return TEAM_ROSTER.map(member => ({
        name: member.name,
        score: 92,
        rationale: "GPT disabled; score set manually."
    }));
}
function createPerformancePrompt(tasks, comments) {
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
function buildMemberSnapshots(tasks, comments) {
    const snapshotMap = new Map();
    const ensureSnapshot = (name) => {
        const existing = snapshotMap.get(name);
        if (existing) {
            return existing;
        }
        const rosterEntry = TEAM_ROSTER.find(member => member.name === name);
        const snapshot = {
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
function aggregateCommentsByAssignee(tasks, comments) {
    const keyToAssignee = new Map();
    tasks.forEach(task => {
        keyToAssignee.set(task.key, task.assigneeDisplayName || "Unassigned");
    });
    const commentMap = new Map();
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
function secondsToHours(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return 0;
    }
    const hours = seconds / 3600;
    return Math.round(hours * 100) / 100;
}
function parsePerformanceResponse(raw, tasks) {
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
    }
    catch (error) {
        console.warn("Failed to parse GPT performance response", error);
        return buildFallbackPerformance();
    }
}
function clampScore(value) {
    const score = typeof value === "number" ? value : 92;
    if (!Number.isFinite(score)) {
        return 92;
    }
    const rounded = Math.round(score);
    return Math.min(100, Math.max(60, rounded));
}
function extractCommentText(comment) {
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
function flattenAtlassianDocument(content) {
    const parts = [];
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
function populateTeamRoster(worksheet, initialsMap) {
    TEAM_ROSTER.forEach((member, index) => {
        const row = MEMBER_START_ROW + index;
        const initials = resolveInitials(member.name, initialsMap);
        worksheet.getCell(`A${row}`).value = member.name;
        worksheet.getCell(`C${row}`).value = initials;
        worksheet.getCell(`D${row}`).value = member.role;
    });
}
function populateInitialHeaderRow(worksheet, initialsMap) {
    const initials = TEAM_ROSTER.map(member => resolveInitials(member.name, initialsMap));
    PLAN_INITIAL_HEADER_COLUMNS.forEach((column, index) => {
        worksheet.getCell(`${column}17`).value = initials[index] ?? null;
    });
    ACTUAL_INITIAL_HEADER_COLUMNS.forEach((column, index) => {
        worksheet.getCell(`${column}17`).value = initials[index] ?? null;
    });
}
function populatePerformanceSection(worksheet, performance) {
    const normalized = mergePerformanceWithRoster(performance);
    normalized.forEach((entry, index) => {
        const row = PERFORMANCE_START_ROW + index;
        const cell = worksheet.getCell(`${PERFORMANCE_COLUMN}${row}`);
        cell.value = formatPerformanceCell(entry);
    });
}
function mergePerformanceWithRoster(performance) {
    const byName = new Map(performance.map(entry => [entry.name.trim(), entry]));
    return TEAM_ROSTER.map(member => {
        const matched = byName.get(member.name) ?? byName.get(member.name.trim());
        return matched ?? {
            name: member.name,
            score: 90,
            rationale: "No performance data; defaulting to 90."
        };
    });
}
function formatPerformanceCell(performance) {
    const clampedScore = clampScore(performance.score);
    const rationale = performance.rationale.trim() || "No rationale provided.";
    return `${performance.name}: ${clampedScore}/100 - ${rationale}`;
}
function buildAssignmentRecords(tasks) {
    return tasks.map(task => ({
        key: task.key,
        summary: task.summary,
        assignee: task.assigneeDisplayName || null,
        initials: task.initials || null,
        originalEstimateSeconds: typeof task.plan.seconds === "number" ? task.plan.seconds : null,
        timeSpentSeconds: typeof task.actual.seconds === "number" ? task.actual.seconds : null
    }));
}
function createSummaryPrompt(tasks, comments) {
    const planTotals = aggregateHours(tasks, task => task.plan.seconds);
    const actualTotals = aggregateHours(tasks, task => task.actual.seconds);
    const lines = [
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
function aggregateHours(tasks, selector) {
    const totals = new Map();
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
function formatSeconds(seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
        return "n/a";
    }
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}
function parseWorkSummary(raw) {
    const sections = {
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
function extractSection(text, regex) {
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
async function populateSummarySection(worksheet, summary) {
    const safeValue = (value) => value && value.trim().length > 0 ? value.trim() : "No updates provided.";
    worksheet.getCell("B43").value = safeValue(summary.balancedDistribution);
    worksheet.getCell("B44").value = safeValue(summary.timelinessAnalysis);
    worksheet.getCell("B45").value = safeValue(summary.dueDateAnalysis);
    worksheet.getCell("B46").value = safeValue(summary.dueDateStrategy);
    worksheet.getCell("B47").value = safeValue(summary.reworkNarrative);
}
function resolveDestinationPath(epicKey, requestedOutputPath) {
    if (requestedOutputPath) {
        return path_1.default.isAbsolute(requestedOutputPath)
            ? requestedOutputPath
            : path_1.default.resolve(process.cwd(), requestedOutputPath);
    }
    const fileName = `${DEFAULT_FILE_PREFIX}-${epicKey}-filled.xlsx`;
    return path_1.default.join(DEFAULT_OUTPUT_DIRECTORY, fileName);
}
function ensureDirectory(directoryPath) {
    if (!fs_1.default.existsSync(directoryPath)) {
        fs_1.default.mkdirSync(directoryPath, { recursive: true });
    }
}
async function confirmOverwrite(filePath) {
    console.log(`File already exists at ${filePath}.`);
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.warn("No interactive TTY available. Aborting to avoid overwriting the existing file.");
        return false;
    }
    const rl = readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    const question = (query) => new Promise(resolve => rl.question(query, resolve));
    const answer = (await question("Overwrite this file? (Y/N): ")).trim().toLowerCase();
    rl.close();
    return YES_RESPONSES.has(answer);
}
function buildInitialsMap(jiraIssues) {
    const names = new Set();
    TEAM_ROSTER.forEach(member => names.add(member.name));
    jiraIssues.forEach(issue => {
        const name = String(issue?.fields?.assignee?.displayName ?? "").trim();
        if (name) {
            names.add(name);
        }
    });
    const map = {};
    for (const name of names) {
        map[name] = (0, initials_1.computeInitials)(name);
    }
    tweakInitialsForKnownConflicts(map);
    return map;
}
function tweakInitialsForKnownConflicts(initialsMap) {
    const joelKey = Object.keys(initialsMap).find(name => name.startsWith("Joel Martinez"));
    const jorgeKey = Object.keys(initialsMap).find(name => name.startsWith("Jorge Maga"));
    if (joelKey) {
        initialsMap[joelKey] = (0, initials_1.computeInitials)(joelKey);
    }
    if (jorgeKey && (0, initials_1.computeInitials)(jorgeKey) === initialsMap[joelKey ?? ""]) {
        const lastLetter = jorgeKey.replace(/[^A-Za-z]/g, "").slice(-1)
            || initialsMap[jorgeKey].slice(-1)
            || "N";
        initialsMap[jorgeKey] = `${initialsMap[jorgeKey][0]}${lastLetter.toUpperCase()}`;
    }
}
function resolveInitials(name, map) {
    const trimmed = name?.trim() ?? "";
    if (!trimmed) {
        return "";
    }
    return map[trimmed] ?? (0, initials_1.computeInitials)(trimmed);
}
