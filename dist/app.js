"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const jiraRoutes_1 = require("./routes/jiraRoutes");
const webhookRoutes_1 = require("./routes/webhookRoutes");
exports.app = (0, express_1.default)();
// Middleware
exports.app.use(express_1.default.json({ limit: "2mb" }));
exports.app.use(express_1.default.urlencoded({ extended: true }));
if (env_1.env.CORS_ORIGIN) {
    exports.app.use((0, cors_1.default)({ origin: env_1.env.CORS_ORIGIN, credentials: false }));
}
// Routes
exports.app.use(jiraRoutes_1.jiraRouter);
exports.app.use(webhookRoutes_1.webhookRouter);
// Default root
exports.app.get("/", (_req, res) => {
    res.json({ ok: true, message: "Jira integration server is running." });
});
