// Set identity belongs to playlist occurrences, never file names or array positions.
export function motionFor(config,entry){
 const id=config.assignments?.[entry?.listId]?.[entry?.id];
 const motion=config.motions?.find(m=>m.id===id);
 return motion?structuredClone(motion):null;
}
export function motionReferences(config,id){
 return config.playlists.flatMap(l=>l.songs.flatMap((path,i)=>config.assignments?.[l.id]?.[l.songIds[i]]===id?[{list:l.name,path,id:l.songIds[i]}]:[]));
}
export function removeMotion(config,id){
 config.motions=config.motions.filter(m=>m.id!==id);
 for(const assignments of Object.values(config.assignments))for(const[k,v]of Object.entries(assignments))if(v===id)delete assignments[k];
}
export function playbackSnapshot(config,entry){return Object.freeze({entry:entry?Object.freeze({...entry}):null,motion:motionFor(config,entry),setEpoch:config.setEpoch});}
export async function chooseSetAction(title,operation='続行'){
 return new Promise(resolve=>{const d=document.createElement('dialog');d.className='set-choice';const p=document.createElement('p');p.textContent=title;d.append(p);
  for(const[value,label]of[['save','保存して'+operation],['discard','保存せず'+operation],['cancel','キャンセル']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{d.close();d.remove();resolve(value)};d.append(b);}
  d.oncancel=e=>{e.preventDefault();d.close();d.remove();resolve('cancel')};document.body.append(d);d.showModal();d.querySelector('button:last-child').focus();
 });
}
