const assert=require('assert');require('../../src/config/logger').silent=true;
const Account=require('../../src/models/Account');Account.update=async()=>{throw new Error('Synthetic cron SQL failure');};
(async()=>{await assert.rejects(require('../../src/services/accountService').runStatusTransitions(),/Synthetic cron SQL failure/);console.log('CRON_FAILURE_PROPAGATION_OK');})().catch(e=>{console.error(e);process.exitCode=1;});
