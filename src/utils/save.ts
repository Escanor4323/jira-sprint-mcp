import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export function saveJson(path: string, data: unknown) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}
