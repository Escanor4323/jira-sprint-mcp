"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveJson = saveJson;
const fs_1 = require("fs");
const path_1 = require("path");
function saveJson(path, data) {
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
    (0, fs_1.writeFileSync)(path, JSON.stringify(data, null, 2), "utf8");
}
