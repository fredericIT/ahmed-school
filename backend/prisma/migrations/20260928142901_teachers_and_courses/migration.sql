-- AlterTable
ALTER TABLE `PasswordResetToken` ADD COLUMN `purpose` ENUM('PASSWORD_RESET', 'ACTIVATION') NOT NULL DEFAULT 'PASSWORD_RESET';

-- AlterTable
ALTER TABLE `User` ADD COLUMN `activatedAt` DATETIME(3) NULL,
    ADD COLUMN `post` VARCHAR(10) NULL,
    ADD COLUMN `regNumber` VARCHAR(30) NULL,
    MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'TEACHER') NOT NULL DEFAULT 'ADMIN';

-- CreateTable
CREATE TABLE `Course` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `description` VARCHAR(255) NULL,
    `level` ENUM('NURSERY', 'PRIMARY') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Course_code_key`(`code`),
    INDEX `Course_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeacherAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teacherId` INTEGER NOT NULL,
    `courseId` INTEGER NOT NULL,
    `classId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TeacherAssignment_classId_idx`(`classId`),
    INDEX `TeacherAssignment_courseId_idx`(`courseId`),
    UNIQUE INDEX `TeacherAssignment_teacherId_courseId_classId_key`(`teacherId`, `courseId`, `classId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `User_regNumber_key` ON `User`(`regNumber`);

-- AddForeignKey
ALTER TABLE `TeacherAssignment` ADD CONSTRAINT `TeacherAssignment_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeacherAssignment` ADD CONSTRAINT `TeacherAssignment_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeacherAssignment` ADD CONSTRAINT `TeacherAssignment_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

