const locks=new WeakMap();
export function lockBodyScroll(body) {
 let lock=locks.get(body);
 if(!lock){lock={count:0,original:body.style.overflow};locks.set(body,lock);}
 lock.count++;body.style.overflow='hidden';let released=false;
 return ()=>{
  if(released)return;released=true;
  if(--lock.count===0){body.style.overflow=lock.original;locks.delete(body);}
 };
}
