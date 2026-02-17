---
"@eventualize/relational-storage-adapter": minor
"@eventualize/dynamodb-storage-adapter": minor
"@eventualize/types": minor
"@eventualize/core": minor
---

Introduces EvDbTimeTraveler — a replay engine that enables navigating event-sourced streams to any point in time by offset or timestamp. Key capabilities:

Replay to arbitrary offsets or timestamps with snapshot-optimized starting points
Step-by-step event navigation (forward and backward) via a stateful stepper
State diffing between any two points in a stream's history
Async generator support for streaming replay
Memory-efficient sliding window and checkpoint-based backward navigation
Also includes fixes to storage adapters (DynamoDB date handling, Prisma payload structure) and updates the empty snapshot convention to use offset -1 for unambiguous initial state detection.
