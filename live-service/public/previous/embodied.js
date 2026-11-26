export const newEmbodied=()=>({enabled:false,phase:'rest',topic:0,last:'尚未开启输入演示',confirmed:false});
export function embodiedReduce(s,e){
 if(e==='enable')return {...s,enabled:true,phase:'rest',last:'输入演示已开启；没有使用摄像头或麦克风'};
 if(e==='stop')return {...s,enabled:false,last:'已停止接收演示信号'};
 if(!s.enabled)return s;
 if(e==='lost')return {...s,phase:'rest',last:'未获得清晰信号，保留内容，等待你'};
 if(e==='gaze')return {...s,phase:'focus',last:'注视只展开内容，不代表喜欢'};
 if(e==='smile')return {...s,phase:'clarify',last:'检测到表情样例，先确认，不猜情绪或偏好'};
 if(e==='shake'||e==='next')return {...s,topic:(s.topic+1)%3,phase:'rest',confirmed:false,last:'换一个方向，不记作永久不喜欢'};
 if(e==='nod'||e==='continue')return ['focus','clarify'].includes(s.phase)?{...s,phase:'confirmed',confirmed:true,last:'你明确回应了当前问题：这次想继续探索'}:{...s,last:'先聚焦一个内容，再回应它；这次不执行操作'};
 return s;
}
