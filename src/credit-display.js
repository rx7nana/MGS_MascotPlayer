// A copied presentation target. No audio/VMD clock, scheduler, cache or storage.
export function textOptions(motion){
 const position=motion?.textPosition??(motion?.creditEnabled===true?'bottom-right':'none');
 return {position,mode:motion?.textMode??'always',text:typeof motion?.creditText==='string'?motion.creditText:''};
}
export function creditText(motion){const o=textOptions(motion);return o.position!=='none'&&o.text.trim()?o.text:'';}
export class CreditDisplay{
 constructor(element,anchor,controls,popup){
  Object.assign(this,{element,anchor,controls,popup});this.clear();
  this.reposition=()=>this.layout();this.resize=new ResizeObserver(this.reposition);
  for(const target of [anchor,controls,popup])if(target)this.resize.observe(target);
  this.changes=new MutationObserver(this.reposition);
  this.changes.observe(document.body,{attributes:true,attributeFilter:['class','style','data-layout','data-text-mode']});
  this.changes.observe(document.documentElement,{attributes:true,attributeFilter:['style']});
  window.addEventListener('resize',this.reposition);
 }
 start(motion,epoch,now=performance.now()){
  const o=textOptions(motion);this.target=creditText(motion)?{...o,epoch}:null;
  this.phase=this.target?'sequence':'none';this.startedAt=now;this.element.textContent=this.target?.text||'';this.element.hidden=!this.target;
  this.layout();this.update(now);
 }
 clear(){this.target=null;this.phase='none';this.startedAt=null;this.element.textContent='';this.element.hidden=true;this.element.style.opacity='1';}
 hold(epoch){if(!this.target)return;if(epoch!==undefined&&epoch!==this.target.epoch){this.clear();return;}this.phase='held';this.element.hidden=false;this.element.style.opacity='1';this.layout();}
 resume(now=performance.now()){if(!this.target)return;this.phase='sequence';this.startedAt=now;this.element.hidden=false;this.update(now);}
 setChanged(epoch,live){if(!live&&this.target&&this.target.epoch!==epoch)this.clear();}
 update(now){
  if(!this.target)return;
  const elapsed=Math.max(0,now-this.startedAt),opacity=this.phase==='held'||this.target.mode==='always'?1:Math.max(0,Math.min(1,(6000-elapsed)/1000));
  this.element.style.opacity=String(opacity);this.element.hidden=opacity===0;
 }
 layout(){
  if(!this.target)return;
  const song=this.anchor.querySelector('.song:not(.current)')||this.anchor,font=getComputedStyle(song);
  for(const n of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','color','webkitTextStrokeWidth','webkitTextStrokeColor','paintOrder'])this.element.style[n]=font[n];
  const anchorRect=this.anchor.getBoundingClientRect(),top=Math.max(12,anchorRect.top+13),bottom=Math.max(top,this.controls.getBoundingClientRect().top-12),right=this.target.position==='bottom-right',upper=this.target.position==='top-left',rightEdge=Math.max(0,Math.min(innerWidth,anchorRect.right)),upperTop=upper?(this.anchor.querySelector('.song')||this.anchor).getBoundingClientRect().top:top;
  // Intrinsic max-content width uses the rendered longest line, not character counts.
  // Preserve the old bottom-safe boundary; only top-left's top and right's horizontal box change.
  Object.assign(this.element.style,{left:right?'auto':'20px',right:right?(innerWidth-rightEdge)+'px':'auto',width:right?'max-content':Math.max(0,innerWidth/2-30)+'px',maxWidth:right?rightEdge+'px':'none',whiteSpace:right?'pre':'pre-wrap',overflowWrap:right?'normal':'anywhere',top:upper?upperTop+'px':'auto',bottom:upper?'auto':Math.max(0,innerHeight-bottom)+'px',maxHeight:Math.max(0,bottom-(right?Math.max(top,anchorRect.bottom+10):upper?upperTop:top))+'px',textAlign:'left',lineHeight:'17px'});
 }
 dispose(){this.resize.disconnect();this.changes.disconnect();window.removeEventListener('resize',this.reposition);}
}
