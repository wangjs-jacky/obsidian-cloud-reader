const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow'}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...privateHeaders,'Content-Type':'application/json'}})
const sessionId=/^[a-zA-Z0-9_-]{1,128}$/
export function createApp(auth){return {async fetch(request,env){
  const url=new URL(request.url)
  if(!env.PUBLIC_ORIGIN||url.origin!==env.PUBLIC_ORIGIN)return json({error:'Invalid origin'},403)
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)return json({error:'Invalid request origin'},403)
  if(url.pathname.startsWith('/auth/')&&url.pathname!=='/auth/session')return auth.fetch(request,env)
  const session=await auth.session(request,env)
  if(url.pathname==='/auth/session')return json(session?{authenticated:true,user:{id:session.userId,name:session.name,email:session.email}}:{authenticated:false})
  if(url.pathname.startsWith('/api/')){
    if(!session||!sessionId.test(session.userId||''))return json({error:'请先登录网站账号'},401)
    if(!env.LIBRARY)return json({error:'Storage not configured'},503)
    if(!['GET','HEAD'].includes(request.method)&&!(request.method==='POST'&&['/api/settings','/api/settings/reveal','/api/refresh'].includes(url.pathname)))return json({error:'Method not allowed'},405)
    if(request.method==='POST'){
      const reader=request.body?.getReader(),chunks=[];let size=0
      if(reader)while(true){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return json({error:'Request too large'},413)}chunks.push(value)}
      const body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length}request=new Request(request,{body})
    }
    // Identity comes exclusively from the verified server-side session, never from request parameters.
    const id=env.LIBRARY.idFromName('user:'+session.userId)
    const r=await env.LIBRARY.get(id).fetch(request),h=new Headers(r.headers)
    for(const[k,v]of Object.entries(privateHeaders))h.set(k,v)
    return new Response(request.method==='HEAD'?null:r.body,{status:r.status,headers:h})
  }
  if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405)
  const r=await env.ASSETS.fetch(request),h=new Headers(r.headers)
  for(const[k,v]of Object.entries(privateHeaders))h.set(k,v)
  return new Response(request.method==='HEAD'?null:r.body,{status:r.status,headers:h})
}}}
