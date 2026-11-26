export function phase({takeover=false,correcting=false,busy=false,mode='listen'}={}) {
 if(takeover)return 'takeover'; if(busy)return 'thinking';if(correcting)return 'correcting';if(mode==='speak')return 'responding';if(mode==='wait')return 'waiting';return 'listening';
}
export const labels={waiting:'Waiting for you',listening:'Listening · text',thinking:'Thinking',responding:'Responding · text only',correcting:'Listening to your correction',takeover:'You are in control'};
export function correctionText(value){return `I am correcting your understanding. Treat this as my clarification for this conversation, not an established global trait. Reconsider your next question and proposed action using this correction: ${value}`;}
