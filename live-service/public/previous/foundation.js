export function createFoundation(){return {
 version:1,expressionAdaptation:true,decisions:[],
 pillars:[
  {id:'economy',name:'Economy · 经济',purpose:'让持续服务有成本与收益依据',rules:['订阅覆盖日常帮助，Q 币计量重任务','先说明费用、再执行；邀请奖励不与下级消费绑定','不因广告、佣金或互动时长改变需求判断']},
  {id:'culture',name:'Governance & Culture · 治理与文化',purpose:'让共同信念、行为习惯和权力边界一致',rules:['共同信念：理解可纠正，选择可拒绝','一个小仪式：对眼前的一件事作一次自然回应；不强制打卡','创世规则公开，保留异议，人可以否决可选行为','法律与隐私底线不能通过多数投票豁免']},
  {id:'utility',name:'Utility · 实际效用',purpose:'把猜测变成经确认的需要，再交付可用结果',rules:['区分线索、假设、本人确认和完成证据','衡量事情有没有解决，不以停留时长代替效用','无法执行时明确交付范围；原型仅完成安排卡']}
 ],
 proposal:{title:'允许表情改变呈现，但不能自动确立需求',scope:'只改变可逆的内容密度和探索方式；不扩大输入、分享或付费权限',votes:[{role:'经济守护者',vote:'赞成',reason:'本次变化免费，也不会用购买倾向替代用户利益。'},{role:'文化与边界守护者',vote:'保留异议',reason:'表情含义不确定；必须允许否决，不得当作情绪事实或同意。'},{role:'效用探索者',vote:'赞成',reason:'先调整呈现，再让本人回应，避免把猜测直接变成任务。'}]}
};}
export function foundationGate(action,context){
 if(context.external)return {allowed:false,pillar:'culture',reason:'本版未接入真实外部行动，不能把样例说成已执行。'};
 if(context.cost>0&&!context.costConfirmed)return {allowed:false,pillar:'economy',reason:'需要先说明并确认费用。'};
 if(action==='start'&&!context.needConfirmed)return {allowed:false,pillar:'utility',reason:'先获得本人对当前探索的明确回应。'};
 if(context.sensitiveShare)return {allowed:false,pillar:'culture',reason:'本任务不允许分享身体信号和私人画像。'};
 return {allowed:true,pillar:'all',reason:action==='start'?'经济：免费；治理：只处理本次摘要；效用：已确认需要，准备安排卡。':action==='save'?'经济：未扣费；治理：结果仅保存在本页；效用：安排卡已完成，实际活动尚未发生。':'依据明确约束调整当前任务。'};
}
