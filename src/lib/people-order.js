const baseLook=look=>!look||((!look.palette||look.palette==='tangerine')&&(!look.body||['classic','ghost'].includes(look.body))
  &&(!look.finish||['gummy','softGummy'].includes(look.finish))&&(!look.hat||['none','bare'].includes(look.hat)));

export function prioritizePeople(rows,random=Math.random){
 return rows.map(person=>({person,base:baseLook(person.slop_look),lot:random()}))
  .sort((a,b)=>Number(a.base)-Number(b.base)||a.lot-b.lot).map(entry=>entry.person);
}
