-- Oneway cost sanity checks.
SELECT
  COUNT(*) FILTER (WHERE oneway = 'yes' AND reverse_drive_cost_s = -1) AS oneway_yes_blocked_reverse,
  COUNT(*) FILTER (WHERE oneway = '-1' AND drive_cost_s = -1 AND reverse_drive_cost_s > 0) AS oneway_reverse_blocked_forward
FROM roads;
