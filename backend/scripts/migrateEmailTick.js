require('dotenv').config({path:require('path').resolve(__dirname,'../.env')});
const db=require('../src/config/database');
(async()=>{
 if(!process.argv.includes('--apply')){console.log('Plan: create emailtick_mailboxes if missing; add nullable transport_context if missing. Existing mailbox data is retained. Use --apply.');return;}
 await require('../src/services/emailTickMigration').up();
 console.log('EMAILTICK_MIGRATION_OK: additive mailbox table/context; existing accounts/OTP providers untouched');
})().catch(err=>{console.error('EmailTick migration failed: '+err.name);process.exitCode=1;}).finally(()=>db.close());
