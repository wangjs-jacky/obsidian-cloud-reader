import {bounceMarker} from "./components/bounce-marker.mjs"
export function mountOutline(main, panel) {
  let headings=[],links=[],frame=0,moveMarker=()=>{}
  const details=panel.querySelector('details'),nav=panel.querySelector('nav')
  function highlight(){
    frame=0
    let active=headings[0]
    for(const h of headings){if(h.getBoundingClientRect().top<=110)active=h;else break}
    moveMarker(links[headings.indexOf(active)])
    links.forEach((a,i)=>{if(headings[i]===active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})
  }
  function update(){
    headings=[...main.querySelectorAll('article h1,article h2,article h3,article h4,article h5,article h6')]
    nav.replaceChildren();links=[]
    panel.hidden=!headings.length
    document.querySelector('.layout').classList.toggle('has-outline',!!headings.length)
    if(!headings.length)return
    const base=Math.min(...headings.map(h=>Number(h.tagName[1])))
    headings.forEach((h,i)=>{
      h.id='heading-'+(i+1)
      const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent.trim()||'无标题'
      a.style.setProperty('--depth',Number(h.tagName[1])-base)
      a.onclick=e=>{e.preventDefault();h.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});h.setAttribute('tabindex','-1');h.focus({preventScroll:true});if(matchMedia('(max-width:1100px)').matches)details.open=false}
      nav.append(a);links.push(a)
    })
    moveMarker=bounceMarker(nav)
    details.open=!matchMedia('(max-width:1100px)').matches
    highlight()
  }
  new MutationObserver(update).observe(main,{childList:true})
  addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(highlight)},{passive:true})
  addEventListener('resize',()=>{details.open=!matchMedia('(max-width:1100px)').matches;highlight()})
  update()
}
