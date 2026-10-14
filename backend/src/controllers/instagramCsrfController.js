const { Op } = require('sequelize');
const db = require('../config/database');
const Account = require('../models/InstagramAccount');
const credentials = require('../services/instagramCredentials');
const csrf = require('../services/instagramCsrfService');
const { ownerFromAdmin } = require('../utils/owner');
const { success, error } = require('../utils/response');

exports.fetchMissing = async (req, res, next) => {
  try {
    const owner = ownerFromAdmin(req);
    const ids = req.body.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 5 ||
        !ids.every(id => Number.isSafeInteger(id) && id > 0)) {
      return error(res, 'Chon tu 1 den 5 account moi request', 400);
    }
    const transport = await csrf.proxyOptions(owner, true);
    if (transport.blocked) return error(res, transport.warning, 400);
    const accounts = await Account.findAll({
      where: { owner_username: owner, id: { [Op.in]: [...new Set(ids)] } },
      attributes: ['id', 'uid', 'cookies', 'token'],
    });
    const results = [];
    for (const account of accounts) {
      const originalCookie = account.cookies;
      if (!originalCookie || csrf.cookieValue(originalCookie, 'csrftoken')) {
        results.push({ id: account.id, status: 'skipped', reason: originalCookie ? 'ALREADY_PRESENT' : 'NO_COOKIE' });
        continue;
      }
      let checked;
      try {
        checked = await credentials.patchAndEnrich({ cookies: originalCookie, token: account.token },
          { owner, requireProxy: true, enabled: true });
      } catch (_) {
        results.push({ id: account.id, status: 'failed', reason: 'INVALID_COOKIE' });
        continue;
      }
      if (!checked.warnings.includes('CSRF_TOKEN_FETCHED')) {
        results.push({ id: account.id, status: 'failed', reason: checked.warnings.at(-1) || 'CSRF_TOKEN_NOT_RECEIVED', ...checked.csrf_metadata });
        continue;
      }
      // Network happens before the lock; recheck to preserve newer credentials.
      const saved = await db.transaction(async transaction => {
        const current = await Account.findOne({
          where: { id: account.id, owner_username: owner },
          attributes: ['id', 'cookies', 'token'], transaction, lock: transaction.LOCK.UPDATE,
        });
        if (!current || current.cookies !== originalCookie || current.token !== account.token) return false;
        await current.update({ cookies: checked.values.cookies }, { transaction });
        return true;
      });
      results.push({ id: account.id, status: saved ? 'success' : 'skipped', reason: saved ? 'CSRF_TOKEN_FETCHED' : 'COOKIE_CHANGED', ...checked.csrf_metadata });
    }
    res.set('Cache-Control', 'no-store');
    return success(res, { results: results.map(result => ({ ...result, uid: accounts.find(account => account.id === result.id)?.uid })), success: results.filter(r => r.status === 'success').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length }, 'Da xu ly csrftoken');
  } catch (err) { next(err); }
};
