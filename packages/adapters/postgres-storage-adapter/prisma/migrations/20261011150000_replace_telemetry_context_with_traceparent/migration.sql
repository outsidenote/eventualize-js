-- AlterTable
ALTER TABLE "events" DROP COLUMN "telemetry_context",
ADD COLUMN     "traceparent" VARCHAR(255),
ADD COLUMN     "tracestate" VARCHAR(255);

-- AlterTable
ALTER TABLE "outbox" DROP COLUMN "telemetry_context",
ADD COLUMN     "traceparent" VARCHAR(255),
ADD COLUMN     "tracestate" VARCHAR(255);
