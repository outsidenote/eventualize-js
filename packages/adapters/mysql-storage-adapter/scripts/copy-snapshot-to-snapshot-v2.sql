INSERT INTO snapshot_v2 (id, stream_type, stream_id, view_name, `offset`, state, state_offset, stored_at)
SELECT id, stream_type, stream_id, view_name, `offset`, state, `offset`, stored_at
FROM (SELECT s.*, ROW_NUMBER() OVER (PARTITION BY stream_type, stream_id, view_name ORDER BY `offset` DESC) AS rn
      FROM snapshot s) latest
WHERE rn = 1
ON DUPLICATE KEY UPDATE id = snapshot_v2.id;
