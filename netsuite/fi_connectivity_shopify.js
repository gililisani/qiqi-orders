/**
 * @NApiVersion 2.x
 * @NScriptType fiConnectivityPlugin
 * @NModuleScope SameAccount
 *
 * QQ Shopify 100501 Feed — Financial Institution Connectivity plug-in.
 *
 * NetSuite's bank-import scheduler calls getTransactionData() (daily /
 * on demand); this implementation pulls the Shopify Payments statement
 * for account 100501 from the Qiqi Hub, which builds it from Shopify's
 * balance-transactions API so every line mirrors exactly one NS posting
 * (per-order payments/refunds, per-payout fees, payout net, marketplace
 * tax, disputes). Format: OFX 2.x → the standard "OFX/QFX Plugin
 * Implementation" parser on the format profile.
 *
 * Auth: NetSuite API secret custsecret_qq_stmt_token (Setup > Company >
 * API Secrets; value = SHOPIFY_STATEMENT_TOKEN from the Hub's Vercel
 * env; restrict the secret to this script). The secret placeholder is
 * resolved by N/https — the token never appears in this file or in logs.
 *
 * Deploy: upload to the File Cabinet → Customization > Plug-ins >
 * Plug-in Implementations > New → select this file (type: Financial
 * Institution Connectivity). Full checklist: netsuite/FI_FEED_DEPLOY.md.
 */
define(['N/https', 'N/log'], function (https, log) {
  var HUB_URL = 'https://partners.qiqiglobal.com'; // Hub production origin
  var BACKLOG_START = '2026-01-01'; // first-ever pull covers the cleaned year

  function isoDay(value, fallback) {
    return value && String(value).length >= 10 ? String(value).slice(0, 10) : fallback;
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function getConfigurationIFrameUrl(context) {
    // No interactive configuration — everything lives in the Hub + the API secret.
    context.configurationIFrameUrl = HUB_URL + '/admin/shopify';
  }

  var ACCOUNTS = [
    { accountMappingKey: 'shopify-payments', displayName: 'Shopify Payments (Qiqi Hub)' },
    { accountMappingKey: 'paypal', displayName: 'PayPal via Shopify (Qiqi Hub)' },
    { accountMappingKey: 'affirm', displayName: 'Affirm via Shopify (Qiqi Hub)' },
  ];

  function getAccounts(context) {
    for (var i = 0; i < ACCOUNTS.length; i++) {
      context.addAccount({
        accountMappingKey: ACCOUNTS[i].accountMappingKey,
        displayName: ACCOUNTS[i].displayName,
        accountType: 'BANK',
        currency: 'USD',
        groupName: 'Shopify',
        lastUpdated: new Date().toISOString().slice(0, 19),
      });
    }
  }

  function getTransactionData(context) {
    var requests = JSON.parse(context.accountRequestsJSON || '[]');
    // ONE Hub call, ONE data chunk: NetSuite concatenates every chunk of a
    // run into a single file, so per-account OFX documents would stack
    // <?xml?> headers mid-file and kill the parser. The Hub returns one
    // OFX with one STMTTRNRS per requested account.
    var params = [];
    for (var i = 0; i < requests.length; i++) {
      var req = requests[i];
      var known = false;
      for (var k = 0; k < ACCOUNTS.length; k++) if (ACCOUNTS[k].accountMappingKey === req.accountMappingKey) known = true;
      if (!known) continue;
      params.push('req=' + req.accountMappingKey + ':' + isoDay(req.dataStartTime, BACKLOG_START) + ':' + isoDay(req.dataEndTime, today()));
    }
    if (params.length > 0) {
      var url = HUB_URL + '/api/shopify/statement?' + params.join('&');
      var auth = https.createSecureString({ input: 'Bearer {custsecret_qq_stmt_token}' });
      var res = https.get({
        url: url,
        headers: { Authorization: auth, Accept: 'application/x-ofx' },
      });
      if (res.code !== 200) {
        log.error('qq-shopify-feed', 'HTTP ' + res.code + ' for ' + params.join(' ') + ': ' + (res.body || '').slice(0, 300));
        if (context.isRetryAllowed && context.isRetryAllowed()) {
          context.retry({ deltaMinutesLater: 30, currentFailureReason: 'Hub returned HTTP ' + res.code });
          return;
        }
        throw new Error('Hub statement request failed: HTTP ' + res.code);
      }
      log.audit('qq-shopify-feed', params.join(' ') + ' → ' + res.body.length + ' chars');
      context.addDataChunk({ dataChunk: res.body });
    }
    context.returnAccountRequestsJSON({ accountsJson: context.accountRequestsJSON });
  }

  function refreshData(context) {
    // "Update Imported Bank Data" asks the institution to PREPARE fresh
    // data; the pull happens in the getTransactionData call NetSuite makes
    // next, with its own context. The Hub is always fresh → acknowledge.
    // (This context has no addDataChunk — fetching here crashes.)
    context.setRefreshRequestId({ refreshRequestId: 'qq-' + new Date().getTime() });
  }

  function getRefreshRequestStatus(context) {
    if (context.returnRefreshRequestStatus) context.returnRefreshRequestStatus({ refreshRequestStatus: 'COMPLETE' });
  }

  return {
    getConfigurationIFrameUrl: getConfigurationIFrameUrl,
    getAccounts: getAccounts,
    getTransactionData: getTransactionData,
    refreshData: refreshData,
    getRefreshRequestStatus: getRefreshRequestStatus,
  };
});
