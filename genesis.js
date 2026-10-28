export const genesisRules=[
 {id:'economy',name:'先找免费起点',dimension:'经济',proposal:'免费和收费都可行时，先给免费方案。',votes:[['经济守护者','赞成','先减少试错成本，不按佣金排序。'],['文化与边界守护者','赞成','可以否决这个偏好，但否决不等于同意付款。'],['效用探索者','保留异议','收费指导可能更有效，应让人保留选择。']],effect:'排除付费体验候选'},
 {id:'governance',name:'先独自试试',dimension:'治理与文化',proposal:'先给自己能开始的方案，不默认动用社交关系。',votes:[['文化与边界守护者','赞成','独处和拒绝联系都是正常选择。'],['经济守护者','赞成','不以邀请朋友作为使用门槛。'],['效用探索者','保留异议','朋友的陪伴也可能降低开始的难度。']],effect:'排除需要朋友配合的候选'},
 {id:'utility',name:'先完成一小步',dimension:'Utility',proposal:'第一次探索先控制在十分钟，先得到可完成的结果。',votes:[['效用探索者','赞成','把“想试试”变成一个现在能做的动作。'],['文化与边界守护者','赞成','每天一次回应是邀请，不是必须完成的打卡。'],['经济守护者','保留异议','完整体验可能减少反复安排的时间。']],effect:'排除四十五分钟的完整候选'}
];
export const createGenesis=()=>({version:1,enabled:Object.fromEntries(genesisRules.map(r=>[r.id,r.votes.filter(v=>v[1]==='赞成').length>=2])),history:[{version:1,action:'创世会议形成三项可撤销的默认偏好',rule:null}],previous:null});
export function reviseGenesis(g,id){if(!genesisRules.some(r=>r.id===id))return g;const enabled={...g.enabled,[id]:!g.enabled[id]},version=g.version+1;return {...g,enabled,version,history:[...g.history,{version,rule:id,action:enabled[id]?'本人恢复规则':'本人否决规则'}]};}
export function chooseByGenesis(g,{topic=0,budget='flexible'}={}){
 const prices=[80,90,60],pool=[];
 for(const paid of [false,true])for(const social of [false,true])for(const full of [false,true]){
  const blocked=[];if((g.enabled.economy||budget==='free')&&paid)blocked.push(budget==='free'?'本人明确要求免费':'经济：先找免费起点');if(g.enabled.governance&&social)blocked.push('治理：先独自试试');if(g.enabled.utility&&full)blocked.push('Utility：先完成一小步');
  pool.push({id:`${topic}-${+paid}${+social}${+full}`,paid,social,full,minutes:full?45:10,price:paid?prices[topic]:0,score:10+(paid?3:0)+(social?2:0)+(full?1:0),blocked});
 }
 const candidates=pool.filter(c=>!c.blocked.length).sort((a,b)=>b.score-a.score),chosen=candidates[0];
 return {...chosen,ruleVersion:g.version,excluded:pool.filter(c=>c.blocked.length),reason:[chosen.paid?'不再优先免费，提供收费体验询价草案':'先用已有条件，成本为零',chosen.social?'建议邀一个朋友；未发送邀请':'先独自开始，不联系朋友',chosen.full?'保留完整四十五分钟探索':'先把十分钟的小事做完'],isQuote:chosen.paid};
}
export function genesisPlan(decision,topic){
 const names=['光影散步','聆听探索','纸上创作'];
 const simple=[['窗边找一束光','用手机留下一张照片','写一句你注意到的变化'],['在自己的音乐应用选一首歌','比较同一首歌的现场版本','留下一种想继续听的乐器'],['准备一张废纸和一支笔','折成小卡，画一个身边的物件','给作品取一个名字']];
 const full=[['选三个容易抵达的观察点','沿路记录光影并选出三张','整理成一组有主题的照片'],['选三首不同编制的作品','比较原声与现场版本','整理一份自己的试听顺序'],['画出小作品的草图','折叠并完成一个纸模型','修改一次，留下过程与成品']];
 const tasks=decision.full?full[topic]:simple[topic];
 const steps=decision.paid?['询问体验内容、时长与退改条件','比较报价与免费替代方案','由你另行决定是否预约，当前不付款']:[...tasks];
 if(decision.social)steps[0]='准备一条给朋友的邀请草稿：'+steps[0]+'（未发送）';
 return {invitation:decision.social?'想找'+decision.minutes+'分钟一起试试'+names[topic]+'，你有兴趣吗？不方便也没关系。':null,quote:decision.paid?'请介绍'+names[topic]+'体验的内容、实际时长、完整费用与退改条件，并提供免费替代建议。':null,name:names[topic]+(decision.paid?' · 询价草案':' · 行动卡'),steps,completion:decision.paid?'询价草案完成；未预约、未付款':'行动卡完成；活动需由你实际进行',summary:`${decision.minutes} 分钟 · ${decision.social?'和朋友':'自己开始'} · ${decision.paid?'示例 ¥'+decision.price:'¥0'}`};
}
