-- CreateTable
CREATE TABLE `events` (
    `id` CHAR(36) NOT NULL,
    `stream_type` VARCHAR(150) NOT NULL,
    `stream_id` VARCHAR(150) NOT NULL,
    `offset` BIGINT NOT NULL,
    `event_type` VARCHAR(150) NOT NULL,
    `telemetry_context` JSON NULL,
    `captured_by` VARCHAR(150) NOT NULL,
    `captured_at` DATETIME(6) NOT NULL,
    `stored_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `payload` JSON NOT NULL,

    INDEX `ix_event_7ae7ea3b165349e09b3fe6d66a69fd72`(`stream_type`, `stream_id`, `offset`),
    INDEX `ix_event_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72`(`stored_at`),
    PRIMARY KEY (`stream_type`, `stream_id`, `offset`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox` (
    `id` CHAR(36) NOT NULL,
    `stream_type` VARCHAR(150) NOT NULL,
    `stream_id` VARCHAR(150) NOT NULL,
    `offset` BIGINT NOT NULL,
    `event_type` VARCHAR(150) NOT NULL,
    `channel` VARCHAR(150) NOT NULL,
    `message_type` VARCHAR(150) NOT NULL,
    `serialize_type` VARCHAR(150) NOT NULL,
    `telemetry_context` BLOB NULL,
    `captured_by` VARCHAR(150) NOT NULL,
    `captured_at` DATETIME(6) NOT NULL,
    `stored_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `payload` JSON NOT NULL,

    INDEX `ix_outbox_7ae7ea3b165349e09b3fe6d66a69fd72`(`stream_type`, `stream_id`, `offset`, `channel`, `message_type`),
    INDEX `ix_storedat_outbox_captured_at_7ae7ea3b165349e09b3fe6d66a69fd72`(`stored_at`, `channel`, `message_type`, `offset`),
    PRIMARY KEY (`captured_at`, `stream_type`, `stream_id`, `offset`, `channel`, `message_type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `snapshot` (
    `id` CHAR(36) NOT NULL,
    `stream_type` VARCHAR(150) NOT NULL,
    `stream_id` VARCHAR(150) NOT NULL,
    `view_name` VARCHAR(150) NOT NULL,
    `offset` BIGINT NOT NULL,
    `state` JSON NOT NULL,
    `stored_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `ix_snapshot_earlier_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72`(`stream_type`, `stream_id`, `view_name`, `stored_at`),
    PRIMARY KEY (`stream_type`, `stream_id`, `view_name`, `offset`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
