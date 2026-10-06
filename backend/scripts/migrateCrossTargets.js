// Additive/idempotent: create only Cross Target tables; keep legacy history unchanged.
require('dotenv').config({ path: require('path').resolve(__dirname,'../.env') });
const db=require('../src/config/database');
const Cycle=require('../src/models/CrossTargetCycle'),Batch=require('../src/models/CrossTargetBatch'),History=require('../src/models/CrossTargetHistory');
const Legacy=require('../src/models/FacebookFriendSuggestion'),Account=require('../src/models/FacebookAccount');
const {importLegacy,getScope}=require('../src/services/crossTargetService');
(async()=>{
 if(!process.argv.includes('--apply')){console.log('Plan: create cross_target_cycles/batches/history; import old Facebook issued targets into cycle 1 by source; retain old history. Use --apply.');return;}
 await Cycle.sync();await Batch.sync();await History.sync();
 const sources=await Legacy.findAll({attributes:['owner_username','source_account_id'],group:['owner_username','source_account_id'],raw:true});
 for(const source of sources) await db.transaction(async transaction=>{
  const account=await Account.unscoped().findOne({where:{id:source.source_account_id,owner_username:source.owner_username},transaction,lock:transaction.LOCK.UPDATE});
  if(!account)return;
  const scope=getScope({owner:source.owner_username,platform:'FACEBOOK',sourceAccountId:Number(source.source_account_id)});
  const [cycle]=await Cycle.findOrCreate({where:scope,defaults:scope,transaction});
  await importLegacy(scope,cycle,transaction);
 });
 console.log('CROSS_TARGET_MIGRATION_OK: additive tables, idempotent legacy import, original history retained');
})().catch(err=>{console.error('Cross Target migration failed: '+err.name);process.exitCode=1;}).finally(()=>db.close());
