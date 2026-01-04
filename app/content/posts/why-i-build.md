---
title: "testing code"
date: "2026-01-01"
description: "logs for the new year 🎉"
---

segfault in c++ (cs 106b flashbacks)

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

pulling uni data from supabase:

```
query GetPlayerById($id: UUID!) {
  playerCollection(filter: { id: { eq: $id } }, first: 1) {
    edges {
      node {
        ...Player
        rosterCollection(filter: { active: { eq: true } }) {
          edges {
            node {
              school {
                ...School
              }
            }
          }
        }
      }
    }
  }
}
```
