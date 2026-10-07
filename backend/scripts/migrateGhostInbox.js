const path=require('path');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const Mailbox=require('../src/models/GhostInboxMailbox');
const db=require('../src/config/database');
(async()=>{if(!process.argv.includes('--apply')){console.log('PLAN: add ghostinbox_mailboxes only; run with --apply');return;}await Mailbox.sync({logging:false});console.log('GHOSTINBOX_MIGRATION_OK: additive table; no EmailTick/account changes');})().catch(err=>{console.error('GHOSTINBOX_MIGRATION_FAILED',err.name);process.exitCode=1;}).finally(()=>db.close());
