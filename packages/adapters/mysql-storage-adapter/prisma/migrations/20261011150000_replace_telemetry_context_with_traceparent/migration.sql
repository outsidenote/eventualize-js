-- AlterTable
ALTER TABLE `events` DROP COLUMN `telemetry_context`,
    ADD COLUMN `traceparent` VARCHAR(255) NULL,
    ADD COLUMN `tracestate` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `outbox` DROP COLUMN `telemetry_context`,
    ADD COLUMN `traceparent` VARCHAR(255) NULL,
    ADD COLUMN `tracestate` VARCHAR(255) NULL;
