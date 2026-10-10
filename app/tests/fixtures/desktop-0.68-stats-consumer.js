// Test-only excerpts from Javis603/token-monitor v0.68.0 (MIT), commit 5d2db368d8313415763860d594de00e46a663418.
// Preserve upstream behavior when updating this fixture; not shipped in the NAS image.
function restartTimer() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  const interval = state.streamConnected
    ? 5 * 60 * 1000
    : Number(state.settings?.refreshMs || 15000);
  state.refreshTimer = setInterval(refreshStats, interval);
}

window.tokenMonitor.onStatsPush?.((payload) => {
  if (!payload) return;
  const wasStreamConnected = state.streamConnected;
  if (payload.event === 'status') {
    state.streamConnected = Boolean(payload.data?.connected);
    if (payload.data?.mode) state.mode = payload.data.mode;
    if (payload.data?.icloud) state.icloudStatus = payload.data.icloud;
    state.streamFailure = state.streamConnected ? null : (payload.data?.reason ? { reason: payload.data.reason, detail: payload.data.detail ?? null } : state.streamFailure);
  } else if (payload.data?.stats) {
    // Local collector overlays update client-mode data independently of the
    // Hub SSE transport. Preserve its current Offline/error state until a
    // real stream status or remote stats event proves the connection changed.
    if (payload.data?.reason !== 'local' && payload.data?.reason !== 'presentation') {
      state.streamConnected = true;
      state.streamFailure = null;
    }
    if (payload.data?.mode) state.mode = payload.data.mode;
    if (payload.data?.icloud) state.icloudStatus = payload.data.icloud;
    allTimeSessions.invalidate();
    state.stats = sessionStatsForDisplay(allTimeSessions.attach(payload.data.stats));
    observeLiveTokenRate(state.stats);
    observeDisplayLiveTokenRates(state.stats);
    applyCodexActiveAccountFromStats();
    // Progressive mid-tick pushes never carry a fresh history scan (see
    // AGENTS.md collector notes), so only the final push can retire the
    // "just turned trends on" loading state without a flash back to empty.
    if (payload.data?.reason !== 'progress') state.trendsActivating = false;
  } else {
    return;
  }
  if (payload.event === 'status') {
    if (isRendererWindowHidden()) statsRenderScheduler.request();
    else renderConnectionStatus();
  }
  if (!wasStreamConnected && state.streamConnected && state.settings?.hubMode === 'client') {
    void refreshHubBuildStatus();
    void syncContentForm?.refresh();
  }
  if (payload.data?.stats) {
    if (fixedPeriodRangesApi.isDerived(state.period)) {
      // Keep the currently rendered range stable while a new History revision is
      // fetched; repaint once with the coherent snapshot instead of flashing an
      // intermediate loading layout.
      if (fixedPeriodHistoryNeedsWarmup()) {
        void warmFixedPeriodHistory({ renderOnComplete: true });
      } else {
        statsRenderScheduler.request();
      }
    } else {
      statsRenderScheduler.request();
      void warmFixedPeriodHistory({ renderOnComplete: false });
    }
    maybeUpdateBarsIcon();
  }
  restartTimer();
});
