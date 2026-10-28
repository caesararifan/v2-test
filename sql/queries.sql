-- Q3 answers. Run sql/schema.sql first.

-- 1. Insert Fajar (Basic, activated 24 January 2024). Next free ID after SUB06 is SUB07.
INSERT INTO subscribers (id, name, plan, activation_date)
VALUES ('SUB07', 'Fajar', 'Basic', '2024-01-24');

-- 2. Upgrade Fajar to Premium (match on the primary key, not on name - names are not unique).
UPDATE subscribers
SET    plan = 'Premium'
WHERE  id = 'SUB07';

-- 3. Total data usage (all snapshots) across all Premium subscribers.
--    COALESCE makes it return 0 instead of NULL if no Premium subscriber has usage.
SELECT COALESCE(SUM(u.data_usage_mb), 0) AS total_data_usage_mb
FROM   subscribers s
JOIN   usage u ON u.subscriber_id = s.id
WHERE  s.plan = 'Premium';

-- 4. Top 3 subscribers by total data usage across all snapshots.
--    s.id is a deterministic tie-breaker so the top 3 is stable when totals are equal.
SELECT s.id,
       s.name,
       SUM(u.data_usage_mb) AS total_data_usage_mb
FROM   subscribers s
JOIN   usage u ON u.subscriber_id = s.id
GROUP  BY s.id, s.name
ORDER  BY total_data_usage_mb DESC, s.id ASC
LIMIT  3;

-- 5. Subscribers whose average call minutes per snapshot is <= 30 (subquery).
SELECT s.id, s.name, s.plan
FROM   subscribers s
WHERE  s.id IN (
         SELECT u.subscriber_id
         FROM   usage u
         GROUP  BY u.subscriber_id
         HAVING AVG(u.call_minutes) <= 30
       )
ORDER  BY s.id;
