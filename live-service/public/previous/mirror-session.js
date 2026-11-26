export const newMirrorSession=()=>({stage:'offer',topic:0,tone:'open',budget:'flexible',log:[],saved:[],paused:false,serial:0});
export function mirrorStep(s,event){
 if(event==='stop')return {...s,paused:true,serial:s.serial+1,stage:s.stage==='working'?'need':s.stage};
 if(event==='resume')return {...s,paused:false};
 if(s.paused)return s;
 if(event==='next')return {...s,topic:(s.topic+1)%3,stage:'offer',tone:'open',serial:s.serial+1,log:[...s.log,'换一个内容，不记作长期厌恶']};
 if(event==='gaze'&&['offer','focus','gentle'].includes(s.stage))return {...s,stage:'focus',log:[...s.log,'注视展开内容；未确认兴趣']};
 if(event==='smile'&&['offer','focus','gentle'].includes(s.stage))return {...s,stage:'focus',tone:'playful',log:[...s.log,'表情动作触发更具探索性的呈现，未判断真实情绪']};
 if(event==='frown'&&['offer','focus','gentle'].includes(s.stage))return {...s,stage:'gentle',tone:'quiet',log:[...s.log,'表情动作触发简化；仍需确认原因']};
 if(event==='nod'&&['focus','gentle'].includes(s.stage))return {...s,stage:'need',log:[...s.log,'本人确认这次想探索']};
 if(event==='free')return {...s,budget:'free',log:[...s.log,'明确约束：不花钱']};
 if(event==='start'&&s.stage==='need')return {...s,stage:'working',serial:s.serial+1,log:[...s.log,'确认模拟任务范围，网络开始准备样例']};
 if(event==='result'&&s.stage==='working')return {...s,stage:'result',log:[...s.log,'模拟网络返回方案；没有真实外发']};
 if(event==='save'&&s.stage==='result'){const item={topic:s.topic,budget:s.budget,tone:s.tone,id:s.serial,selection:s.selection?structuredClone(s.selection):null};return {...s,stage:'saved',saved:[...s.saved,item],log:[...s.log,'已完成安排卡并保存在本页']};}
 if(event==='lost')return {...s,log:[...s.log,'信号不清晰，保持原内容']};
 return s;
}
