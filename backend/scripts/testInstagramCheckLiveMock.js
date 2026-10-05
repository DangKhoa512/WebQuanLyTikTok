const assert = require('assert');
const axios = require('axios');
const {
  checkInstagramProfile,
  batchCheckInstagram,
} = require('../src/utils/instagramCheckLiveUtils');

const originalGet = axios.get;

const mockResponse = (url, status, data, headers = {}) => ({
  status,
  data,
  headers,
  config: { url },
  request: { res: { responseUrl: url } },
});

const withMockGet = async (handler, callback) => {
  axios.get = handler;
  try {
    return await callback();
  } finally {
    axios.get = originalGet;
  }
};

const testLiveProfile = async () => withMockGet(
  async (url) => mockResponse(url, 200, '<script>{"username":"live_user","media_count":12,"follower_count":345,"following_count":67}</script>'),
  async () => {
    const result = await checkInstagramProfile('live_user');
    assert.strictEqual(result.live, true);
    assert.strictEqual(result.posts, 12);
    assert.strictEqual(result.followers, 345);
    assert.strictEqual(result.following, 67);
  }
);

const testDeadProfile = async () => withMockGet(
  async (url) => mockResponse(url, 404, "<main><h2>Sorry, this page isn't available.</h2></main>"),
  async () => {
    const result = await checkInstagramProfile('dead_user');
    assert.strictEqual(result.live, false);
    assert.strictEqual(result.reason, 'profile_http_404');
  }
);

const testUnknownProfile = async () => withMockGet(
  async (url) => mockResponse(url, 429, { message: 'Please wait a few minutes' }),
  async () => {
    const result = await checkInstagramProfile('limited_user');
    assert.strictEqual(result.live, null);
    assert.match(result.reason, /rate_limited/);
  }
);

const testPostFallback = async () => withMockGet(
  async (url) => {
    if (url.includes('web_profile_info')) {
      return mockResponse(url, 200, {
        data: {
          user: {
            id: '987654',
            username: 'post_user',
            follower_count: 90,
            following_count: 21,
          },
        },
      });
    }
    if (url.includes('?__a=1')) {
      return mockResponse(url, 200, {
        user: {
          id: '987654',
          username: 'post_user',
          media_count: 27,
          follower_count: 90,
          following_count: 21,
        },
      });
    }
    return mockResponse(url, 200, '<script>{"username":"post_user","follower_count":90,"following_count":21}</script>');
  },
  async () => {
    const result = await checkInstagramProfile('post_user');
    assert.strictEqual(result.live, true);
    assert.strictEqual(result.posts, 27);
    assert.strictEqual(result.followers, 90);
    assert.strictEqual(result.following, 21);
    assert.strictEqual(result.source, 'profile_json');
  }
);

const testCookieFallback = async () => {
  const savedCookie = 'sessionid=fallback-session; csrftoken=fallback-csrf';
  const account = {
    id: 1,
    uid: 'cookie_user',
    cookies: null,
    post_count: null,
    followers: null,
    following: null,
    async update(values) {
      Object.assign(this, values);
    },
  };

  await withMockGet(
    async (url, config) => {
      if (String(config?.headers?.Cookie || '').includes('fallback-session')) {
        return mockResponse(url, 200, '<script>{"username":"cookie_user","media_count":8,"follower_count":120,"following_count":33}</script>');
      }
      return mockResponse(url, 200, '<title>Login - Instagram</title><form action="/accounts/login/ajax/"><input name="username"><input name="password"></form>');
    },
    async () => {
      const checked = await batchCheckInstagram([account], [], 1, 0, [savedCookie]);
      const result = checked.results[0];
      assert.strictEqual(result.result, 'live');
      assert.strictEqual(result.posts, 8);
      assert.strictEqual(result.cookie_fallback_used, true);
      assert.strictEqual(result.cookie_attempts, 1);
      assert.strictEqual(account.live_status, 'live');
      assert.strictEqual(account.post_count, 8);
    }
  );
};

const testRateLimitUsesCookieFallbackToConfirmDie = async () => {
  let requestCount = 0;
  const account = {
    id: 2,
    uid: 'rate_limited_user',
    cookies: null,
    post_count: null,
    followers: null,
    following: null,
    async update(values) {
      Object.assign(this, values);
    },
  };

  await withMockGet(
    async (url, config) => {
      requestCount += 1;
      if (String(config?.headers?.Cookie || '').includes('confirmed-die-session')) {
        return mockResponse(url, 200, '<script>{"pageID":"httpErrorPage","require":[["PolarisErrorRoot.entrypoint"]]}</script>');
      }
      return mockResponse(url, 429, { message: 'Please wait a few minutes' });
    },
    async () => {
      const checked = await batchCheckInstagram(
        [account],
        [],
        20,
        0,
        ['sessionid=confirmed-die-session; csrftoken=confirmed-die-csrf']
      );
      const result = checked.results[0];
      assert.strictEqual(result.result, 'die');
      assert.strictEqual(result.reason, 'authenticated_profile_missing_confirmed');
      assert.strictEqual(result.cookie_fallback_used, true);
      assert.strictEqual(result.cookie_attempts, 1);
      assert.strictEqual(account.live_status, 'die');
      assert.strictEqual(account.status, 'ACCOUNT_DIE');
      assert.strictEqual(requestCount, 5);
    }
  );
};

const testConcurrencyFollowsProxyPool = async () => {
  const accounts = Array.from({ length: 5 }, (_, index) => ({
    id: index + 10,
    uid: 'proxy_user_' + index,
    cookies: null,
    post_count: null,
    followers: null,
    following: null,
    async update(values) {
      Object.assign(this, values);
    },
  }));

  await withMockGet(
    async (url) => mockResponse(url, 200, '<script>{"username":"proxy_user","media_count":1,"follower_count":2,"following_count":3}</script>'),
    async () => {
      const checked = await batchCheckInstagram(
        accounts,
        ['127.0.0.1:8080'],
        20,
        0,
        []
      );
      assert.strictEqual(checked.concurrency, 2);
      assert.strictEqual(checked.results.length, 5);
      assert.ok(checked.results.every((row) => row.result === 'live'));
    }
  );
};

const main = async () => {
  await testLiveProfile();
  await testDeadProfile();
  await testUnknownProfile();
  await testPostFallback();
  await testCookieFallback();
  await testRateLimitUsesCookieFallbackToConfirmDie();
  await testConcurrencyFollowsProxyPool();
  console.log(JSON.stringify({
    ok: true,
    cases: [
      'live_with_stats',
      'die_not_found',
      'unknown_rate_limited',
      'post_count_fallback',
      'settings_cookie_fallback',
      'rate_limit_cookie_fallback_confirms_die',
      'concurrency_follows_proxy_pool',
    ],
  }, null, 2));
};

main().catch((error) => {
  axios.get = originalGet;
  console.error(error);
  process.exit(1);
});
