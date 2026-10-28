// Fixed framework contracts. These functions are not judgment agents.
export const utility = Object.freeze({
  id:'local-draft-v1', output:'text/plain', external:false,
  complete: p => typeof p?.body==='string' && p.body.trim().length>0 && !!p.deliver
});
export const economy = Object.freeze({
  eligible:(p,s)=>Number.isFinite(p.cost)&&p.cost>=0&&p.cost<=s.cap&&p.cost<=s.balance,
  needsConfirmation:p=>p.cost>0
});
// Legacy local gate: three equal seats use the same authorization contract.
// The full discussion-and-vote simulation lives in council-sim.js.
export function governanceReview(s,p,{confirmed=false,external=false}={}) {
 const permitted=!!p&&!s.paused&&!external&&(!economy.needsConfirmation(p)||confirmed);
 const reviews=['议员 A','议员 B','议员 C'].map(role=>({role,allow:permitted,vote:permitted?'赞成':'反对',reason:permitted?'本地规则允许当前范围':'当前授权或确认条件未满足'}));
 return {mode:'local-rules',reviews,allow:permitted};
}
