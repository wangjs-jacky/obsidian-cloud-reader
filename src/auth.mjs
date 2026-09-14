const SESSION='__Host-reader_account',FLOW='__Host-reader_oauth',LIFE=7*86400
const encoder=new TextEncoder()
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)))
export const digest=async value=>b64(await crypto.subtle.digest('SHA-256',encoder.encode(value)))
function cookie(name,value,age){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`}
function readCookie(request,name){const value=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);return /^[A-Za-z0-9_-]{43}$/.test(value||'')?value:null}
function redirect(url,cookies=[]){const h=new Headers({...headers,Location:url});for(const c of cookies)h.append('Set-Cookie',c);return new Response(null,{status:303,headers:h})}
function errorPage(message,status=400){return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · 随身笔记</title><style>body{max-width:480px;margin:15vh auto;padding:24px;font:16px/1.8 system-ui;background:#f8f8f3;color:#263b33}a{color:#35644d}</style><h1>暂未完成登录</h1><p>${message}</p><a href="/auth/login">重新使用 GitHub 登录</a> · <a href="/">返回首页</a></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}})}
export class AuthSession {
  constructor(state){this.state=state}
  async fetch(request){return this.state.blockConcurrencyWhile(async()=>{
    const path=new URL(request.url).pathname
    if(request.method==='POST'&&path==='/store'){const record=await request.json();if(!['oauth','session'].includes(record.kind)||!Number.isFinite(record.expiresAt)||record.expiresAt<=Date.now()||record.expiresAt>Date.now()+LIFE*1000+1000)return new Response(null,{status:400});await this.state.storage.put('record',record);await this.state.storage.setAlarm(record.expiresAt);return new Response(null,{status:204})}
    const record=await this.state.storage.get('record')
    if(request.method==='DELETE'){await this.state.storage.deleteAll();await this.state.storage.deleteAlarm();return new Response(null,{status:204})}
    if(!record||record.expiresAt<=Date.now()){if(record)await this.state.storage.deleteAll();return new Response(null,{status:404})}
    if(request.method==='POST'&&path==='/consume'){if(record.kind!=='oauth')return new Response(null,{status:400});await this.state.storage.deleteAll();await this.state.storage.deleteAlarm();return Response.json(record)}
    if(request.method==='GET'&&path==='/session'&&record.kind==='session')return Response.json(record)
    return new Response(null,{status:404})
  })}
  async alarm(){await this.state.storage.deleteAll()}
}
export function githubAuth(fetcher=fetch){
  async function store(env,token,path,options={}){const id=env.AUTH_SESSIONS.idFromName(await digest(token));return env.AUTH_SESSIONS.get(id).fetch(new Request('https://session.internal'+path,options))}
  async function session(request,env){const token=readCookie(request,SESSION);if(!token||!env.AUTH_SESSIONS)return null;try{const r=await store(env,token,'/session');if(!r.ok)return null;const record=await r.json();return record.expiresAt>Date.now()?record.user:null}catch{return null}}
  return {session,async fetch(request,env){
    const url=new URL(request.url)
    if(url.pathname==='/auth/logout'){
      if(request.method!=='POST'||request.headers.get('Origin')!==env.PUBLIC_ORIGIN)return errorPage('请求来源无效。',403)
      const token=readCookie(request,SESSION);if(token&&env.AUTH_SESSIONS){try{await store(env,token,'/',{method:'DELETE'})}catch{return errorPage('退出失败，请重试。',503)}}
      return redirect('/',[cookie(SESSION,'',0),cookie(FLOW,'',0)])
    }
    if(request.method!=='GET')return errorPage('请求方式不支持。',405)
    if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET||!env.AUTH_SESSIONS||!env.AUTH_LIMITER)return errorPage('网站登录尚未配置完成。',503)
    try{if(!(await env.AUTH_LIMITER.limit({key:'oauth:'+ (request.headers.get('CF-Connecting-IP')||'unknown')})).success)return errorPage('登录请求过多，请稍后再试。',429)}catch{return errorPage('登录暂时不可用，请稍后重试。',503)}
    const callback=env.PUBLIC_ORIGIN+'/auth/callback'
    if(url.pathname==='/auth/login'){
      const token=random(),state=random(),verifier=random()
      const r=await store(env,token,'/store',{method:'POST',body:JSON.stringify({kind:'oauth',state,verifier,expiresAt:Date.now()+600000})});if(!r.ok)return errorPage('无法启动登录，请重试。',503)
      const target=new URL('https://github.com/login/oauth/authorize');for(const[k,v]of Object.entries({client_id:env.GITHUB_CLIENT_ID,redirect_uri:callback,state,scope:'',code_challenge:await digest(verifier),code_challenge_method:'S256'}))target.searchParams.set(k,v)
      return redirect(target.toString(),[cookie(FLOW,token,600)])
    }
    if(url.pathname!=='/auth/callback')return errorPage('页面不存在。',404)
    const token=readCookie(request,FLOW),state=url.searchParams.get('state'),code=url.searchParams.get('code')
    if(!token||!state||state.length>128||!code||code.length>512||url.searchParams.has('error'))return errorPage('授权已取消或登录链接已失效，请重新登录。')
    try{
      const flow=await store(env,token,'/consume',{method:'POST'});if(!flow.ok)return errorPage('登录已过期或已使用，请重新登录。')
      const record=await flow.json();if(record.state!==state||record.expiresAt<=Date.now())return errorPage('登录验证不匹配，请重新登录。')
      const grant=await fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:callback,code_verifier:record.verifier}),redirect:'manual',signal:AbortSignal.timeout(15000)})
      if(!grant.ok)throw Error('token');const data=await grant.json();if(typeof data.access_token!=='string'||data.token_type?.toLowerCase()!=='bearer')throw Error('token')
      const profile=await fetcher('https://api.github.com/user',{headers:{Authorization:'Bearer '+data.access_token,Accept:'application/vnd.github+json','User-Agent':'Obsidian-Cloud-Reader','X-GitHub-Api-Version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(15000)})
      if(!profile.ok)throw Error('identity');const user=await profile.json();if(!Number.isSafeInteger(user.id)||user.id<=0||typeof user.login!=='string')throw Error('identity')
      const account={userId:'gh_'+user.id,name:String(user.name||user.login).slice(0,100),login:user.login.slice(0,100)}
      // Only identity is retained. The GitHub access token is never persisted or sent to the browser.
      const sessionToken=random(),saved=await store(env,sessionToken,'/store',{method:'POST',body:JSON.stringify({kind:'session',user:account,expiresAt:Date.now()+LIFE*1000})});if(!saved.ok)throw Error('session')
      const old=readCookie(request,SESSION);if(old)await store(env,old,'/',{method:'DELETE'})
      return redirect('/',[cookie(SESSION,sessionToken,LIFE),cookie(FLOW,'',0)])
    }catch{return errorPage('GitHub 登录暂未完成，请重试。',502)}
  }}
}
