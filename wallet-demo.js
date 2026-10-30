// Preview only: no keys, signing provider, RPC or real funds.
export function ensureWallet(s){
 if(s.profile&&!s.wallet)s.wallet={id:crypto.randomUUID(),mode:'demo',balance:100,transactions:[],recovery:false};
 return s;
}
export function transact(w,request){
 if(!request||!['transfer','approval'].includes(request.kind))throw Error('No pending request');
 const amount=Number(request.amount);
 if(!Number.isFinite(amount)||amount<=0||amount>w.balance)throw Error('Enter an amount within your demo balance.');
 const tx={id:crypto.randomUUID(),kind:request.kind,amount,to:'Demo recipient',date:new Date().toISOString(),status:'Simulated'};
 return {...w,balance:w.balance-(request.kind==='transfer'?amount:0),transactions:[tx,...w.transactions]};
}
export function walletView(kind,w,{button,row,esc}){
 const note='<p class="fine">Simulated wallet · No blockchain connection or real funds.</p>';
 const details=(items)=>`<dl class="wallet-details">${items.map(([a,b])=>`<div><dt>${a}</dt><dd>${esc(String(b))}</dd></div>`).join('')}</dl>`;
 if(kind==='wallet')return `<div class="wallet-hero"><span>YOUR WALLET · PREVIEW</span><h2>${w.balance} <small>DEMO</small></h2><p>Created with your account</p></div><div class="wallet-actions">${button('wallet-receive','Receive','secondary')}${button('wallet-send','Send','primary')}</div><div class="menu-group">${row('wallet-transactions','clock','Transactions',`${w.transactions.length} simulated transactions`)}${row('wallet-approval','shield','Try asset approval','A separate signature for every request')}${row('wallet-recovery','shield','Account recovery',w.recovery?'Recovery walkthrough completed':'See how recovery works')}</div><p class="fine">QB usage credits are separate from this wallet balance.</p>${note}`;
 if(kind==='wallet-receive')return `<h2>Your wallet address.</h2><p class="secondary">An address and receive code will appear here after a wallet provider is connected.</p><div class="wallet-code"><img src="wallet-preview-qr.svg" width="176" height="176" alt="Preview QR code containing only the text Loka wallet demo, not a payment address"></div><p class="fine">Preview code only. Do not send funds.</p>${details([['Wallet ID',w.id],['Network','Not connected'],['On-chain address','Not created in this demo']])}${button('wallet-copy','Copy demo wallet ID','primary full')}${note}`;
 if(kind==='wallet-send'||kind==='wallet-approval')return `<h2>${kind==='wallet-send'?'Send a demo payment.':'Approve a spending limit.'}</h2>${details([['Recipient',kind==='wallet-send'?'Demo recipient':'Demo service'],['Asset','DEMO'],['Available',w.balance]])}<label for="wallet-amount">${kind==='wallet-send'?'Amount':'Maximum allowance'}</label><input id="wallet-amount" class="register-input" type="number" min="0.01" step="0.01" max="${w.balance}" value="1"><p id="wallet-error" role="alert"></p>${button(kind==='wallet-send'?'wallet-review-transfer':'wallet-review-approval','Review request','primary full')}${note}`;
 if(kind==='wallet-transactions')return `<h2>Transactions.</h2>${w.transactions.length?w.transactions.map(t=>`<div class="wallet-transaction"><b>${t.kind==='transfer'?'Sent':'Allowance approved'} · ${t.amount} DEMO</b><p>${esc(new Date(t.date).toLocaleString())} · Simulated</p><small>${esc(t.id)}</small></div>`).join(''):'<p class="secondary">No transactions yet. Reviewing or cancelling a request does not create a transaction.</p>'}${note}`;
 if(kind==='wallet-recovery')return `<h2>Keep access to your wallet.</h2><p class="secondary">With a connected wallet service, you would verify your account on a new device before recovering access. Your private key would never appear here.</p>${details([['1. Verify account','Identity check'],['2. Recover access','Protected wallet service'],['3. Return','Same wallet and assets']])}${button('wallet-recovery-start','Try recovery walkthrough','primary full')}${note}`;
 if(kind==='wallet-recovery-verify')return `<h2>Verify your account.</h2><p class="secondary">This preview simulates a successful identity check. It does not configure real recovery or protect this browser’s data.</p>${button('wallet-recovery-finish','Simulate verification','primary full')}${button('wallet','Cancel','text-button full')}`;
 return '';
}
