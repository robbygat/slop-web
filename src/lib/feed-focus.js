// Keep a stable winner across the whole viewport, not only the entries that
// happened to cross an IntersectionObserver threshold in the latest callback.
export function visibleFeedGame(items, {top=0,bottom,current=null}) {
  const space=bottom-top;if(!(space>0))return null;
  const visible=items.map(item=>{const height=item.bottom-item.top,overlap=Math.max(0,Math.min(bottom,item.bottom)-Math.max(top,item.top));return {...item,ratio:height>0?overlap/Math.min(height,space):0,distance:Math.abs((item.top+item.bottom-top-bottom)/2)};}).filter(item=>item.ratio>=.2);
  visible.sort((a,b)=>b.ratio-a.ratio||a.distance-b.distance);
  const best=visible[0];if(!best)return null;
  const previous=visible.find(item=>item.id===current);
  return previous&&previous.ratio>=best.ratio-.1?previous.id:best.id;
}
