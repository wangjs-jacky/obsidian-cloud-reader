// DOM adaptation of Rare UI BounceSidebar's pixel-snapped moving active marker.
// Source: https://github.com/swamimalode07/rare-ui/blob/main/components/ui/bounce-sidebar.tsx
// Original author: Swami Malode. See THIRD_PARTY_NOTICES.md.
export function bounceMarker(nav){
  let previous=null,animation=null
  const dot=document.createElement('span');dot.className='bounce-marker';dot.setAttribute('aria-hidden','true');nav.prepend(dot)
  return target=>{
    if(!target||!nav.contains(target))return
    const dpr=devicePixelRatio||1,size=Math.round(6*dpr)/dpr
    const y=Math.round((target.offsetTop+target.offsetHeight/2-size/2)*dpr)/dpr
    if(y===previous)return
    const from=previous;previous=y;animation?.cancel()
    dot.style.transform=`translateY(${y}px)`;dot.style.opacity='1'
    if(from===null||matchMedia('(prefers-reduced-motion: reduce)').matches)return
    const distance=Math.abs(y-from),bend=Math.min(.8*distance,14)
    animation=dot.animate([{transform:`translate(0,${from}px)`},{transform:`translate(${bend}px,${(from+y)/2}px)`,offset:.5},{transform:`translate(0,${y}px)`}],{duration:250,easing:'ease-out'})
  }
}
