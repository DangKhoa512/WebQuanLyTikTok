const state = {
  status: 'STARTING',
  last_run_at: null,
  next_run_at: null,
  duration_ms: null,
  last_result: { nurture_reset: 0, page_job_reset: 0, account_reset: 0 },
  last_error: null,
};

const markStarted = () => {
  state.status = 'RUNNING';
  state.last_error = null;
};

const markCompleted = ({ startedAt, result = {} }) => {
  const now = new Date();
  state.status = 'ONLINE';
  state.last_run_at = now.toISOString();
  state.next_run_at = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  state.duration_ms = now.getTime() - startedAt.getTime();
  state.last_result = { ...state.last_result, ...result };
};

const markFailed = ({ startedAt, error }) => {
  const now = new Date();
  state.status = 'WARNING';
  state.last_run_at = now.toISOString();
  state.next_run_at = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  state.duration_ms = now.getTime() - startedAt.getTime();
  state.last_error = error?.message || String(error || 'Unknown error');
};

const getSchedulerState = () => {
  const stale = !state.last_run_at || Date.now() - new Date(state.last_run_at).getTime() > 10 * 60 * 1000;
  return { ...state, status: stale && state.status !== 'RUNNING' ? 'WARNING' : state.status };
};

module.exports = { markStarted, markCompleted, markFailed, getSchedulerState };
