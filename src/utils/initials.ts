const removeDiacritics = (value: string): string => value.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const stripNonAlpha = (value: string): string => value.replace(/[^A-Za-z]/g, "");

const sanitizeSegmentForInitials = (segment: string): string => {
    const withoutMarks = removeDiacritics(segment);
    const letters = stripNonAlpha(withoutMarks);
    if (letters.length > 0) {
        return letters;
    }
    const lettersFromOriginal = stripNonAlpha(segment);
    return lettersFromOriginal.length > 0 ? lettersFromOriginal : segment;
};

const chooseMeaningfulLastSegment = (segments: string[]): string => {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        const sanitized = sanitizeSegmentForInitials(segments[index]);
        if (sanitized.length > 1) {
            return sanitized;
        }
    }
    const fallback = sanitizeSegmentForInitials(segments[segments.length - 1]);
    return fallback || segments[segments.length - 1] || "";
};

export function computeInitials(fullName: string): string {
    const trimmed = (fullName ?? "").trim();
    if (!trimmed) {
        return "";
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (!parts.length) {
        return "";
    }

    const firstSanitized = sanitizeSegmentForInitials(parts[0]);
    const lastSanitized = chooseMeaningfulLastSegment(parts);

    const firstInitialSource = firstSanitized || parts[0];
    const lastInitialSource = lastSanitized || parts[parts.length - 1];

    const firstInitial = firstInitialSource.charAt(0) || "";
    const lastInitial = lastInitialSource ? lastInitialSource.charAt(lastInitialSource.length - 1) : "";

    return `${firstInitial}${lastInitial}`.toUpperCase();
}


