/**
 * @NApiVersion 2.x
 * @NScriptType plugintypeimpl
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
  var ACCOUNT_KEY = 'shopify-payments'; // must equal the OFX ACCTID the Hub emits
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

  function getAccounts(context) {
    context.addAccount({
      accountMappingKey: ACCOUNT_KEY,
      displayName: 'Shopify Payments (Qiqi Hub)',
      accountType: 'BANK',
      currency: 'USD',
      groupName: 'Shopify',
      lastUpdated: new Date().toISOString().slice(0, 19),
    });
  }

  function getTransactionData(context) {
    var requests = JSON.parse(context.accountRequestsJSON || '[]');
    for (var i = 0; i < requests.length; i++) {
      var req = requests[i];
      if (req.accountMappingKey !== ACCOUNT_KEY) continue;
      var from = isoDay(req.dataStartTime, BACKLOG_START);
      var to = isoDay(req.dataEndTime, today());
      var url = HUB_URL + '/api/shopify/statement?from=' + from + '&to=' + to;
      var res = https.get({
        url: url,
        headers: { Authorization: 'Bearer {custsecret_qq_stmt_token}', Accept: 'application/x-ofx' },
      });
      if (res.code !== 200) {
        log.error('qq-shopify-feed', 'HTTP ' + res.code + ' for ' + from + '..' + to + ': ' + (res.body || '').slice(0, 300));
        if (context.isRetryAllowed && context.isRetryAllowed()) {
          context.retry({ deltaMinutesLater: 30, currentFailureReason: 'Hub returned HTTP ' + res.code });
          return;
        }
        throw new Error('Hub statement request failed: HTTP ' + res.code);
      }
      log.audit('qq-shopify-feed', 'statement ' + from + '..' + to + ' → ' + res.body.length + ' chars');
      context.addDataChunk({ dataChunk: res.body });
    }
    context.returnAccountRequestsJSON({ accountsJson: context.accountRequestsJSON });
  }

  function refreshData(context) {
    // On-demand refresh (Update Imported Bank Data button) — same pull, no async job to track.
    getTransactionData(context);
    if (context.setRefreshRequestId) context.setRefreshRequestId({ refreshRequestId: 'qq-' + Date.now() });
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
