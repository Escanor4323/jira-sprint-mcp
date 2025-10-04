import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
    JIRA_BASE_URL: z.string().url(),
    JIRA_EMAIL: z.string().min(3),
    JIRA_API_TOKEN: z.string().min(10),
    CORS_ORIGIN: z.string().optional(),
    PORT: z.coerce.number().optional(),
    PROJECT_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(10)
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;
