import { app } from "./app";
import { env } from "./config/env";
import { log } from "./utils/logger";

app.listen(env.PORT, () => {
    log.info(`Server listening on http://localhost:${env.PORT}`);
});
