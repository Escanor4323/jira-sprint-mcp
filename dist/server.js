"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
app_1.app.listen(env_1.env.PORT, () => {
    logger_1.log.info(`Server listening on http://localhost:${env_1.env.PORT}`);
});
