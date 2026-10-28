// Text-only presentation of the immutable motion snapshot for this performance.
// No audio clock, VMD timing, input region, storage, or URL access belongs here.
export function creditText(motion) {
  return motion?.creditEnabled === true && typeof motion.creditText === 'string' && motion.creditText.trim()
    ? motion.creditText : '';
}

export class CreditDisplay {
  constructor(element, anchor, controls, popup) {
    Object.assign(this, {element, anchor, controls, popup});
    this.clear();
    this.reposition = () => this.layout();
    this.resize = new ResizeObserver(this.reposition);
    for (const target of [anchor, controls, popup]) if (target) this.resize.observe(target);
    this.changes = new MutationObserver(this.reposition);
    this.changes.observe(document.body, {attributes:true, attributeFilter:['class','style','data-layout','data-text-mode']});
    this.changes.observe(document.documentElement, {attributes:true, attributeFilter:['style']});
    if (popup) this.changes.observe(popup, {attributes:true, attributeFilter:['hidden','class','style']});
    window.addEventListener('resize', this.reposition);
  }
  start(motion) {
    const text = creditText(motion);
    this.element.textContent = text;
    this.element.hidden = !text;
    this.layout();
  }
  clear() {
    this.element.textContent = '';
    this.element.hidden = true;
  }
  layout() {
    if (this.element.hidden) return;
    const anchor = this.anchor.getBoundingClientRect(), style = getComputedStyle(this.anchor);
    const song = this.anchor.querySelector('.song:not(.current)') || this.anchor;
    const font = getComputedStyle(song);
    for (const name of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight','color','textShadow','webkitTextStrokeWidth','webkitTextStrokeColor','paintOrder']) this.element.style[name] = font[name];
    const inset = parseFloat(style.paddingRight) || 0, top = anchor.bottom + 10;
    const right = Math.max(12, innerWidth - anchor.right + inset);
    let bottom = Math.min(innerHeight - 12, this.controls.getBoundingClientRect().top - 10);
    if (this.popup && !this.popup.hidden) bottom = Math.min(bottom, this.popup.getBoundingClientRect().top - 10);
    Object.assign(this.element.style, {
      top:top+'px', right:right+'px', width:Math.max(0,Math.min(320,innerWidth-right-12))+'px',
      maxHeight:Math.max(0,bottom-top)+'px'
    });
  }
  dispose() {
    this.resize.disconnect(); this.changes.disconnect();
    window.removeEventListener('resize', this.reposition);
  }
}
