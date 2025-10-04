"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const EnvSchema = zod_1.z.object({
    JIRA_BASE_URL: zod_1.z.string().url(),
    JIRA_EMAIL: zod_1.z.string().min(3),
    JIRA_API_TOKEN: zod_1.z.string().min(10),
    CORS_ORIGIN: zod_1.z.string().optional(),
    PORT: zod_1.z.coerce.number().optional(),
    PROJECT_KEY: zod_1.z.string().min(1).optional(),
    OPENAI_API_KEY: zod_1.z.string().min(10)
});
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
