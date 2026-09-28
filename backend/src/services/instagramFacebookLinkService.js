const { Op, literal } = require('sequelize');
const InstagramAccount = require('../models/InstagramAccount');
const FacebookInstagramLink = require('../models/FacebookInstagramLink');

const nullify = (value) => {
  const text = String(value ?? '').trim();
  return !text || text.toLowerCase() === 'null' ? null : text;
};

const normalizeInstagramUsernames = (input) => {
  const source = Array.isArray(input) ? input : String(input || '').split(/[\r\n,]+/);
  const usernames = source.map((item) => {
    if (item && typeof item === 'object') return nullify(item.uid || item.username || item.instagram_uid);
    return nullify(String(item || '').split('|')[0]);
  }).filter(Boolean).map((value) => value.replace(/^@/, '').slice(0, 255));
  return [...new Set(usernames.map((value) => value.toLowerCase()))];
};

const reportFacebookInstagramLinks = async ({ owner_username, facebookAccount = null, facebook_uid, device_id = null, instagramUsernames = [], transaction = null }) => {
  const usernames = normalizeInstagramUsernames(instagramUsernames);
  const now = new Date();
  if (!usernames.length) return { total: 0, created: 0, updated: 0, usernames: [] };
  const instagramRows = await InstagramAccount.unscoped().findAll({
    attributes: ['id', 'uid'],
    where: { owner_username, kind: 'job', uid: { [Op.in]: usernames } },
    transaction,
  });
  const instagramIds = new Map(instagramRows.map((row) => [String(row.uid).toLowerCase(), row.id]));
  let created = 0;
  let updated = 0;
  for (const instagram_uid of usernames) {
    const [link, wasCreated] = await FacebookInstagramLink.findOrCreate({
      where: { owner_username, facebook_uid, instagram_uid },
      defaults: {
        owner_username,
        facebook_account_id: facebookAccount?.id || null,
        facebook_uid,
        instagram_account_id: instagramIds.get(instagram_uid) || null,
        instagram_uid,
        device_id: device_id || facebookAccount?.device_id || null,
        report_count: 1,
        first_reported_at: now,
        last_reported_at: now,
      },
      transaction,
    });
    if (wasCreated) created += 1;
    else {
      await link.update({
        facebook_account_id: facebookAccount?.id || link.facebook_account_id,
        instagram_account_id: instagramIds.get(instagram_uid) || link.instagram_account_id,
        device_id: device_id || facebookAccount?.device_id || link.device_id,
        report_count: literal('report_count + 1'),
        last_reported_at: now,
      }, { transaction });
      updated += 1;
    }
  }
  return { total: usernames.length, created, updated, usernames };
};

module.exports = { normalizeInstagramUsernames, reportFacebookInstagramLinks };