import {panelIcon} from './icons.mjs'
export function mountWorkspace(){
  const $=s=>document.querySelector(s),layout=$('.layout'),search=$('#search')
  function side(which,closed){
    layout.classList.toggle(which+'-closed',closed)
    const button=$('#toggle-'+which),label=which==='library'?'文件目录':'文章大纲'
    const sidebar=which==='library'?$('#library-sidebar'):$('#outline')
    const focused=document.activeElement===button
    ;(closed?$('#'+which+'-dock'):sidebar.querySelector('.side-heading')).append(button)
    sidebar.inert=closed
    button.setAttribute('aria-controls',sidebar.id)
    panelIcon(button,which,closed)
    if(focused)button.focus({preventScroll:true})
    button.setAttribute('aria-expanded' ,String(!closed));button.setAttribute('aria-label',(closed?'展开':'收起')+label);button.title=button.getAttribute('aria-label')
    localStorage.setItem('reader-'+which+'-closed',String(closed))
  }
  for(const which of ['library','outline']){
    side(which,localStorage.getItem('reader-'+which+'-closed')==='true')
    $('#toggle-'+which).onclick=()=>side(which,!layout.classList.contains(which+'-closed'))
  }
  for(const which of ['library','outline']){
    const handle=$('#resize-'+which),property='--'+which+'-width'
    const saved=Number(localStorage.getItem('reader-'+which+'-width'))
    if(saved>=180&&saved<=420)layout.style.setProperty(property,saved+'px')
    const width=()=>parseFloat(getComputedStyle(layout).getPropertyValue(property))||(which==='library'?280:220)
    function set(value){
      const other=which==='library'?'outline':'library'
      const otherVisible=!layout.classList.contains(other+'-closed')&&(other==='library'||layout.classList.contains('has-outline'))
      const otherWidth=otherVisible?(parseFloat(getComputedStyle(layout).getPropertyValue('--'+other+'-width'))||(other==='library'?280:220))+24:0
      const max=Math.max(180,Math.min(420,layout.clientWidth-76-otherWidth-360))
      const next=Math.round(Math.max(180,Math.min(value,max)))
      layout.style.setProperty(property,next+'px');handle.setAttribute('aria-valuenow',next);handle.setAttribute('aria-valuemax',max)
      localStorage.setItem('reader-'+which+'-width',String(next))
    }
    handle.setAttribute('aria-valuenow',width())
    let drag=null
    handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();drag={x:e.clientX,width:width()};handle.setPointerCapture(e.pointerId);layout.classList.add('resizing');handle.classList.add('dragging')}
    handle.onpointermove=e=>{if(drag)set(drag.width+(e.clientX-drag.x)*(which==='library'?1:-1))}
    const end=()=>{drag=null;layout.classList.remove('resizing');handle.classList.remove('dragging')}
    handle.onpointerup=end;handle.onlostpointercapture=end;handle.onpointercancel=end
    handle.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();set(width()+(e.key==='ArrowRight'?20:-20)*(which==='library'?1:-1))}}
    handle.ondblclick=()=>set(which==='library'?280:220)
  }
  const dialog=$('#search-dialog')
  function open(){
    if(dialog.open)return
    dialog.showModal();search.focus()
    document.dispatchEvent(new Event('reader:modal-open'))
  }
  function close(){dialog.close()}
  dialog.addEventListener('close',()=>{
    document.dispatchEvent(new Event('reader:modal-close'))
    search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));$('#search-toggle').focus()
  })
  $('#search-toggle').onclick=open;$('#search-close').onclick=close
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}})
  dialog.addEventListener('keydown',e=>{
    const links=[...dialog.querySelectorAll('#notes a')]
    if(!links.length)return
    const index=links.indexOf(document.activeElement)
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();links[index<0?(e.key==='ArrowDown'?0:links.length-1):(index+(e.key==='ArrowDown'?1:-1)+links.length)%links.length].focus()}
    if(e.key==='Enter'&&document.activeElement===search){e.preventDefault();links[0].click()}
  })
  document.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]'))return
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open()}
  })
}
