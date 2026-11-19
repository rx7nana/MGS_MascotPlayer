import{AudioTransport as MgsTransport}from'./transport-integrated.js';
import{VgmAudioAdapter}from'./vgm-audio-adapter.js';
export class AudioTransport{
 constructor(api){this.mgs=new MgsTransport(api);this.vgm=null;this.api=api;this.listeners={};this.serial=0;return new Proxy(this,{get:(t,k)=>{if(k in t){const v=t[k];return typeof v==='function'?v.bind(t):v}const owner=t.vgm||t.mgs,v=owner[k];return typeof v==='function'?v.bind(owner):v},set:(t,k,v)=>{if(k==='onEnded'||k==='onError'){t.listeners[k]=v;t.mgs[k]=v;if(t.vgm)t.vgm[k]=v}else if(k in t)t[k]=v;else(t.vgm||t.mgs)[k]=v;return true}})}
 async init(){this.initial=await this.mgs.init();return this.initial}
 async compile(file,encoding){const serial=++this.serial;await this.mgs.stop(true);if(this.vgm)await this.vgm.release();if(serial!==this.serial)return{cancelled:true};const cfg=(await host.get()).cfg;if(serial!==this.serial)return{cancelled:true};if(/\.vgm$/i.test(file)){await this.mgs.release();if(serial!==this.serial)return{cancelled:true};this.vgm=new VgmAudioAdapter(cfg);Object.assign(this.vgm,this.listeners);return this.vgm.compile(file)}this.vgm=null;this.mgs.setVolume(cfg.volume);return this.mgs.compile(file,encoding)}
 async stop(cancel=false){if(cancel)this.serial++;return(this.vgm||this.mgs).stop(cancel)}
 async release(){this.serial++;if(this.vgm)await this.vgm.release();await this.mgs.release()}
}
