// All external provider responses and mailbox credentials below are synthetic test fixtures.
const assert=require('assert');
const {getEmailTickConfig}=require('../src/config/emailtick');
const {createEmailTickService,resolveTypes,extractOtp}=require('../src/services/emailTickService');
(async()=>{
 const config=getEmailTickConfig({EMAILTICK_ALLOWED_TYPES:'1,2,3,4,5',EMAILTICK_RANDOM_TYPES:'3,4,5'});
 for(const [input,expected] of [[1,[1]],[2,[2]],['1,2',[1,2]],[[1,2],[1,2]],['1,2,2',[1,2]],[[3,3,4,4,5],[3,4,5]]])assert.deepEqual(resolveTypes(input,undefined,config),expected);
 for(let i=0;i<30;i++){const one=resolveTypes('random',undefined,config);assert.equal(one.length,1);assert(config.randomTypes.includes(one[0]));const two=resolveTypes('random',2,config);assert.equal(new Set(two).size,2);assert(two.every(type=>config.randomTypes.includes(type)));}
 assert.equal(resolveTypes('random',100,config).length,3);
 for(const input of [undefined,null,{},[],false,'','1,','0',999,'999',[1,null],[1,NaN],1.5,'1.5','1e0'])assert.throws(()=>resolveTypes(input,undefined,config),err=>err.code==='INVALID_EMAIL_TYPE');
 assert.throws(()=>resolveTypes('random',0,config));assert.throws(()=>resolveTypes('random','2',config));
 assert.deepEqual(resolveTypes('random',undefined,getEmailTickConfig({EMAILTICK_ALLOWED_TYPES:'2,7',EMAILTICK_RANDOM_TYPES:'7'})),[7]);
 for(const env of [{EMAILTICK_ALLOWED_TYPES:'1,,2'},{EMAILTICK_RANDOM_TYPES:'999'},{EMAILTICK_TIMEOUT_MS:'bad'},{EMAILTICK_BASE_URL:'invalid'}])assert.throws(()=>getEmailTickConfig(env),err=>err.code==='EMAILTICK_CONFIG_ERROR'&&err.statusCode===503);
 const time=1791332942;
 const inbox=[{code:'id-old',fromName:'Instagram',subject:'111111 is your Instagram code',time:time-10},{code:'id-other',fromName:'Shop',subject:'222222',time:time+1},{code:'id-new',fromName:'Instagram',subject:'041374 is your Instagram code',time}];
 assert.equal(extractOtp(inbox,{nowSeconds:time+2}).code,'041374');assert.equal(typeof extractOtp(inbox,{nowSeconds:time+2}).code,'string');
 assert.equal(extractOtp(inbox,{lastEmailTime:time,processedMessageCodes:['id-new'],nowSeconds:time+2}),null);
 assert.equal(extractOtp(inbox,{minimumTime:time+1,nowSeconds:time+2}),null);
 assert.equal(extractOtp([]),null);
 assert.equal(extractOtp([{code:'m-fb',fromName:'Facebook',subject:'654321 is your code',time}],{provider:'facebook',nowSeconds:time}).code,'654321');
 assert.throws(()=>extractOtp(inbox,{provider:'unknown'}));
 const ties=[{code:'tie-a',fromName:'Instagram',subject:'000001',time},{code:'tie-b',fromName:'Instagram',subject:'000002',time}];
 assert.equal(extractOtp(ties,{lastEmailTime:time,processedMessageCodes:['tie-a'],nowSeconds:time}).messageCode,'tie-b');
 assert.equal(extractOtp(ties,{lastEmailTime:time,processedMessageCodes:['tie-a','tie-b'],nowSeconds:time}),null);
 const withoutId={fromName:'Instagram',subject:'000003',time};const fallback=extractOtp([withoutId],{nowSeconds:time});assert(fallback.messageCode);assert.equal(extractOtp([withoutId],{lastEmailTime:time,processedMessageCodes:[fallback.messageCode],nowSeconds:time}),null);
 assert.equal(extractOtp([{...inbox[2],time:time+2}],{lastMessageCode:'id-new',nowSeconds:time+2}),null);
 const json=data=>({status:200,headers:{'content-type':'application/json'},data:JSON.stringify(data)});
 let calls=0,delay=[];
 const retryProvider=createEmailTickService({config,http:{post:async()=>{calls++;if(calls<3)throw Object.assign(Error('synthetic timeout'),{code:'ECONNABORTED'});return json({success:true,emails:[]});}},sleep:async ms=>delay.push(ms)});
 assert.deepEqual(await retryProvider.getEmails('mail@example.test','synthetic-key'),[]);assert.equal(calls,3);assert.deepEqual(delay,[250,500]);
 for(const [response,expected] of [[{status:403,headers:{'content-type':'text/html'},data:'<title>Just a moment...</title>Enable JavaScript and cookies to continue'},'EMAILTICK_CLOUDFLARE_CHALLENGE'],[{status:200,headers:{'content-type':'text/html'},data:'<html>Unknown HTML</html>'},'EMAILTICK_INVALID_RESPONSE'],[json({success:false}),'EMAILTICK_ERROR'],[json({success:false,error:'INVALID_MAILBOX'}),'INVALID_MAILBOX'],[json({success:true,emails:{}}),'EMAILTICK_INVALID_RESPONSE'],[{status:200,headers:{'content-type':'application/json'},data:'not json'},'EMAILTICK_INVALID_RESPONSE']]){
  calls=0;const provider=createEmailTickService({config,http:{post:async()=>{calls++;return response;}},sleep:async()=>{}});
  await assert.rejects(()=>provider.getEmails('mail@example.test','synthetic-key'),err=>err.code===expected);assert.equal(calls,1,'Do not retry invalid schemas/input/challenge');
 }
 calls=0;const failed=createEmailTickService({config,http:{post:async()=>{calls++;return{status:503,headers:{'content-type':'text/plain'},data:'Temporarily unavailable'};}},sleep:async()=>{}});await assert.rejects(()=>failed.getEmails('mail@example.test','synthetic-key'));assert.equal(calls,3,'Bound 5xx retries');
 const checked=createEmailTickService({config,http:{post:async(url,body,options)=>{assert.equal(options.timeout,15000);assert.equal(options.maxRedirects,0);assert.equal(options.headers.Origin,config.baseUrl);assert.equal(options.headers.Referer,config.baseUrl+'/');assert(options.headers['Content-Type']);return json({success:true,email:'mail@example.test',code:'synthetic-key'});}}});
 assert.deepEqual(await checked.createMailbox([1,2]),{email:'mail@example.test',mailboxCode:'synthetic-key'});
 const invalidCreate=createEmailTickService({config,http:{post:async()=>json({success:true,email:'not-an-email',code:'synthetic-key'})}});await assert.rejects(()=>invalidCreate.createMailbox([1]),err=>err.code==='EMAILTICK_INVALID_RESPONSE');
 const install=require('../../tools/autotouch/emailtick');const API={};let callsClient=0,sleepCalls=0;
 const options={getBaseUrl:()=> 'https://vps.example/api',getApiKey:()=>"test'key",exec:command=>{assert(!command.includes('emailtick.com'));assert(command.includes('/api/emailtick'));return command.includes('/new')?JSON.stringify({success:true,mailbox_id:'id-test',email:'mail@example.test',types:[4]}):JSON.stringify(++callsClient<3?{success:true,status:'WAITING',code:null}:{success:true,status:'RECEIVED',code:'041374'});},safeParse:JSON.parse,sleep:seconds=>{assert.equal(seconds,5);sleepCalls++;}};
 install(API,options);assert.equal(API._EmailTick_New('random').email,'mail@example.test');assert.equal(API._EmailTick_GetCode('id-test'),'041374');assert.equal(sleepCalls,2);
 callsClient=0;options.exec=()=>{callsClient++;return JSON.stringify({success:true,status:'WAITING',code:null});};install(API,options);assert.equal(API._EmailTick_GetCode('id-test'),0);assert.equal(callsClient,12);
 for(const response of [{success:false,error:'EMAILTICK_CLOUDFLARE_CHALLENGE'},{success:true,status:'TIMEOUT'},{success:true,status:'RECEIVED',code:41374}]){options.exec=()=>JSON.stringify(response);install(API,options);assert.equal(API._EmailTick_GetCode('id-test'),0);}
 console.log('EMAILTICK_UNIT_OK: types/config/random, newest/sender/time/message filter, leading zero, empty inbox, retries/schema/Cloudflare, headers/timeouts, AutoTouch bounded polling');
})().catch(err=>{console.error(err.stack);process.exitCode=1;});
