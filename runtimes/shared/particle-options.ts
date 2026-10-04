import type { OptionField } from './options.js';
import type { Particles } from './motion.js';

/** Advanced fields are opt-in so existing saved effects retain their motion. */
export interface ParticleOptions {
  advanced: boolean;
  shape: string;
  emitter: string;
  path: string;
  areaWidth: number;
  areaHeight: number;
  radius: number;
  direction: number;
  orbitSpeed: number;
  wind: number;
  drag: number;
  turbulence: number;
  sizeEnd: number;
  sizeVariation: number;
  speedVariation: number;
  lifeVariation: number;
  colorEnd: string;
  fadeIn: number;
  fadeOut: number;
  opacity: number;
  spin: number;
  glow: number;
  blend: string;
  trail: number;
  delay: number;
  burstInterval: number;
  prewarm: boolean;
  sync: boolean;
}
export const particleFields: OptionField[] = [
  {key:'advanced',label:'고급 파티클 사용',type:'boolean',value:false},
  {key:'shape',label:'입자 모양',type:'select',value:'circle',options:['circle','star','spark','ring','diamond','petal','smoke']},
  {key:'emitter',label:'방출 영역',type:'select',value:'point',options:['point','box','circle','ring']},
  {key:'path',label:'이동 궤적',type:'select',value:'ballistic',options:['ballistic','orbit','vortex']},
  {key:'areaWidth',label:'영역 너비 (화면 비율)',type:'number',value:1,min:0,max:2,step:.05},
  {key:'areaHeight',label:'영역 높이 (화면 비율)',type:'number',value:.1,min:0,max:2,step:.05},
  {key:'radius',label:'원·고리 반경 (짧은 변 비율)',type:'number',value:.25,min:0,max:1,step:.01},
  {key:'direction',label:'이동 방향 (도, 0=오른쪽)',type:'number',value:-90,min:-360,max:360,step:5},
  {key:'orbitSpeed',label:'공전 속도 (도/초)',type:'number',value:90,min:-720,max:720,step:10},
  {key:'wind',label:'수평 바람 (px/초)',type:'number',value:0,min:-1000,max:1000,step:10},
  {key:'drag',label:'속도 저항',type:'number',value:0,min:0,max:10,step:.1},
  {key:'turbulence',label:'흔들림 크기 (px)',type:'number',value:0,min:0,max:200,step:5},
  {key:'sizeEnd',label:'소멸 시 크기 배율',type:'number',value:0,min:0,max:20,step:.1},
  {key:'sizeVariation',label:'크기 무작위 비율',type:'number',value:.4,min:0,max:1,step:.05},
  {key:'speedVariation',label:'속도 무작위 비율',type:'number',value:.4,min:0,max:1,step:.05},
  {key:'lifeVariation',label:'수명 무작위 비율',type:'number',value:.2,min:0,max:.9,step:.05},
  {key:'colorEnd',label:'소멸 색상',type:'color',value:'#ff6430'},
  {key:'fadeIn',label:'서서히 나타나기 (수명 비율)',type:'number',value:.1,min:0,max:1,step:.05},
  {key:'fadeOut',label:'서서히 사라지기 (수명 비율)',type:'number',value:.5,min:0,max:1,step:.05},
  {key:'opacity',label:'입자 불투명도',type:'number',value:1,min:0,max:1,step:.05},
  {key:'spin',label:'회전 속도 (도/초)',type:'number',value:90,min:-1080,max:1080,step:15},
  {key:'glow',label:'발광 크기 (px)',type:'number',value:0,min:0,max:60,step:2},
  {key:'blend',label:'합성',type:'select',value:'normal',options:['normal','add']},
  {key:'trail',label:'잔광 길이 (초)',type:'number',value:0,min:0,max:1,step:.02},
  {key:'delay',label:'방출 시작 지연 (초)',type:'number',value:0,min:0,max:10,step:.1},
  {key:'burstInterval',label:'폭발 반복 간격 (초, 0=한 번)',type:'number',value:0,min:0,max:30,step:.1},
  {key:'prewarm',label:'연속 방출을 채운 상태로 시작',type:'boolean',value:true},
  {key:'sync',label:'전체 등장·퇴장에 맞춰 페이드',type:'boolean',value:true},
];
export const defaultParticleOptions = Object.fromEntries(particleFields.map(f=>[f.key,f.value])) as unknown as ParticleOptions;
export interface ParticleStyle { id: string; name: string; description: string; settings: Partial<Particles>; }
export const particleStyles: ParticleStyle[] = [
  {id:'rain',name:'빗줄기',description:'넓은 영역에서 비스듬히 떨어지는 비와 긴 잔광',settings:{shape:'spark',emitter:'box',y:0,areaHeight:0,direction:100,spread:4,speed:650,gravity:80,size:2,sizeEnd:1,color:'#b6d8ff',colorEnd:'#628fcb',lifetime:1.2,count:160,trail:.08,spin:0,fadeIn:0,fadeOut:.15}},
  {id:'fire',name:'화염',description:'아래에서 피어오르며 붉게 식는 발광 불꽃',settings:{shape:'smoke',emitter:'box',areaWidth:.35,areaHeight:.02,y:.85,speed:150,spread:35,gravity:-50,size:32,sizeEnd:.1,color:'#fff1a3',colorEnd:'#e62909',lifetime:1.8,count:100,glow:20,blend:'add',turbulence:25}},
  {id:'smoke',name:'연기',description:'천천히 부풀며 바람에 흩어지는 부드러운 연기',settings:{shape:'smoke',emitter:'circle',radius:.04,y:.85,speed:75,spread:20,gravity:-10,wind:35,size:30,sizeEnd:4,color:'#c5c6d0',colorEnd:'#596176',opacity:.3,lifetime:4,count:50,turbulence:30,fadeIn:.2,fadeOut:.65}},
  {id:'embers',name:'불티',description:'바람과 흔들림을 타고 떠오르는 작은 불씨',settings:{shape:'spark',emitter:'box',areaWidth:1,areaHeight:.1,y:.9,speed:140,spread:45,gravity:-25,wind:30,size:6,sizeEnd:0,color:'#ffe58d',colorEnd:'#e83c16',lifetime:3,count:90,turbulence:45,glow:12,blend:'add',trail:.1}},
  {id:'petals',name:'꽃잎',description:'화면 위에서 회전하며 흩날리는 꽃잎',settings:{shape:'petal',emitter:'box',areaWidth:1.2,areaHeight:.05,y:0,direction:80,speed:100,gravity:15,spread:30,wind:25,size:18,sizeEnd:.7,color:'#ffd6ed',colorEnd:'#ee78ad',lifetime:5,count:65,turbulence:55,spin:170,fadeIn:.05}},
  {id:'heal',name:'치유의 빛',description:'원 안에서 떠오르며 반짝이는 초록 별빛',settings:{shape:'star',emitter:'circle',radius:.3,y:.7,speed:95,spread:15,gravity:-20,size:18,sizeEnd:.2,color:'#eaffbb',colorEnd:'#23e4a3',lifetime:2.5,count:50,glow:16,blend:'add',spin:60,turbulence:10}},
  {id:'magic',name:'마법 고리',description:'고리 주위를 공전하는 별과 곡선 방향의 잔광',settings:{shape:'star',emitter:'ring',path:'orbit',radius:.3,orbitSpeed:65,speed:0,gravity:0,size:14,sizeEnd:.5,color:'#e9caff',colorEnd:'#6376ff',lifetime:3,count:65,glow:12,blend:'add',trail:.12,spin:80}},
  {id:'vortex',name:'흡입 소용돌이',description:'바깥 고리에서 중심으로 말려드는 빛',settings:{shape:'diamond',emitter:'ring',path:'vortex',radius:.45,orbitSpeed:200,speed:0,gravity:0,size:14,sizeEnd:0,color:'#9cecff',colorEnd:'#bb62ff',lifetime:2.5,count:120,glow:10,blend:'add',trail:.1}},
  {id:'fireworks',name:'폭죽',description:'사방으로 퍼졌다가 중력에 떨어지는 반복 폭발',settings:{shape:'spark',emitter:'point',emission:'burst',burstInterval:2.4,direction:0,spread:360,speed:260,gravity:120,drag:.3,size:7,sizeEnd:.1,color:'#fff4b8',colorEnd:'#ff548e',lifetime:2,count:150,glow:12,blend:'add',trail:.15,fadeIn:0}},
  {id:'shockwave',name:'충격파',description:'중심에서 빠르게 확장되는 동심원 파동',settings:{shape:'ring',emitter:'point',emission:'burst',burstInterval:1.6,speed:0,gravity:0,size:40,sizeEnd:18,sizeVariation:.3,lifeVariation:.35,color:'#efffff',colorEnd:'#388bff',lifetime:1.2,count:3,glow:10,blend:'add',fadeIn:0,fadeOut:1,spin:0}},
];
