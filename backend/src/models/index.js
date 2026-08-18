// Central model registry
const Account       = require('./Account');
const ChromeAccount = require('./ChromeAccount');
const User          = require('./User');
const UsedAccount   = require('./UsedAccount');
const AccountGroup  = require('./AccountGroup');
const JobAccount    = require('./JobAccount');
const JobDailyStat  = require('./JobDailyStat');
const AppSetting    = require('./AppSetting');
const MachineApiConfig = require('./MachineApiConfig');
const ChromeKhangDailyLog = require('./ChromeKhangDailyLog');
const AppKhangDailyLog = require('./AppKhangDailyLog');

module.exports = { Account, ChromeAccount, User, UsedAccount, AccountGroup, JobAccount, JobDailyStat, AppSetting, MachineApiConfig, ChromeKhangDailyLog, AppKhangDailyLog };
