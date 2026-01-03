---
title: "testing code"
date: "2026-01-01"
description: "logs"
---

segfault in c++

```cpp
int* p = nullptr;
*p = 42;
```

An example response from clash's API:

```typescript
return NextResponse.json({
  tag, //ex. #L0R9R2JQ0
  latest: latest
    ? {
        type: latest.type,
        battleTime: latest.battleTime,
        team: latest.team?.[0]?.cards ?? [],
        opponent: latest.opponent?.[0]?.cards ?? [],
        crowns: {
          team: latest.team?.[0]?.crowns,
          opp: latest.opponent?.[0]?.crowns,
        },
      }
    : null,
});
```
