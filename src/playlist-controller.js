export class PlaylistController{
 constructor(audio){this.audio=audio;this.items=[];this.current=-1;this.version=0;this.transitions=[];audio.onEnded=()=>audio.serialize(()=>this.advance()).catch(e=>{audio.error=e.message;});}
 async init(){this.items=await host.prepared('playlist');return this.items;}
 async persist(items){this.items=await host.prepared('playlist',items);return this.items;}
 async play(index){if(index<0||index>=this.items.length)throw Error('曲を選択してください');const begin=performance.now();this.current=index;const result=await this.audio.compile(this.items[index].path);if(result.cancelled){this.current=-1;return;}if(!result.success)throw Error(result.message);await this.audio.play();this.transitions.push({index,name:this.items[index].name,millis:performance.now()-begin,seconds:this.audio.song.seconds,metadata:this.audio.song.metadata});host.record('playlist-transitions',this.transitions);}
 async advance(){if(this.current>=0&&this.current+1<this.items.length)return this.play(this.current+1);this.current=-1;await this.audio.stop();host.record('playlist-finished',{stopped:true,transitions:this.transitions});}
 async remove(index){const removed=this.items[index];if(index===this.current){await this.audio.stop(true);this.audio.song=null;this.audio.index=null;this.audio.compiled=false;this.current=-1;}else if(index<this.current)this.current--;return this.persist(this.items.filter((_,i)=>i!==index));}
 async move(index,delta){const j=index+delta;if(j<0||j>=this.items.length)return this.items;const next=this.items.slice();[next[index],next[j]]=[next[j],next[index]];if(this.current===index)this.current=j;else if(this.current===j)this.current=index;return this.persist(next);}
 snapshot(){return {items:this.items,current:this.current,transitions:this.transitions};}
}
