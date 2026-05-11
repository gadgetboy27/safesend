import app from "./app";
import { logger } from "./lib/logger";
import { checkStartupRequirements } from "./lib/startup-check";
import { verifyShipments, autoReleaseDelivered, autoCancelUnpaid, autoRefundUnshipped, autoRefundExpiredDispute } from "./jobs/verify-shipments";
import { pollActiveShipments } from "./jobs/poll-shipments";

checkStartupRequirements();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Scheduled jobs — run on fixed intervals while the server process is alive
setInterval(() => {
  verifyShipments().catch((err) => logger.error({ err }, "verifyShipments job failed"));
}, 6 * 60 * 60 * 1000); // every 6 hours

setInterval(() => {
  autoReleaseDelivered().catch((err) => logger.error({ err }, "autoReleaseDelivered job failed"));
}, 60 * 60 * 1000); // every hour

setInterval(() => {
  pollActiveShipments().catch((err) => logger.error({ err }, "pollActiveShipments job failed"));
}, 2 * 60 * 60 * 1000); // every 2 hours — webhook outage backstop

setInterval(() => {
  autoCancelUnpaid().catch((err) => logger.error({ err }, "autoCancelUnpaid job failed"));
}, 60 * 60 * 1000); // every hour

setInterval(() => {
  autoRefundUnshipped().catch((err) => logger.error({ err }, "autoRefundUnshipped job failed"));
}, 60 * 60 * 1000); // every hour

setInterval(() => {
  autoRefundExpiredDispute().catch((err) => logger.error({ err }, "autoRefundExpiredDispute job failed"));
}, 60 * 60 * 1000); // every hour
