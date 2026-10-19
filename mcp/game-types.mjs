export const GAME_TYPE_GUIDE = `# Choose the game type first

Before creating a project, ask which type the user wants if their request is ambiguous. Never silently choose single-player when they asked for multiplayer.

| game_type | Players | Runtime | Destination |
| --- | --- | --- | --- |
| single-player | One human; CPU opponents are allowed | creator-v1, or persistent-v1 with persistent:true | Ordinary game catalog |
| multiplayer | Two authenticated humans taking turns online | multiplayer-v1 with turns-v1 contract | Multiplayer tab and host-owned rooms |

Single-player and multiplayer are separate project types. Mobile, desktop and cross-platform describe controls and screen sizes, not the number of players. A persistent Slop World is single-player. CPU practice, local hot-seat and a mock network are not online multiplayer. Real-time multiplayer is unsupported; do not build another Air Hockey transport.

1. Choose game_type explicitly: "single-player" or "multiplayer".
2. Call slop_game_template with that game_type and target_platform. Use persistent:true only for a single-player World.
3. Keep the generated slop.spec.json game_type and unchanged slop.js. Multiplayer also requires its exact turns-v1 multiplayer contract and real Slop.match snapshot/subscription and submit calls in the entrypoint. Adapt the bounded action_schema to the game.
4. Call slop_check_bundle and slop_send_draft with the same game_type. Publish with the same game_type and returned submission_id. A mismatched request, source declaration, runtime or stored project type is rejected. To change the kind of game, create a separate project_id.

Multiplayer: wait for the authoritative snapshot while Slop.match.active is true, use its seed and ordered actions for deterministic reconstruction, and submit only the assigned seat's turn. The host owns identity, lobby, transport and rematch consent. Never fetch, open sockets, choose user/room IDs or persist authored state. A clearly labelled practice fallback is only for standalone preview/capture when Slop.match.active is false; it must never replace an absent live opponent. A successful local check is not proof of two-client multiplayer behaviour: test both seats, reconnect, delayed input and rematch.

Compatibility: already-created untyped projects can still be checked and updated using the type inferred from their existing contract. Keep existing source bytes and request identity for retries. New projects require an explicit game_type in the request and source spec. Updating an existing single-player project cannot convert it into multiplayer or vice versa.
`;

export function gameTypes() {
 return {
  required_choice: 'game_type',
  game_types: [
   {game_type:'single-player',players:'one human',runtimes:['creator-v1','persistent-v1'],persistent_allowed:true},
   {game_type:'multiplayer',players:'two humans online, taking turns',runtimes:['multiplayer-v1'],protocol:'turns-v1',seats:2,persistent_allowed:false},
  ],
  guide: GAME_TYPE_GUIDE,
  resource: 'slop://guides/game-types',
 };
}
