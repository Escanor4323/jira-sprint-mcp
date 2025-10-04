"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPerformanceSystemPrompt = exports.buildTeamLeadSystemPrompt = exports.gptClient = exports.GptClient = void 0;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../config/env");
class GptClient {
    constructor() {
        this.client = new openai_1.default({ apiKey: env_1.env.OPENAI_API_KEY });
    }
    async complete(options) {
        const response = await this.client.responses.create({
            model: "gpt-4.1-mini",
            temperature: options.temperature ?? 0.2,
            max_output_tokens: options.maxTokens ?? 350,
            input: [
                { role: "system", content: options.systemPrompt },
                { role: "user", content: options.userPrompt }
            ]
        });
        const output = response.output_text ?? "";
        return output.trim();
    }
}
exports.GptClient = GptClient;
exports.gptClient = new GptClient();
const buildTeamLeadSystemPrompt = () => `You are the team leader creating a retrospective summary.
- Voice: confident, pragmatic, collaborative
- Goals: explain effort distribution, highlight due-date strategy, surface risks, cite rework and sections affected.
- Format: concise paragraphs (2-3 sentences per bullet requirement).
`;
exports.buildTeamLeadSystemPrompt = buildTeamLeadSystemPrompt;
const buildPerformanceSystemPrompt = () => `You are a supportive team lead assessing sprint performance for each team member.
- Return a strict JSON array where each element is {"name": string, "score": number, "rationale": string}.
- Scores must be integers between 0 and 100, favoring the 91-97 range unless data shows serious issues.
- Rationale should be a short sentence referencing the provided work evidence.
- Do not add commentary outside the JSON array.`;
exports.buildPerformanceSystemPrompt = buildPerformanceSystemPrompt;
