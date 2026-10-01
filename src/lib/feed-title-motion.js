export const FEED_TITLE_ENTRANCES=Object.freeze(['rise','slide','settle','tilt']);

// Only a genuine game change advances the entrance. Crown/like refreshes,
// loading gaps and modal updates keep the current title and its settled pose.
export function nextFeedTitleEntrance(previous,gameId){
 if(typeof gameId!=='string'||!gameId||previous?.gameId===gameId)return previous;
 const entry=(previous?.entry??-1)+1;
 return {gameId,entry,variant:FEED_TITLE_ENTRANCES[entry%FEED_TITLE_ENTRANCES.length]};
}
