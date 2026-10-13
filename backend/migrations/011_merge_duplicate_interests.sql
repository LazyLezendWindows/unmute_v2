-- The interest list is now the 23 picture tiles. The older, overlapping interests are merged into
-- their closest new one: members keep an equivalent choice, then the old interest is removed
-- (user_interests rows follow via ON DELETE CASCADE). Safe to re-run.
DROP TEMPORARY TABLE IF EXISTS interest_merge;
CREATE TEMPORARY TABLE interest_merge (
  old_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
  new_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO interest_merge (old_name, new_name) VALUES
  ('Reading & Books', 'Reading'),
  ('Writing & Poetry', 'Reading'),
  ('Philosophy', 'Spirituality'),
  ('Indie Cinema', 'Movies'),
  ('Coffee Brewing', 'Coffee'),
  ('Software & Tech', 'Tech'),
  ('Hiking & Trails', 'Adventures'),
  ('Board Games', 'Gaming'),
  ('Analog Photography', 'Photography'),
  ('Astrophotography', 'Photography'),
  ('Jazz & Lo-Fi', 'Music'),
  ('Podcasts & Radio', 'Music'),
  ('Cooking & Recipes', 'Cooking'),
  ('Biking & Cycling', 'Sports'),
  ('Design & UI/UX', 'Art');

-- The targets may not exist yet on a fresh install (the seed adds them after migrations run).
DROP TEMPORARY TABLE IF EXISTS interest_targets;
CREATE TEMPORARY TABLE interest_targets (
  name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
  category VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  icon VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO interest_targets (name, category, icon) VALUES
  ('Adventures', 'Outdoors', 'Compass'),
  ('Art', 'Arts', 'Palette'),
  ('Coffee', 'Lifestyle', 'Coffee'),
  ('Cooking', 'Lifestyle', 'CookingPot'),
  ('Gaming', 'Gaming', 'Gamepad2'),
  ('Movies', 'Cinema', 'Film'),
  ('Music', 'Music', 'Music'),
  ('Photography', 'Arts', 'Camera'),
  ('Reading', 'Culture', 'BookOpen'),
  ('Spirituality', 'Mind', 'Sun'),
  ('Sports', 'Health', 'Trophy'),
  ('Tech', 'Tech', 'Laptop');

INSERT INTO interests (id, name, category, icon)
SELECT UUID(), t.name, t.category, t.icon FROM interest_targets t
WHERE NOT EXISTS (SELECT 1 FROM interests i WHERE i.name COLLATE utf8mb4_unicode_ci = t.name COLLATE utf8mb4_unicode_ci)
  AND EXISTS (SELECT 1 FROM interest_merge m JOIN interests o ON o.name COLLATE utf8mb4_unicode_ci = m.old_name COLLATE utf8mb4_unicode_ci WHERE m.new_name COLLATE utf8mb4_unicode_ci = t.name COLLATE utf8mb4_unicode_ci);

INSERT IGNORE INTO user_interests (user_id, interest_id)
SELECT ui.user_id, n.id
FROM user_interests ui
JOIN interests o ON o.id = ui.interest_id
JOIN interest_merge m ON m.old_name COLLATE utf8mb4_unicode_ci = o.name COLLATE utf8mb4_unicode_ci
JOIN interests n ON n.name COLLATE utf8mb4_unicode_ci = m.new_name COLLATE utf8mb4_unicode_ci;

DELETE o FROM interests o
JOIN interest_merge m ON o.name COLLATE utf8mb4_unicode_ci = m.old_name COLLATE utf8mb4_unicode_ci
JOIN interests n ON n.name COLLATE utf8mb4_unicode_ci = m.new_name COLLATE utf8mb4_unicode_ci
WHERE NOT EXISTS (
  SELECT 1
  FROM user_interests ui
  LEFT JOIN user_interests ui_new ON ui_new.user_id = ui.user_id AND ui_new.interest_id = n.id
  WHERE ui.interest_id = o.id AND ui_new.user_id IS NULL
);

DROP TEMPORARY TABLE IF EXISTS interest_merge;
DROP TEMPORARY TABLE IF EXISTS interest_targets;

