-- Super Likes: a like marked special. The person receiving it sees who sent it (ordinary likes
-- stay anonymous until a match). Limited per day in MatchingService.
-- MySQL & MariaDB compatible idempotent schema update using information_schema checks.

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE likes ADD COLUMN is_super TINYINT(1) NOT NULL DEFAULT 0', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'likes' AND COLUMN_NAME = 'is_super');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

