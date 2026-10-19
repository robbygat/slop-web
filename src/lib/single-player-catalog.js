// Both fields must be absent so legacy and unknown match protocols cannot enter
// the single-player feed. The database defaults ordinary games to null.
export const filterSinglePlayer=query=>query.is('multiplayer_mode',null).is('multiplayer_protocol',null);
export const singlePlayerGame=game=>game?.multiplayer_mode===null&&game?.multiplayer_protocol===null;
