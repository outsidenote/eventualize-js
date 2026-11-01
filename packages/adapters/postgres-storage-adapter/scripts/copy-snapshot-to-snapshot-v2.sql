INSERT INTO snapshot_v2 (id, stream_type, stream_id, view_name, "offset", state, state_offset, stored_at)
SELECT DISTINCT ON (stream_type, stream_id, view_name)
       id, stream_type, stream_id, view_name, "offset", state, "offset", stored_at
FROM snapshot
ORDER BY stream_type, stream_id, view_name, "offset" DESC
ON CONFLICT DO NOTHING;
