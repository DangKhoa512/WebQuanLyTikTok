// Test-only HTTP server. Auth is mocked; never connects to DB or stores a secret.
Date.now = () => 45000;
const User = require('../src/models/User');
User.findOne = async ({where}) => where.username === 'totp_test_user' ? {username:where.username,is_active:true} : null;
const db = require('../src/config/database');
db.query = async () => { throw Error('No database access in TOTP test'); };
const express=require('express'),app=express();app.use('/api/totp',require('../src/routes/totp'));
const server=app.listen(0,'127.0.0.1',()=>process.send({url:'http://127.0.0.1:'+server.address().port}));
process.on('message',message=>{
 if(message==='near') { const started=process.hrtime.bigint();Date.now=()=>57000+Number((process.hrtime.bigint()-started)/1000000n);process.send({clockReady:true}); }
 if(message==='stop')server.close(()=>process.exit(0));
});
