-- CreateTable
CREATE TABLE `snapshot_v2` (
    `id` CHAR(36) NOT NULL,
    `stream_type` VARCHAR(150) NOT NULL,
    `stream_id` VARCHAR(150) NOT NULL,
    `view_name` VARCHAR(150) NOT NULL,
    `offset` BIGINT NOT NULL,
    `state` JSON NULL,
    `state_offset` BIGINT NULL,
    `stored_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `ix_snapshot_v2_stored_at`(`stream_type`, `stream_id`, `view_name`, `stored_at`),
    PRIMARY KEY (`stream_type`, `stream_id`, `view_name`, `offset`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
