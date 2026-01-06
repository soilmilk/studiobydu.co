---
title: "early issue from crcl's backend structure"
date: "2026-01-01"
description: "how our data is stored"
---

when building the backend, one of the first real design questions we ran into was:

**How would you associate the player with their uni roster -- and also get their match history?**

At a glance, clash's API makes this feel easy. Here's an example response that we're working with:

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

Originally, we wanted to store these _child_ variables in the _parent player_ object. however, this could get messy etc.

- • player could switch roster, so its `roster_id` changes. however, to assemble a roster, this means checking every player if they contain `roster_id` -- much cleaner to have the opposite, an already assembled `roster` object with `player_id`s.

- • each match has sets of games (e.g. M1 S2), so harder to keep track of this as a _child_ variable.

---

## Structural Decision: Instead of inflating the `player` object, flip the model.

---

Treat player as a _child_, use its unique `player_id` as a key to `set_player, player, roster` collections to access data in all 3.

```
query GetPlayerSetsMatchesGames($playerId: UUID!) {
  set_playerCollection(filter: { player_id: { eq: $playerId } }) {
    edges {
      node {
        id
        set {
          /* Set Data */
          match {
            /* Match Data */
          }
          gameCollection(orderBy: [{ game_num: AscNullsLast }]) {
            edges {
              node {
                id
                game_num
                start
                end
                winner_crowns
                loser_crowns
                winner_school_id: school {
                  ...School
                }
              }
            }
          }
        }
      }
    }
  }
  playerCollection(filter: { id: { eq: $playerId } }, first: 1) {
    edges {
      node {
        ...Player
      }
    }
  }

  rosterCollection(
    filter: { player_id: { eq: $playerId }, active: { eq: true } }
    first: 1
  ) {
    edges {
      node {
        school {
          ...School
        }
      }
    }
  }
}
```

this response gives a nice dataset of the player's

✅ school
✅ roster
✅ matches/sets/games (e.g. M1 S2 G1)

---

## Takeaway: In a league system, identity should be stable, and relationships should move. We avoided assumptions about roster stability or match structure into the player model itself.

---
