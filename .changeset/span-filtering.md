---
"@eventualize/types": minor
"@eventualize/core": minor
"@eventualize/relational-storage-adapter": minor
"@eventualize/dynamodb-storage-adapter": minor
---

Add span filtering per stream factory: `StreamFactoryBuilder.withTelemetry({ spans })` turns eventualize spans on or off by name, group (`"eventualize.adapter.*"`) or `"*"`. Storage adapters follow the factory's policy through the OpenTelemetry context.

**Default change:** `eventualize.stream.append` and `eventualize.adapter.*` spans are now off by default. To get them back, add `.withTelemetry({ spans: { "eventualize.stream.append": true, "eventualize.adapter.*": true } })` to the factory.
