// Vanilla WebGL adaptation of Rare UI's Fluid Orb.
// Source: https://github.com/swamimalode07/rare-ui/blob/main/components/ui/fluid-orb.tsx
const VERT=`attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.,1.);}`
const FRAG=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_resolution;uniform float u_time;uniform vec3 u_color;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.6;for(int i=0;i<3;i++){v+=a*noise(p);p*=2.;a*=.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/u_resolution.xy;float t=u_time*.22;vec2 drift=vec2(sin(t)+.6*sin(t*1.7+1.3),cos(t*.8)+.6*cos(t*1.3+2.1));vec2 p=vec2(uv.x*1.8,uv.y)+drift*.7;vec2 q=vec2(fbm(p+drift),fbm(p+vec2(3.2,1.5)-drift));float f=fbm(p+1.2*q);float g=clamp(1.-uv.y,0.,1.);float anchor=smoothstep(0.,.3,uv.y);float shade=clamp(g+(f-.5)*.8*anchor,0.,1.);vec3 white=vec3(.99,1.,.98),light=mix(white,u_color,.5),dark=u_color,col=white;col=mix(col,light,smoothstep(.28,.52,shade));col=mix(col,dark,smoothstep(.58,.88,shade));float edge=smoothstep(.5,.49,distance(uv,vec2(.5)));gl_FragColor=vec4(col*edge,edge);}`

function shader(gl,type,source){
  const value=gl.createShader(type)
  if(!value)return null
  gl.shaderSource(value,source);gl.compileShader(value)
  if(!gl.getShaderParameter(value,gl.COMPILE_STATUS)){gl.deleteShader(value);return null}
  return value
}

export function mountGuestMotion(){
  const home=document.querySelector('#guest-home'),canvas=document.querySelector('#guest-orb'),visual=document.querySelector('.guest-visual')
  if(!home||!canvas||!visual)return
  const reduced=matchMedia('(prefers-reduced-motion: reduce)')
  if(!reduced.matches){
    home.addEventListener('pointermove',event=>{
      const r=visual.getBoundingClientRect()
      visual.style.setProperty('--mx',String((event.clientX-r.left-r.width/2)/r.width))
      visual.style.setProperty('--my',String((event.clientY-r.top-r.height/2)/r.height))
    })
    home.addEventListener('pointerleave',()=>{visual.style.setProperty('--mx','0');visual.style.setProperty('--my','0')})
  }
  const gl=canvas.getContext('webgl',{antialias:true,alpha:true})
  if(!gl){canvas.classList.add('guest-orb-fallback');return}
  const program=gl.createProgram(),vert=shader(gl,gl.VERTEX_SHADER,VERT),frag=shader(gl,gl.FRAGMENT_SHADER,FRAG)
  if(!program||!vert||!frag){canvas.classList.add('guest-orb-fallback');return}
  gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program)
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){canvas.classList.add('guest-orb-fallback');return}
  gl.useProgram(program)
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
  const pos=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0)
  const resolution=gl.getUniformLocation(program,'u_resolution'),time=gl.getUniformLocation(program,'u_time')
  gl.uniform3f(gl.getUniformLocation(program,'u_color'),53/255,100/255,77/255)
  const resize=()=>{const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);gl.uniform2f(resolution,w,h)}}
  new ResizeObserver(resize).observe(canvas);resize()
  const start=performance.now();let frame=0
  const draw=now=>{
    resize();gl.uniform1f(time,reduced.matches?0:(now-start)/1000);gl.drawArrays(gl.TRIANGLES,0,6)
    if(!reduced.matches&&document.body.classList.contains('guest')&&!document.hidden)frame=requestAnimationFrame(draw)
    else frame=0
  }
  const sync=()=>{if(document.body.classList.contains('guest')&&!frame)frame=requestAnimationFrame(draw)}
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']})
  addEventListener('visibilitychange',sync);sync();draw(start)
}
