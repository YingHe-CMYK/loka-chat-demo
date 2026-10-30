import {PrivyClient} from '@privy-io/node';
export function createIdentity(appId,appSecret){
 const client=new PrivyClient({appId,appSecret,timeout:10000,maxRetries:1});
 return async token=>{
  const claims=await client.utils().auth().verifyAccessToken(token);
  const user=await client.users()._get(claims.user_id);
  if(user.id!==claims.user_id)throw Error('Subject mismatch');
  const linked=user.linked_accounts||[];
  return {subject:claims.user_id,email:linked.find(x=>x.type==='email')?.address||null,
   wallets:linked.filter(x=>x.type==='wallet'&&x.wallet_client_type==='privy'&&x.chain_type==='ethereum').map(x=>({address:x.address,chainType:x.chain_type}))};
 };
}
