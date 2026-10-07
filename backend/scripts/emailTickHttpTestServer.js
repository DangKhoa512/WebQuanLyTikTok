// Separate process serves real AutoTouch curl requests; only disposable test DB is allowed.
if(!/^quanly_emailtick_test_[0-9]+_[a-f0-9]+$/.test(process.env.DB_NAME||''))throw Error('Unsafe test database');
const express=require('express'),provider=express();provider.use(express.json());
const providerServer=provider.listen(0,'127.0.0.1',()=>{
 process.env.EMAILTICK_BASE_URL='http://127.0.0.1:'+providerServer.address().port;
 provider.post('/get-mailbox',(req,res)=>res.json({success:true,email:'child@example.test',code:'synthetic-child-mailbox-key'}));
 provider.post('/activate-email',(req,res)=>res.json({success:true}));
 provider.post('/get-emails',(req,res)=>res.json({success:true,emails:[{code:'child-message-id',fromName:'Instagram',subject:'041374 is your Instagram code',time:Math.floor(Date.now()/1000)}]}));
 const logger=require('../src/config/logger');for(const key of ['info','warn','error','debug'])logger[key]=()=>{};
 const app=require('../src/app'),server=app.listen(0,'127.0.0.1',()=>process.send({url:'http://127.0.0.1:'+server.address().port}));
 process.on('message',message=>{if(message==='stop')server.close(()=>providerServer.close(()=>require('../src/config/database').close().then(()=>process.exit(0))));});
});
