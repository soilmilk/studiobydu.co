---
title: "early notes from crcl's backend structure"
date: "2026-01-01"
description: "how our data is stored"
---

i've included a snippet i found interesting.

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

how would you associate the player with their uni roster, or other metadata?

fix: pulling uni data from supabase using player id:

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

working with this response gives you access to the player's full match history.
