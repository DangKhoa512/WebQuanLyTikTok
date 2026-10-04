const TASK_TYPES = [
  'PAGE_JOB',
  'INSTAGRAM_JOB',
  'REG_PAGE',
  'REG_INSTAGRAM',
  'NUOI_FACEBOOK',
  'NUOI_INSTAGRAM',
];

const DEFAULT_TASK_DISPATCHER = {
  lock_timeout_minutes: 30,
  max_retry: 3,
  tasks: {
    PAGE_JOB: { priority: 100, enabled: true },
    INSTAGRAM_JOB: { priority: 90, enabled: true },
    REG_PAGE: { priority: 80, enabled: true },
    REG_INSTAGRAM: { priority: 70, enabled: true },
    NUOI_FACEBOOK: { priority: 60, enabled: true },
    NUOI_INSTAGRAM: { priority: 50, enabled: true },
  },
};

const RETRYABLE_ERRORS = new Set(['TIMEOUT', 'NETWORK_ERROR', 'APP_OPEN_FAIL']);
const NON_RETRYABLE_ERRORS = new Set(['ACCOUNT_DIE', 'CHECKPOINT', 'INVALID_ACCOUNT']);

module.exports = { TASK_TYPES, DEFAULT_TASK_DISPATCHER, RETRYABLE_ERRORS, NON_RETRYABLE_ERRORS };
