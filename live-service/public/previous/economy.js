// Pure, in-memory demonstration ledger. No payment, networking or contact access.
export const economyInitial=()=>({balance:20,buckets:{welcome:20,invite:0,subscription:0,purchased:0},reserved:0,subscription:'体验',job:null,invitation:null,shared:[],log:['体验赠额 +20 Q（示例）']});
export function economyReduce(s,e){
 const n={...s,buckets:{...s.buckets},log:[...s.log],shared:[...s.shared]};
 if(e.type==='SUBSCRIBE'&&s.subscription==='体验'){n.subscription='研究订阅';n.balance+=40;n.buckets.subscription+=40;n.log.push('模拟订阅权益 +40 Q；未扣款，价格未定');}
 if(e.type==='RESERVE'&&!s.job?.active){const cost=e.size==='small'?8:30;if(s.balance<cost)return {...s,error:'额度不足：可缩小到 8 Q 或取消，基础帮助仍可使用。'};n.balance-=cost;n.reserved=cost;let left=cost;const allocation={};for(const key of ['welcome','invite','subscription','purchased']){const take=Math.min(left,n.buckets[key]);n.buckets[key]-=take;allocation[key]=take;left-=take}n.job={active:true,cost,title:e.title,size:e.size,allocation};n.error=null;n.log.push('预留 '+cost+' Q：'+e.title);}
 if(['CANCEL','FAIL','COMPLETE'].includes(e.type)&&s.job?.active){const cost=s.reserved;n.reserved=0;n.job={...s.job,active:false,status:e.type};if(e.type==='COMPLETE'){n.log.push('模拟完成，结算 '+cost+' Q；未运行真实实验');}else{n.balance+=cost;for(const [key,value]of Object.entries(s.job.allocation))n.buckets[key]+=value;n.log.push((e.type==='FAIL'?'模拟失败':'取消任务')+'，释放 '+cost+' Q');}}
 if(e.type==='INVITE'&&!s.invitation){n.invitation={state:'pending',code:'JEV-DEMO-FRIEND',gift:8};n.log.push('已创建示例赠体验卡；未发送，奖励待定');}
 if(e.type==='FRIEND_DONE'&&s.invitation?.state==='pending'){n.invitation={...s.invitation,state:'complete'};n.balance+=6;n.buckets.invite+=6;n.log.push('示例好友首次有效体验完成：奖励到账 +6 Q（仅一次）');}
 if(e.type==='SHARE'&&e.allowed&&e.title&&!s.shared.includes(e.title)){n.shared.push(e.title);n.log.push('分享至本页示例同行：仅实验成品《'+e.title+'》，未外发');}
 return n;
}
