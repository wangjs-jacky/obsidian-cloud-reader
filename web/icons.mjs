import {siGithub} from 'simple-icons'
import {createElement, Search, Settings, LogOut, LogIn, SunMoon, X, PanelLeftClose, PanelRightClose, PanelLeftOpen, PanelRightOpen} from 'lucide'
export function mountIcons(){
  const icons={'search-toggle':Search,settings:Settings,login:LogIn,theme:SunMoon,'search-close':X,'toggle-library':PanelLeftClose,'toggle-outline':PanelRightClose}
  for(const[id,icon]of Object.entries(icons)){
    const el=document.getElementById(id);if(!el)continue
    el.replaceChildren(createElement(icon,{'aria-hidden':'true',width:20,height:20,'stroke-width':1.7}))
  }
  const github=document.getElementById('github-link');github.innerHTML=`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="${siGithub.path}"/></svg>`
  const guestGithub=document.querySelector('.guest-login-icon');guestGithub.innerHTML=`<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="${siGithub.path}"/></svg>`
  const logout=document.querySelector('#logout button');logout.replaceChildren(createElement(LogOut,{'aria-hidden':'true',width:20,height:20,'stroke-width':1.7}))
}

export function panelIcon(button,which,closed){
 const icon=which==='library'?(closed?PanelLeftOpen:PanelLeftClose):(closed?PanelRightOpen:PanelRightClose)
 button.replaceChildren(createElement(icon,{'aria-hidden':'true',width:20,height:20,'stroke-width':1.7}))
}
