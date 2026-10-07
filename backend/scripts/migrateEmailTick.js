require('dotenv').config({path:require('path').resolve(__dirname,'../.env')});
const db=require('../src/config/database');
const Mailbox=require('../src/models/EmailTickMailbox');
(async()=>{
 if(!process.argv.includes('--apply')){console.log('Plan: create emailtick_mailboxes only; no existing provider tables or data changed. Use --apply.');return;}
 await Mailbox.sync({logging:false});
 console.log('EMAILTICK_MIGRATION_OK: additive mailbox table; existing accounts/OTP providers untouched');
})().catch(err=>{console.error('EmailTick migration failed: '+err.name);process.exitCode=1;}).finally(()=>db.close());
