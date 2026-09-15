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
    if(focused)button.focus({preventScroll:true})
    button.setAttribute('aria-expanded' ,String(!closed));button.setAttribute('aria-label',(closed?'展开':'收起')+label);button.title=button.getAttribute('aria-label')
    localStorage.setItem('reader-'+which+'-closed',String(closed))
  }
  for(const which of ['library','outline']){
    side(which,localStorage.getItem('reader-'+which+'-closed')==='true')
    $('#toggle-'+which).onclick=()=>side(which,!layout.classList.contains(which+'-closed'))
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
