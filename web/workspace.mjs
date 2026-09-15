export function mountWorkspace(){
  const $=s=>document.querySelector(s),layout=$('.layout'),search=$('#search'),box=$('#top-search')
  function side(which,closed){
    layout.classList.toggle(which+'-closed',closed)
    const button=$('#toggle-'+which),label=which==='library'?'文件目录':'文章大纲'
    button.setAttribute('aria-expanded',String(!closed));button.setAttribute('aria-label',(closed?'展开':'收起')+label);button.title=button.getAttribute('aria-label')
    localStorage.setItem('reader-'+which+'-closed',String(closed))
  }
  for(const which of ['library','outline']){
    side(which,localStorage.getItem('reader-'+which+'-closed')==='true')
    $('#toggle-'+which).onclick=()=>side(which,!layout.classList.contains(which+'-closed'))
  }
  function open(){
    box.classList.add('expanded');$('#search-field').inert=false;$('#search-toggle').setAttribute('aria-expanded','true');search.focus()
  }
  function close(){
    box.classList.remove('expanded');$('#search-field').inert=true;$('#search-toggle').setAttribute('aria-expanded','false');$('#search-toggle').focus()
    if(search.value){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}))}
  }
  $('#search-toggle').onclick=open;$('#search-close').onclick=close
  search.addEventListener('input',()=>{if(search.value.trim())side('library',false)})
  document.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]'))return
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open()}
    if(e.key==='Escape'&&box.classList.contains('expanded')){e.preventDefault();close()}
  })
  if(!/Mac|iPhone|iPad/.test(navigator.platform))$('#search-toggle kbd').textContent='Ctrl K'
}
