-- Super Likes: a like marked special. The person receiving it sees who sent it (ordinary likes
-- stay anonymous until a match). Limited per day in MatchingService.
ALTER TABLE likes ADD COLUMN IF NOT EXISTS is_super TINYINT(1) NOT NULL DEFAULT 0;
