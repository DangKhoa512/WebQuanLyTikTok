const {BUILTIN_TASKS}=require('./taskRegistryPolicy');
const TASK_TYPES=BUILTIN_TASKS.map(task=>task.task_key);
const DEFAULT_TASK_DISPATCHER={lock_timeout_minutes:30,max_retry:3,tasks:Object.fromEntries(BUILTIN_TASKS.map(task=>[task.task_key,{priority:task.priority,enabled:true}]))};

const RETRYABLE_ERRORS = new Set(['TIMEOUT', 'NETWORK_ERROR', 'APP_OPEN_FAIL']);
const NON_RETRYABLE_ERRORS = new Set(['ACCOUNT_DIE', 'CHECKPOINT', 'INVALID_ACCOUNT']);

module.exports = { TASK_TYPES, DEFAULT_TASK_DISPATCHER, RETRYABLE_ERRORS, NON_RETRYABLE_ERRORS };
