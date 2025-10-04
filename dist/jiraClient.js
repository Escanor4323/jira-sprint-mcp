"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jira = void 0;
const axios_1 = __importDefault(require("axios"));
const buffer_1 = require("buffer");
const env_1 = require("./config/env");
const baseURL = `${env_1.env.JIRA_BASE_URL}/rest/api/3`;
const authString = buffer_1.Buffer.from(`${env_1.env.JIRA_EMAIL}:${env_1.env.JIRA_API_TOKEN}`).toString("base64");
exports.jira = axios_1.default.create({
    baseURL,
    headers: {
        Authorization: `Basic ${authString}`,
        Accept: "application/json",
        "Content-Type": "application/json"
    },
    timeout: 20000
});
