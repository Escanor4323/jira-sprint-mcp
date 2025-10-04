import axios, { AxiosInstance } from "axios";
import { Buffer } from "buffer";
import { env } from "./config/env";

const baseURL = `${env.JIRA_BASE_URL}/rest/api/3`;
const authString = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");

export const jira: AxiosInstance = axios.create({
    baseURL,
    headers: {
        Authorization: `Basic ${authString}`,
        Accept: "application/json",
        "Content-Type": "application/json"
    },
    timeout: 20000
});
