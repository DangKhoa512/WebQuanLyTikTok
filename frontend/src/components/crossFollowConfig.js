export const emptyCrossFollow = () => ({ enabled: false, min: 0, max: 0, usernames: [] });
export const normalizeUsernameList = (values = []) => {
  const seen = new Set();
  return values.map(value => String(value).trim().replace(/^@/, '').toLowerCase()).filter(value => {
    if (!value || seen.has(value.toLowerCase())) return false;
    seen.add(value.toLowerCase()); return true;
  });
};
export const crossFollowError = (action = emptyCrossFollow()) => {
  if (typeof action.enabled !== 'boolean') return 'Trạng thái hoạt động không hợp lệ.';
  if (action.min === '' || action.max === '' || !Number.isSafeInteger(action.min) || !Number.isSafeInteger(action.max) || action.min < 0 || action.max < action.min) return 'Min/Max phải là số nguyên không âm và Min không lớn hơn Max.';
  const usernames = normalizeUsernameList(action.usernames);
  if (usernames.length > 200) return 'Danh sách tối đa 200 username.';
  if (usernames.some(value => value.length > 255 || !/^[a-zA-Z0-9._]+$/.test(value))) return 'Username chỉ gồm chữ, số, dấu chấm hoặc gạch dưới (tối đa 255 ký tự).';
  if (action.enabled && !usernames.length) return 'Cần ít nhất 1 username khi bật hoạt động.';
  if (action.enabled && action.max > usernames.length) return 'Max không được lớn hơn số username trong danh sách.';
  return '';
};
export const serializeCrossFollowSettings = settings => ({ ...settings, scenarios: settings.scenarios.map(scenario => ({ ...scenario, actions: { ...scenario.actions, cross_follow: { ...(scenario.actions.cross_follow || emptyCrossFollow()), usernames: normalizeUsernameList(scenario.actions.cross_follow?.usernames) } } })) });

export const emptyCrossAccountFollow = () => ({ enabled: false, min: 0, max: 0 });
export const crossAccountFollowError = (action = emptyCrossAccountFollow()) => {
  if (typeof action.enabled !== 'boolean' || !Number.isSafeInteger(action.min) || !Number.isSafeInteger(action.max) || action.min < 0 || action.max < action.min || action.max > 200) return 'Min/Max: 0 <= Min <= Max <= 200.';
  return '';
};
