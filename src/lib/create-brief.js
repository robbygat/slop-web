export const CREATE_SPARKS = [
 {id:'score',title:'One more run',line:'A simple rule. A ridiculous score.',icon:'play',tone:'mint',idea:'An endless arcade game where a little robot hops between moving rooftops. Land near the edge for a score multiplier, take one risky shortcut, and make restarting instant.'},
 {id:'physics',title:'Beautiful chaos',line:'Physics with a mischievous twist.',icon:'build',tone:'peach',idea:'A physics game where a tiny robot stacks wobbly junk onto a moving cart. Balance the load, catch a surprise object, and chase a taller stack before it all falls.'},
 {id:'puzzle',title:'That aha moment',line:'One clever move changes everything.',icon:'spark',tone:'lavender',idea:'A quick puzzle game where a robot redirects colored beams by rotating mirrors. Make each board readable at a glance, add one surprising rule, and score clean solutions.'},
 {id:'custom',title:'My own idea',line:'You bring the weird part.',icon:'plus',tone:'field',idea:''},
];
const TARGETS = {mobile:'phone',desktop:'desktop','cross-platform':'phone and desktop'};
export function createBuildPrompt({idea,target='cross-platform'}={}) {
 const brief=typeof idea==='string'?idea.trim():'';
 if(!brief||brief.length>1200||!Object.hasOwn(TARGETS,target))return '';
 return `Build a polished Slop game for ${TARGETS[target]}. Send me a private playtest first.

GAME IDEA
${brief}

BUILD AND TEST
1. Call slop_game_template with target_platform "${target}". Follow its instructions and keep the canonical slop.js unchanged.
2. Make the core action satisfying in the first few seconds. Use clear ${target==='mobile'?'touch':target==='desktop'?'keyboard and pointer':'touch, keyboard, and pointer'} controls, a compact centered score HUD, real game-over scoring, and instant restart. Keep the full playfield readable across the chosen screens. Render actual moving gameplay for Slop’s video recorder; Slop owns the start and game-over screens.
3. Test controls, scoring, game over, and restart. Run slop_check_bundle with target_platform "${target}" and fix its problems before sending.

PRIVATE HANDOFF
4. Check slop_connection_status. If approval is needed, call slop_pair, show me the returned link, and wait for me to approve the connection myself.
5. Send the complete bundle with slop_send_draft, target_platform "${target}", and publish: false. Keep project_id stable for later revisions and increase revision for each update.
6. Show me the submission result and ask me to open my Create inbox at https://slop.game/#/connect to playtest. Wait for my feedback. Do not call slop_publish or request public publication.`;
}
