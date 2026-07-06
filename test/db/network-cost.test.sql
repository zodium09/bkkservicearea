-- Manual/CI database checks after npm run db:migrate and network import.

-- 1. Drive mode should respect oneway=yes.
SELECT id
FROM roads
WHERE oneway = 'yes'
  AND drive_cost_s > 0
  AND reverse_drive_cost_s = -1
LIMIT 5;

-- 2. Walk mode should allow footway/path where access is public.
SELECT id
FROM roads
WHERE highway IN ('footway', 'path')
  AND COALESCE(access, '') NOT IN ('no', 'private')
  AND walk_cost_s > 0
LIMIT 5;

-- 3. Motorway should not be used in walk mode.
SELECT id
FROM roads
WHERE highway = 'motorway'
  AND walk_cost_s = -1
LIMIT 5;
