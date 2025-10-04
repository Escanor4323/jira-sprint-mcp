"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapIssueToSprintTask = mapIssueToSprintTask;
exports.populateSprintScheduleWorksheet = populateSprintScheduleWorksheet;
exports.toDurationValue = toDurationValue;
exports.toScheduleValue = toScheduleValue;
const initials_1 = require("../utils/initials");
const SECONDS_IN_DAY = 86400;
const SECONDS_IN_HOUR = 3600;
const HOURS_NUMBER_FORMAT = "0.00";
const ASSIGNEE_SECTION_START_ROW = 4;
const ASSIGNEE_COLUMN = "A";
const ASSIGNEE_INITIAL_COLUMN = "C";
const ASSIGNEE_ROLE_COLUMN = "D";
const ASSIGNEE_PLAN_COLUMN = "E";
const ASSIGNEE_ACTUAL_COLUMN = "F";
const ASSIGNEE_SECTION_CLEAR_SIZE = 20;
const ASSIGNEE_SECTION_END_ROW = 15;
const TEAM_ROLE_MAP = {
    "Joel Martinez": "Team Leader (TL)",
    "Joel Martinez A": "Team Leader (TL)",
    "Joel Martinez A.": "Team Leader (TL)",
    "Jorge Magana": "Planning Manager (PM)",
    "Jorge Magaña": "Planning Manager (PM)",
    "Epifanio Sarinana": "Quality Manager (QM)",
    "Isaac A Zarate": "Support Manager (SM)",
    "Isaac Zarate": "Support Manager (SM)",
    "Caitlin Gregory": "Customer Interface Manager (CIM)",
    "Ugyen Dorji": "Behavior Manager (BM)",
    "Damien Pimentel": "Data-Flow & Business Manager (DBM)",
    "Dylan Andrade": "Analyst Manager (AM)"
};
const TASK_SECTION_START_ROW = 18;
const TASK_SECTION_END_ROW = 37;
const TASK_COLUMN_SUMMARY = "A";
const TIME_PLAN_COLUMN = "B";
const TIME_ACTUAL_COLUMN = "C";
const DEADLINE_PLAN_COLUMN = "D";
const DEADLINE_ACTUAL_COLUMN = "E";
const SLIP_COLUMN = "F";
const PLAN_INITIAL_START_COLUMN = "G";
const PLAN_INITIAL_END_COLUMN = "O";
const ACTUAL_INITIAL_START_COLUMN = "P";
const ACTUAL_INITIAL_END_COLUMN = "X";
const INITIAL_HEADER_ROW = 17;
const TASK_HEADER_ROWS_TO_PRESERVE = [14, 15, 16];
const TASK_HEADER_COLUMNS_TO_PRESERVE = ["A", "B", "C", "D", "E", "F"];
const COMMENT_SECTION_START_ROW = 49;
const COMMENT_COLUMN = "B";
const COMMENT_SECTION_CLEAR_SIZE = 50;
const initialColumnMap = new Map();
const formatHoursMinutes = (seconds) => {
    const totalMinutes = Math.max(0, Math.round(seconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
};
function mapIssueToSprintTask(issue, resolveInitials) {
    const fields = issue?.fields ?? {};
    const assignee = fields.assignee ?? {};
    const timetracking = fields.timetracking ?? {};
    const aggregatedSeconds = normalizeAggregatedSeconds(fields);
    const scheduleSlipSeconds = computeScheduleSlip(timetracking, aggregatedSeconds);
    const displayName = String(assignee.displayName ?? "").trim();
    const initials = resolveInitials ? resolveInitials(displayName) : (0, initials_1.computeInitials)(displayName);
    return {
        id: issue?.id ?? "",
        key: issue?.key ?? issue?.id ?? "",
        summary: normalizeSummary(fields.summary, issue?.key),
        assigneeDisplayName: displayName,
        plan: toDurationValue(timetracking.originalEstimateSeconds, timetracking.originalEstimate),
        actual: toDurationValue(timetracking.timeSpentSeconds, timetracking.timeSpent),
        deadlinePlan: toScheduleValue(fields.duedate),
        deadlineActual: toScheduleValue(fields.customfield_10015 ?? fields.startDate ?? null),
        aggregated: scheduleSlipSeconds !== undefined
            ? toDurationValue(scheduleSlipSeconds, undefined)
            : toDurationValue(undefined, undefined),
        initials
    };
}
function computeScheduleSlip(timetracking, aggregatedSeconds) {
    const originalEstimate = typeof timetracking?.originalEstimateSeconds === "number"
        ? timetracking.originalEstimateSeconds
        : undefined;
    const timeSpent = typeof timetracking?.timeSpentSeconds === "number"
        ? timetracking.timeSpentSeconds
        : (typeof aggregatedSeconds === "number" ? aggregatedSeconds : undefined);
    if (originalEstimate === undefined || timeSpent === undefined) {
        return undefined;
    }
    const delta = timeSpent - originalEstimate;
    return delta > 0 ? delta : undefined;
}
function normalizeAggregatedSeconds(fields) {
    if (typeof fields?.aggregatetimespent !== "number") {
        return undefined;
    }
    const timetracking = fields?.timetracking ?? {};
    const ownTimeSpent = typeof timetracking?.timeSpentSeconds === "number"
        ? timetracking.timeSpentSeconds
        : typeof fields?.timespent === "number"
            ? fields.timespent
            : undefined;
    if (ownTimeSpent !== undefined && fields.aggregatetimespent <= ownTimeSpent) {
        return undefined;
    }
    return fields.aggregatetimespent;
}
function populateSprintScheduleWorksheet(sheet, tasks, comments, resolveInitials) {
    const enrichedTasks = resolveInitials
        ? tasks.map(task => ({ ...task, initials: resolveInitials(task.assigneeDisplayName) }))
        : tasks;
    const assigneeTotals = calculateAssigneeTotals(enrichedTasks);
    writeAssigneeSection(sheet, enrichedTasks, assigneeTotals);
    hydrateInitialColumnMap(sheet);
    writeTasksSection(sheet, enrichedTasks);
    writeCommentsSection(sheet, comments);
}
function writeTasksSection(sheet, tasks) {
    restoreTaskHeaders(sheet);
    const totalRows = TASK_SECTION_END_ROW - TASK_SECTION_START_ROW + 1;
    for (let offset = 0; offset < totalRows; offset++) {
        const rowIndex = TASK_SECTION_START_ROW + offset;
        const summaryAddress = `${TASK_COLUMN_SUMMARY}${rowIndex}`;
        const planAddress = `${TIME_PLAN_COLUMN}${rowIndex}`;
        const actualAddress = `${TIME_ACTUAL_COLUMN}${rowIndex}`;
        const deadlinePlanAddress = `${DEADLINE_PLAN_COLUMN}${rowIndex}`;
        const deadlineActualAddress = `${DEADLINE_ACTUAL_COLUMN}${rowIndex}`;
        const slipAddress = `${SLIP_COLUMN}${rowIndex}`;
        const task = tasks[offset];
        if (task) {
            const summaryValue = formatTaskSummary(task);
            setCellValue(sheet, summaryAddress, summaryValue);
            const planHours = writeTimeCell(sheet, planAddress, task.plan);
            const actualHours = writeTimeCell(sheet, actualAddress, task.actual);
            writeScheduleDateCell(sheet, deadlinePlanAddress, task.deadlinePlan);
            writeScheduleDateCell(sheet, deadlineActualAddress, task.deadlineActual);
            writeScheduleSlipCell(sheet, slipAddress, task.aggregated);
            writeTaskInitialHours(sheet, rowIndex, task.initials, planHours, true);
            writeTaskInitialHours(sheet, rowIndex, task.initials, actualHours, false);
        }
        else {
            clearCellValue(sheet, summaryAddress);
            clearCellValue(sheet, planAddress);
            clearCellValue(sheet, actualAddress);
            clearCellValue(sheet, deadlinePlanAddress);
            clearCellValue(sheet, deadlineActualAddress);
            clearCellValue(sheet, slipAddress);
            clearInitialHourCells(sheet, rowIndex, true);
            clearInitialHourCells(sheet, rowIndex, false);
        }
    }
}
function restoreTaskHeaders(sheet) {
    const templateHeaders = {
        A14: "Week ##",
        A15: "Week ##",
        A16: "Week ##",
        B15: "Work Time (hours: mins)",
        C15: "Work Time (hours: mins)",
        B16: "Plan",
        C16: "Actual",
        D15: "Deadline (mm/dd/yyyy)",
        E15: "Deadline (mm/dd/yyyy)",
        F15: "Deadline (mm/dd/yyyy)",
        D16: "Plan",
        E16: "Actual",
        F16: "Schedule Slip"
    };
    TASK_HEADER_ROWS_TO_PRESERVE.forEach((row) => {
        TASK_HEADER_COLUMNS_TO_PRESERVE.forEach((column) => {
            const address = `${column}${row}`;
            const templateValue = templateHeaders[address];
            if (templateValue !== undefined) {
                const cell = sheet.getCell(address);
                if (cell.value === null || cell.value === undefined || cell.value === "") {
                    cell.value = templateValue;
                }
            }
        });
    });
}
function writeCommentsSection(sheet, comments) {
    const rowsToProcess = Math.max(COMMENT_SECTION_CLEAR_SIZE, comments.length);
    for (let offset = 0; offset < rowsToProcess; offset++) {
        const rowIndex = COMMENT_SECTION_START_ROW + offset;
        const address = `${COMMENT_COLUMN}${rowIndex}`;
        const comment = comments[offset];
        if (comment) {
            const value = formatComment(comment);
            setCellValue(sheet, address, value);
        }
        else {
            clearCellValue(sheet, address);
        }
    }
}
function writeAssigneeSection(sheet, tasks, totals) {
    const maxRows = Math.min(ASSIGNEE_SECTION_END_ROW, ASSIGNEE_SECTION_START_ROW + ASSIGNEE_SECTION_CLEAR_SIZE - 1);
    let rowIndex = ASSIGNEE_SECTION_START_ROW;
    const seen = new Set();
    for (const task of tasks) {
        if (rowIndex > maxRows) {
            break;
        }
        const displayName = task?.assigneeDisplayName?.trim();
        if (!displayName || seen.has(displayName)) {
            continue;
        }
        seen.add(displayName);
        const nameAddress = `${ASSIGNEE_COLUMN}${rowIndex}`;
        const initials = toInitials(displayName);
        const mapping = initialColumnMap.get(initials);
        if (!mapping) {
            continue;
        }
        const initialsAddress = `${ASSIGNEE_INITIAL_COLUMN}${rowIndex}`;
        const roleAddress = `${ASSIGNEE_ROLE_COLUMN}${rowIndex}`;
        const planAddress = `${ASSIGNEE_PLAN_COLUMN}${rowIndex}`;
        const actualAddress = `${ASSIGNEE_ACTUAL_COLUMN}${rowIndex}`;
        const role = resolveRole(displayName);
        const totalsEntry = totals.get(displayName) ?? { plan: 0, actual: 0 };
        setCellValue(sheet, nameAddress, displayName);
        setCellValue(sheet, initialsAddress, initials);
        setCellValue(sheet, roleAddress, role ?? null);
        setNumericCell(sheet, planAddress, roundTo(totalsEntry.plan, 2), HOURS_NUMBER_FORMAT);
        setNumericCell(sheet, actualAddress, roundTo(totalsEntry.actual, 2), HOURS_NUMBER_FORMAT);
        rowIndex += 1;
    }
    for (; rowIndex <= maxRows; rowIndex++) {
        const nameAddress = `${ASSIGNEE_COLUMN}${rowIndex}`;
        const initialsAddress = `${ASSIGNEE_INITIAL_COLUMN}${rowIndex}`;
        const roleAddress = `${ASSIGNEE_ROLE_COLUMN}${rowIndex}`;
        const planAddress = `${ASSIGNEE_PLAN_COLUMN}${rowIndex}`;
        const actualAddress = `${ASSIGNEE_ACTUAL_COLUMN}${rowIndex}`;
        clearCellValue(sheet, nameAddress);
        clearCellValue(sheet, initialsAddress);
        clearCellValue(sheet, roleAddress);
        clearCellValue(sheet, planAddress);
        clearCellValue(sheet, actualAddress);
    }
}
function formatTaskSummary(task) {
    const trimmedSummary = task.summary.trim();
    if (!trimmedSummary) {
        return task.key;
    }
    return `${task.key} - ${trimmedSummary}`;
}
function formatComment(comment) {
    const trimmedText = comment.text.trim();
    if (!trimmedText) {
        return comment.taskKey;
    }
    return `[${comment.taskKey}] ${trimmedText}`;
}
function toInitials(displayName) {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
        return "";
    }
    if (!/\s/.test(trimmedName)) {
        const lettersOnly = trimmedName.replace(/[^A-Za-z]/g, "");
        if (lettersOnly.length > 0 && lettersOnly.length <= 3) {
            return lettersOnly.toUpperCase();
        }
    }
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    if (!parts.length) {
        return "";
    }
    const firstInitial = initialFromSegment(parts[0]);
    const lastInitial = initialFromSegment(parts.length > 1 ? parts[parts.length - 1] : parts[0]);
    return `${firstInitial}${lastInitial}`.toUpperCase();
}
function initialFromSegment(segment) {
    const alpha = segment.replace(/[^A-Za-z]/g, "");
    const source = alpha.length ? alpha : segment;
    return source.charAt(0) ?? "";
}
function resolveRole(displayName) {
    const normalized = displayName.trim();
    if (TEAM_ROLE_MAP[normalized]) {
        return TEAM_ROLE_MAP[normalized];
    }
    const withoutDiacritics = normalized.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    if (TEAM_ROLE_MAP[withoutDiacritics]) {
        return TEAM_ROLE_MAP[withoutDiacritics];
    }
    const withoutPeriods = withoutDiacritics.replace(/\./g, "");
    if (TEAM_ROLE_MAP[withoutPeriods]) {
        return TEAM_ROLE_MAP[withoutPeriods];
    }
    const parts = withoutPeriods.split(/\s+/);
    if (parts.length >= 2) {
        const key = `${parts[0]} ${parts[parts.length - 1]}`;
        if (TEAM_ROLE_MAP[key]) {
            return TEAM_ROLE_MAP[key];
        }
    }
    return null;
}
function writeTimeCell(sheet, address, value, zeroIfEmpty = false) {
    const seconds = resolveSecondsValue(value);
    if (seconds !== undefined) {
        const hours = seconds / SECONDS_IN_HOUR;
        const rounded = roundTo(hours, 2);
        setNumericCell(sheet, address, rounded, HOURS_NUMBER_FORMAT);
        return rounded;
    }
    const text = value.text?.trim();
    if (text && text.length > 0) {
        const parsedSeconds = parseDurationToSeconds(text);
        if (parsedSeconds !== undefined) {
            const hours = parsedSeconds / SECONDS_IN_HOUR;
            const rounded = roundTo(hours, 2);
            setNumericCell(sheet, address, rounded, HOURS_NUMBER_FORMAT);
            return rounded;
        }
        setCellValue(sheet, address, text);
        return undefined;
    }
    if (zeroIfEmpty) {
        setNumericCell(sheet, address, 0, HOURS_NUMBER_FORMAT);
        return 0;
    }
    clearCellValue(sheet, address);
    return undefined;
}
function writeScheduleDateCell(sheet, address, value) {
    const dateText = value.date ? formatScheduleDate(value.date) : undefined;
    const hoursText = typeof value.hours === "number" && Number.isFinite(value.hours)
        ? `${roundTo(value.hours, 2)}h`
        : undefined;
    const explicitText = value.text?.trim();
    const parts = [explicitText ?? dateText, hoursText].filter(Boolean);
    if (parts.length) {
        setCellValue(sheet, address, parts.join(" ").trim());
        return;
    }
    clearCellValue(sheet, address);
}
function writeScheduleSlipCell(sheet, address, value) {
    const explicitText = value.text?.trim();
    if (explicitText) {
        setCellValue(sheet, address, explicitText);
        return;
    }
    const seconds = resolveSecondsValue(value);
    if (seconds !== undefined) {
        const hours = seconds / SECONDS_IN_HOUR;
        const rounded = roundTo(hours, 2);
        setNumericCell(sheet, address, rounded, HOURS_NUMBER_FORMAT);
        return;
    }
    setNumericCell(sheet, address, 0, HOURS_NUMBER_FORMAT);
}
function hydrateInitialColumnMap(sheet) {
    initialColumnMap.clear();
    const planColumns = enumerateColumns(PLAN_INITIAL_START_COLUMN, PLAN_INITIAL_END_COLUMN);
    const actualColumns = enumerateColumns(ACTUAL_INITIAL_START_COLUMN, ACTUAL_INITIAL_END_COLUMN);
    const resolvedInitials = (column) => resolveInitialsFromCell(sheet, `${column}${INITIAL_HEADER_ROW}`);
    planColumns.forEach((column, index) => {
        const planInitials = resolvedInitials(column);
        const actualColumn = actualColumns[index];
        const actualInitials = resolvedInitials(actualColumn);
        if (planInitials) {
            const entry = initialColumnMap.get(planInitials) ?? {};
            entry.plan = column;
            entry.actual = entry.actual ?? actualColumn;
            initialColumnMap.set(planInitials, entry);
        }
        if (actualInitials) {
            const entry = initialColumnMap.get(actualInitials) ?? {};
            entry.actual = actualColumn;
            entry.plan = entry.plan ?? column;
            initialColumnMap.set(actualInitials, entry);
        }
    });
}
function resolveInitialsFromCell(sheet, address) {
    const cell = sheet.getCell(address);
    const { value } = cell;
    if (typeof value === "string") {
        return sanitizeInitialString(value);
    }
    if (typeof value === "object" && value !== null) {
        if ("result" in value && typeof value.result === "string") {
            const initials = sanitizeInitialString(value.result);
            if (initials) {
                return initials;
            }
        }
        if ("formula" in value && typeof value.formula === "string") {
            const referencedCell = sheet.getCell(value.formula);
            const referencedValue = referencedCell?.value;
            if (typeof referencedValue === "string") {
                const initials = sanitizeInitialString(referencedValue);
                if (initials) {
                    return initials;
                }
            }
        }
    }
    return undefined;
}
function sanitizeInitialString(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
        return undefined;
    }
    const letters = trimmed.replace(/[^A-Za-z]/g, "");
    if (!letters) {
        return undefined;
    }
    return letters.toUpperCase();
}
function writeTaskInitialHours(sheet, rowIndex, assigneeInitials, hours, isPlan) {
    const columns = isPlan
        ? enumerateColumns(PLAN_INITIAL_START_COLUMN, PLAN_INITIAL_END_COLUMN)
        : enumerateColumns(ACTUAL_INITIAL_START_COLUMN, ACTUAL_INITIAL_END_COLUMN);
    columns.forEach((column) => clearCellValue(sheet, `${column}${rowIndex}`));
    if (!assigneeInitials) {
        return;
    }
    const normalizedInitials = sanitizeInitialString(assigneeInitials) ?? toInitials(assigneeInitials);
    const mapping = initialColumnMap.get(normalizedInitials);
    const targetColumn = mapping ? (isPlan ? mapping.plan : mapping.actual) : undefined;
    if (!targetColumn || hours === undefined || Number.isNaN(hours)) {
        return;
    }
    const address = `${targetColumn}${rowIndex}`;
    const seconds = hours * SECONDS_IN_HOUR;
    setCellValue(sheet, address, formatHoursMinutes(seconds));
}
function clearInitialHourCells(sheet, rowIndex, isPlan) {
    const columns = isPlan
        ? enumerateColumns(PLAN_INITIAL_START_COLUMN, PLAN_INITIAL_END_COLUMN)
        : enumerateColumns(ACTUAL_INITIAL_START_COLUMN, ACTUAL_INITIAL_END_COLUMN);
    columns.forEach((column) => clearCellValue(sheet, `${column}${rowIndex}`));
}
function enumerateColumns(startColumn, endColumn) {
    const columns = [];
    for (let col = columnToNumber(startColumn); col <= columnToNumber(endColumn); col++) {
        columns.push(numberToColumn(col));
    }
    return columns;
}
function columnToNumber(column) {
    let result = 0;
    for (let i = 0; i < column.length; i++) {
        result = result * 26 + (column.charCodeAt(i) - 64);
    }
    return result;
}
function numberToColumn(num) {
    let column = "";
    while (num > 0) {
        const remainder = (num - 1) % 26;
        column = String.fromCharCode(65 + remainder) + column;
        num = Math.floor((num - 1) / 26);
    }
    return column;
}
function setCellValue(sheet, address, value) {
    const cell = sheet.getCell(address);
    cell.value = value === undefined ? null : value;
}
function setNumericCell(sheet, address, value, numberFormat) {
    const cell = sheet.getCell(address);
    cell.value = value;
    if (numberFormat) {
        cell.numFmt = numberFormat;
    }
}
function clearCellValue(sheet, address) {
    const cell = sheet.getCell(address);
    cell.value = null;
}
function resolveSecondsValue(value) {
    if (typeof value.seconds === "number" && Number.isFinite(value.seconds)) {
        return value.seconds;
    }
    if (value.text) {
        return parseDurationToSeconds(value.text);
    }
    return undefined;
}
function parseDurationToSeconds(input) {
    const normalized = input.trim();
    if (!normalized) {
        return undefined;
    }
    const regex = /(\d+(?:\.\d+)?)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)/gi;
    let match;
    let totalSeconds = 0;
    let found = false;
    while ((match = regex.exec(normalized)) !== null) {
        const value = Number(match[1]);
        const unit = match[2].toLowerCase();
        if (!Number.isFinite(value)) {
            continue;
        }
        found = true;
        if (unit.startsWith("d")) {
            totalSeconds += value * 24 * SECONDS_IN_HOUR;
        }
        else if (unit.startsWith("h")) {
            totalSeconds += value * SECONDS_IN_HOUR;
        }
        else if (unit.startsWith("m")) {
            totalSeconds += value * 60;
        }
        else if (unit.startsWith("s")) {
            totalSeconds += value;
        }
    }
    return found ? totalSeconds : undefined;
}
function roundTo(value, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}
function formatScheduleDate(raw) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        return raw;
    }
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function calculateAssigneeTotals(tasks) {
    const totals = new Map();
    tasks.forEach(task => {
        const displayName = task.assigneeDisplayName?.trim();
        if (!displayName) {
            return;
        }
        const planHours = getHoursFromTimeCell(task.plan) ?? 0;
        const actualHours = getHoursFromTimeCell(task.actual) ?? 0;
        const entry = totals.get(displayName) ?? { plan: 0, actual: 0 };
        entry.plan += planHours;
        entry.actual += actualHours;
        totals.set(displayName, entry);
    });
    return totals;
}
function getHoursFromTimeCell(value) {
    const seconds = resolveSecondsValue(value);
    if (seconds !== undefined) {
        return seconds / SECONDS_IN_HOUR;
    }
    const text = value.text?.trim();
    if (text) {
        const parsedSeconds = parseDurationToSeconds(text);
        if (parsedSeconds !== undefined) {
            return parsedSeconds / SECONDS_IN_HOUR;
        }
    }
    return undefined;
}
function normalizeSummary(summary, fallbackKey) {
    if (typeof summary === "string" && summary.trim().length > 0) {
        return summary.trim();
    }
    return fallbackKey ?? "";
}
function toDurationValue(seconds, text) {
    return {
        seconds: typeof seconds === "number" ? seconds : undefined,
        text: typeof text === "string" ? text : undefined
    };
}
function toScheduleValue(date) {
    return {
        date: typeof date === "string" ? date : undefined
    };
}
function writeTaskAssignmentMatrix(sheet, tasks) {
    tasks.forEach((task, index) => {
        const rowIndex = TASK_SECTION_START_ROW + index;
        const planHours = getHoursFromTimeCell(task.plan);
        const actualHours = getHoursFromTimeCell(task.actual);
        const planAddress = resolveInitialAddress(task.initials, true, rowIndex);
        if (planHours !== undefined && planAddress) {
            const seconds = planHours * SECONDS_IN_HOUR;
            setCellValue(sheet, planAddress, formatHoursMinutes(seconds));
        }
        const actualAddress = resolveInitialAddress(task.initials, false, rowIndex);
        if (actualHours !== undefined && actualAddress) {
            const seconds = actualHours * SECONDS_IN_HOUR;
            setCellValue(sheet, actualAddress, formatHoursMinutes(seconds));
        }
    });
}
function resolveInitialAddress(initials, isPlan, rowIndex) {
    const mapping = initialColumnMap.get(initials);
    const column = mapping ? (isPlan ? mapping.plan : mapping.actual) : undefined;
    return column ? `${column}${rowIndex}` : undefined;
}
