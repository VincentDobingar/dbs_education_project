import { createApp } from "./app.js";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { bootstrapNotificationChannels } from "./lib/notification-channels.js";
import { bootstrapPaymentChannels } from "./lib/payment-channels.js";
import { startFeeScheduler } from "./modules/finance/fee-schedule/reminders.service.js";

bootstrapNotificationChannels();
bootstrapPaymentChannels();

const app = createApp();
startFeeScheduler();

app.listen(env.PORT, () => {
  logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
