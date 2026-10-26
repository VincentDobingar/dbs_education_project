import { createApp } from "./app.js";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { bootstrapNotificationChannels } from "./lib/notification-channels.js";
import { bootstrapPaymentChannels } from "./lib/payment-channels.js";

bootstrapNotificationChannels();
bootstrapPaymentChannels();

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
