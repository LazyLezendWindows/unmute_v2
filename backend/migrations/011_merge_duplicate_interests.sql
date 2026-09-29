-- The interest list is now the 23 picture tiles. The older, overlapping interests are merged into
-- their closest new one: members keep an equivalent choice, then the old interest is removed
-- (user_interests rows follow via ON DELETE CASCADE). Safe to re-run.
CREATE TEMPORARY TABLE interest_merge (old_name VARCHAR(100) PRIMARY KEY, new_name VARCHAR(100) NOT NULL);
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
CREATE TEMPORARY TABLE interest_targets (name VARCHAR(100) PRIMARY KEY, category VARCHAR(100), icon VARCHAR(50));
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
WHERE NOT EXISTS (SELECT 1 FROM interests i WHERE i.name = t.name)
  AND EXISTS (SELECT 1 FROM interest_merge m JOIN interests o ON o.name = m.old_name WHERE m.new_name = t.name);

INSERT IGNORE INTO user_interests (user_id, interest_id)
SELECT ui.user_id, n.id
FROM user_interests ui
JOIN interests o ON o.id = ui.interest_id
JOIN interest_merge m ON m.old_name = o.name
JOIN interests n ON n.name = m.new_name;

DELETE o FROM interests o JOIN interest_merge m ON m.old_name = o.name;

DROP TEMPORARY TABLE interest_merge;
DROP TEMPORARY TABLE interest_targets;
