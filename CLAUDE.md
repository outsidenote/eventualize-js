# EvDb Project — Claude Instructions

## Skills

### Advanced TypeScript

Use the **`typescript-expert`** skill for TypeScript and JavaScript issues: type gymnastics, build performance, debugging, and architectural decisions.

When `typescript-expert` cannot solve the problem in standard TypeScript — specifically when **type erasure**, **zero-arg generic APIs**, or **runtime/compile-time bridging** is involved — escalate to the **`typescript-source-gen`** skill.

Triggers for `typescript-source-gen`:
- "payloadType" / "discriminant literal" needs to be available at runtime without repetition
- Caller wants `factory.method<T>()` with zero args but runtime needs the string from `T["someField"]`
- Considering Proxy-based method interception to avoid registration lists
- Considering code generation (TanStack-style) to bridge types → runtime values
- Any pattern where the answer is "TypeScript can't do that — but codegen can"
