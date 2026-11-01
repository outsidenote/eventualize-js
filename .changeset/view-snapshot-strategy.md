---
"@eventualize/core": minor
---

Add a per-view snapshot strategy: `withView` takes an optional 4th argument, a callback with `when`, `onEvent`, `offsetGap` and `durationGapMs`, to choose when the view stores a snapshot. Views without a strategy still store on every `store()`.
