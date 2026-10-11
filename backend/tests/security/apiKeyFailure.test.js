const assert=require('assert');require('../../src/config/logger').silent=true;
const User=require('../../src/models/User');User.findOne=async()=>{throw new Error('Synthetic connection loss');};
const auth=require('../../src/middleware/apiKeyAuth');
(async()=>{let forwarded;await auth({headers:{'x-api-key':'synthetic'},ip:'local',path:'/test'}, {}, e=>forwarded=e);assert.equal(forwarded.message,'Synthetic connection loss');console.log('API_KEY_DB_FAILURE_OK: database error forwarded, no unhandled rejection');})().catch(e=>{console.error(e);process.exitCode=1;});
