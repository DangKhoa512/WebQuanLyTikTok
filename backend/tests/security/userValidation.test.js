const assert=require('assert'),User=require('../../src/models/User');
let writes=0;User.findByPk=async()=>({id:1,username:'synthetic',role:'user',is_active:true,update:async()=>{writes++;}});
const ctrl=require('../../src/controllers/userController');
const invoke=async body=>{let result;await ctrl.updateUser({admin:{role:'admin'},params:{id:1},body},{status(n){this.code=n;return this;},json(data){result={status:this.code||200,data};}},e=>{throw e;});return result;};
(async()=>{assert.equal((await invoke({is_active:'false'})).status,400);assert.equal(writes,0);assert.equal((await invoke({is_active:false})).status,200);assert.equal(writes,1);assert.equal((await invoke({role:'invalid'})).status,400);console.log('USER_VALIDATION_OK');})().catch(e=>{console.error(e);process.exitCode=1;});
