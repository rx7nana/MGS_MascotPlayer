// Occurrence IDs distinguish duplicate registrations without changing the path format.
export const newSongId=()=>crypto.randomUUID();
export function appendSongs(list,paths){list.songIds??=list.songs.map(newSongId);list.songs.push(...paths);list.songIds.push(...paths.map(newSongId));}
export function removeSong(list,index){list.songs.splice(index,1);list.songIds.splice(index,1);}
export function moveSong(list,from,to){for(const k of ['songs','songIds'])[list[k][from],list[k][to]]=[list[k][to],list[k][from]];}
export class PlaylistDraft {
 constructor(config){this.dirty=false;this.accept(config);}
 accept(config){this.committed=structuredClone(config);if(!this.dirty)this.value=structuredClone(config);else{const {playlists,active}=this.value;this.value={...structuredClone(config),playlists,active};}}
 change(){this.dirty=true;}
 discard(){this.dirty=false;this.value=structuredClone(this.committed);return this.value;}
 async commit(save){const result=await save({playlists:structuredClone(this.value.playlists),active:this.value.active});this.dirty=false;this.accept(result);return this.value;}
}
const key=e=>e.listId+'\0'+e.id;
const shuffle=(a,random)=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
export class PlaylistPlayback {
 constructor(lists,active,config={},random=Math.random){this.random=random;this.current=null;this.history=[];this.bag=[];this.anchor=null;this.configure(lists,active,config);const entries=this.entries();this.current=entries.find(e=>e.id===config.currentEntryId)||entries.find(e=>e.path===config.currentFile)||entries[0]||null;this.rebuild();}
 entries(id=this.active){const l=this.lists.find(l=>l.id===id);return l?l.songs.map((path,i)=>({path,id:l.songIds[i],listId:l.id})):[];}
 present(e){return !!e&&this.entries(e.listId).some(x=>x.id===e.id);}
 configure(lists,active,config){const old=this.lists?this.entries(this.current?.listId):[],oldIndex=old.findIndex(e=>e.id===this.current?.id),wasShuffle=this.shuffle;this.lists=structuredClone(lists);this.active=active;this.shuffle=!!config.shuffle;this.repeat=config.repeatMode||'OFF';
  this.history=this.history.filter(e=>this.present(e));
  if(this.current&&!this.present(this.current)&&this.anchor===null){const available=this.entries();this.anchor=old.slice(oldIndex+1).find(e=>available.some(x=>key(x)===key(e)))||available[Math.max(0,oldIndex)%Math.max(1,available.length)]||null;}
  if(this.current&&this.present(this.current))this.anchor=null;
  if(!this.shuffle||!wasShuffle)this.rebuild();else{const entries=this.entries(),valid=new Set(entries.map(key)),oldKeys=new Set(old.map(key));this.bag=this.bag.filter(e=>valid.has(key(e))&&key(e)!==key(this.current||{}));const seen=new Set(this.bag.map(key));this.bag.push(...shuffle(entries.filter(e=>!oldKeys.has(key(e))&&!seen.has(key(e))&&key(e)!==key(this.current||{})),this.random));}
 }
 rebuild(){const a=this.entries(),i=a.findIndex(e=>this.current&&key(e)===key(this.current));this.bag=this.shuffle?shuffle(a.filter(e=>i<0||key(e)!==key(a[i])),this.random):a.slice(i+1);}
 select(id,listId=this.active){const e=this.entries(listId).find(e=>e.id===id);if(!e)return null;this.active=listId;this.current={...e};this.anchor=null;this.rebuild();return this.current;}
 next(natural=false){const a=this.entries(),same=this.current?.listId===this.active,present=same&&this.present(this.current);
  if(natural&&this.repeat==='ONE'&&present)return{...this.current,repeatCurrent:true};
  let next;
  if(!same||!present){next=this.shuffle?this.bag.shift():a.find(e=>this.anchor&&key(e)===key(this.anchor))||a[0];}
  else if(this.shuffle){next=this.bag.shift();if(!next&&this.repeat==='ALL'){this.bag=shuffle(a.filter(e=>key(e)!==key(this.current)),this.random);next=this.bag.shift()||(a.length===1?a[0]:null);}}
  else{const i=a.findIndex(e=>key(e)===key(this.current));next=a[i+1]||(this.repeat==='ALL'?a[0]:null);}
  if(!next)return null;
  if(this.current&&this.present(this.current))this.history.push({...this.current});
  this.current={...next};this.anchor=null;if(!this.shuffle)this.rebuild();return this.current;
 }
 previous(){let e;while(this.history.length){e=this.history.pop();if(this.present(e)&&e.listId===this.active){this.current={...e};this.anchor=null;this.rebuild();return this.current;}}return null;}
 upcoming(){const a=this.entries();if(this.current?.listId!==this.active||!this.present(this.current)){if(this.shuffle)return this.bag;const i=a.findIndex(e=>this.anchor&&key(e)===key(this.anchor));return i<0?a:[...a.slice(i),...a.slice(0,i)];}return this.bag;}
}
