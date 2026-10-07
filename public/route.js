// Compatibility for shared game URLs and the retired duplicate site. All
// untrusted route values are encoded into the client fragment, never HTML.
const path=location.pathname.split('/').filter(Boolean),query=new URLSearchParams(location.search);
let route='home';
const openGames=query.getAll('game'),openGame=openGames.length===1&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(openGames[0])?openGames[0]:null;
if(path[0]==='open'&&path.length===1&&openGame)route='home?game='+encodeURIComponent(openGame);
else if(['play','g','r','games'].includes(path[0])&&path[1])route='home?game='+encodeURIComponent(path[1]);
else if(path[0]==='play.html'&&(query.get('slug')||query.get('game')))route='home?game='+encodeURIComponent(query.get('slug')||query.get('game'));
else if(['studio','studio.html','build'].includes(path[0]))route='build';
else if(path[0]==='invite'){const values=query.getAll('code'),candidate=path.length===1&&[...query.keys()].length===1&&values.length===1?values[0]:path.length===2&&!location.search?path[1]:null;route='invite'+(!location.hash&&/^[a-f0-9]{8}$/i.test(candidate||'')?'?code='+candidate.toUpperCase():'');}
else if(['open','download'].includes(path[0]))route='download';
else if(['profile','profile.html','you'].includes(path[0]))route='you';
else if(path.length===1&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(path[0]))route='home?game='+encodeURIComponent(path[0]);
else if(path[0]==='mcp'&&path[1]==='pair')location.replace('/mcp/pair/'+location.hash);
if(!(path[0]==='mcp'&&path[1]==='pair'))location.replace('/#/'+route);
