// ── State ──
let db = null;
let allSessions = [];
let sessionMap = new Map(); // O(1) session lookup by id
let allToolNames = []; // unique tool names across all sessions
let allCategories = []; // unique request categories
let allRequestTypes = []; // unique request types
let allProjects = []; // unique visitor project names
let allVisitorTypes = []; // unique visitor types
let allLanguages = []; // unique visitor languages
let currentSessionId = null;
let realtimeChannel = null;
let environments = []; // parsed from window.CHAT_VIEW_CONFIG

// Lazy-loading state
let sessionCursor = null;    // ISO timestamp of oldest loaded session (for pagination)
let isLoadingMore = false;   // guard against concurrent scroll-loads
let noMoreSessions = false;  // true when server returned fewer than requested
let filtersApplied = false;  // true when server-side filters are active
let currentFilterParams = null; // stored RPC params when filters are applied (for loadMore)
let searchResults = null;       // non-null when server-side session_id search is active
let searchDebounceTimer = null; // debounce timer for search input
let renderDebounceTimer = null; // debounce timer for client-side filter changes

// ── DOM Elements ──
const loginPanel = document.getElementById('login-panel');
const chatPanel = document.getElementById('chat-panel');
const connectBtn = document.getElementById('connect-btn');
const loginError = document.getElementById('login-error');
const usersModalOverlay = document.getElementById('users-modal-overlay');
const usersModalBody = document.getElementById('users-modal-body');
const usersModalClose = document.getElementById('users-modal-close');
const refreshBtn = document.getElementById('refresh-btn');
const sessionSearch = document.getElementById('session-search');
const sessionCount = document.getElementById('session-count');
const sessionList = document.getElementById('session-list');
const chatMain = document.getElementById('chat-main');
const chatEmpty = document.getElementById('chat-empty');
const filterPanel = document.getElementById('filter-panel');
const filterDateFrom = document.getElementById('filter-date-from');
const filterDateTo = document.getElementById('filter-date-to');
const filterMsgMin = document.getElementById('filter-msg-min');
const filterMsgMax = document.getElementById('filter-msg-max');
const filterToolsTrigger = document.getElementById('filter-tools-trigger');
const filterToolsPanel = document.getElementById('filter-tools-panel');
const filterSort = document.getElementById('filter-sort');
const filterCategoryTrigger = document.getElementById('filter-category-trigger');
const filterCategoryPanel = document.getElementById('filter-category-panel');
const filterRequestTypeTrigger = document.getElementById('filter-request-type-trigger');
const filterRequestTypePanel = document.getElementById('filter-request-type-panel');
const filterProjectTrigger = document.getElementById('filter-project-trigger');
const filterProjectPanel = document.getElementById('filter-project-panel');
const filterVisitorTypeTrigger = document.getElementById('filter-visitor-type-trigger');
const filterVisitorTypePanel = document.getElementById('filter-visitor-type-panel');
const filterLanguageTrigger = document.getElementById('filter-language-trigger');
const filterLanguagePanel = document.getElementById('filter-language-panel');
const filterValidation = document.getElementById('filter-validation');
const filterWhatsapp = document.getElementById('filter-whatsapp');
const filterHasLead = document.getElementById('filter-has-lead');
const filterHasCase = document.getElementById('filter-has-case');
const filterHasBooking = document.getElementById('filter-has-booking');
const filterReviewed = document.getElementById('filter-reviewed');
const filterClear = document.getElementById('filter-clear');
const filterApply = document.getElementById('filter-apply');
const filterDateWarning = document.getElementById('filter-date-warning');
const filterIconBtn = document.getElementById('filter-icon-btn');
const filterPopoverOverlay = document.getElementById('filter-popover-overlay');
const filterPopoverClose = document.getElementById('filter-popover-close');
const filterTagsBar = document.getElementById('filter-tags-bar');
const timeGateEl = document.getElementById('time-gate');
const envSwitcher = document.getElementById('env-switcher');
const feedbackOverlay = document.getElementById('feedback-overlay');
const fbSubtitle = document.getElementById('fb-subtitle');
const fbCategory = document.getElementById('fb-category');
const fbComment = document.getElementById('fb-comment');
const fbCancel = document.getElementById('fb-cancel');
const fbSubmit = document.getElementById('fb-submit');
const fbStatus = document.getElementById('fb-status');
const fbUserName = document.getElementById('fb-user-name');
const liveBadge = document.getElementById('live-badge');
const envSelect = document.getElementById('env-select');
const envSelectorWrap = document.getElementById('env-selector-wrap');
const loadingOverlay = document.getElementById('loading-overlay');
const loadProgressBar = document.getElementById('load-progress-bar');
const loadProgressText = document.getElementById('load-progress-text');
const adminModalOverlay = document.getElementById('admin-modal-overlay');
const adminModalClose = document.getElementById('admin-modal-close');
const adminInfoName = document.getElementById('admin-info-name');
const adminInfoRole = document.getElementById('admin-info-role');
const adminInviteEmail = document.getElementById('admin-invite-email');
const adminInviteRole = document.getElementById('admin-invite-role');
const adminInviteBtn = document.getElementById('admin-invite-btn');
const adminInviteStatus = document.getElementById('admin-invite-status');
const burgerBtn = document.getElementById('burger-btn');
const burgerDropdown = document.getElementById('burger-dropdown');
const burgerUserEmail = document.getElementById('burger-user-email');
const burgerUserRole = document.getElementById('burger-user-role');
const burgerUsersBtn = document.getElementById('burger-users-btn');
const burgerInviteBtn = document.getElementById('burger-invite-btn');
const burgerLogoutBtn = document.getElementById('burger-logout-btn');

// Hidden metadata for the currently open feedback form
let feedbackMeta = {};
let reviewedSessions = new Set();
let currentUser = null; // { id, email, name } — set after Google sign-in
let currentUserRole = null; // 'user' | 'admin' | null

console.log('[app.js] Script loaded. Supabase available:', !!(window.supabase && window.supabase.createClient));

// ── Helpers ──
function rebuildSessionMap() {
  sessionMap = new Map();
  for (const s of allSessions) sessionMap.set(s.id, s);
}

function debouncedRender() {
  clearTimeout(renderDebounceTimer);
  renderDebounceTimer = setTimeout(() => {
    renderSessionList();
    renderFilterTags();
  }, 150);
}

function loadFilterOptionsFromConfig() {
  const savedEnvIdx = parseInt(localStorage.getItem('sb_selected_env') || '0', 10);
  const activeEnv = environments[savedEnvIdx] || environments[0] || {};
  const opts = activeEnv.filterOptions || {};
  allToolNames = (opts.tools || []).slice().sort();
  allCategories = (opts.categories || []).slice().sort();
  allRequestTypes = (opts.requestTypes || []).slice().sort();
  allProjects = (opts.projects || []).slice().sort();
  allVisitorTypes = (opts.visitorTypes || []).slice().sort();
  allLanguages = (opts.languages || []).slice().sort();
  // Return true if at least one filter list has values
  return allToolNames.length > 0 || allCategories.length > 0 || allRequestTypes.length > 0
    || allProjects.length > 0 || allVisitorTypes.length > 0 || allLanguages.length > 0;
}

// Fallback: fetch filter options from DB when config.js has none
async function loadFilterOptionsFromRPC() {
  try {
    const rpcPromise = db.rpc('get_filter_options');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('get_filter_options timed out')), 10000)
    );
    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);
    if (error) {
      console.warn('[filters] get_filter_options error:', error);
      return;
    }
    if (data) {
      allToolNames = (data.tools || []).sort();
      allCategories = (data.categories || []).sort();
      allRequestTypes = (data.request_types || []).sort();
      allProjects = (data.projects || []).sort();
      allVisitorTypes = (data.visitor_types || []).sort();
      allLanguages = (data.languages || []).sort();
    }
  } catch (err) {
    console.warn('[filters] loadFilterOptionsFromRPC skipped:', err.message);
  }
}

// ── Init ──
(async function init() {
  connectBtn.addEventListener('click', handleGoogleSignIn);
  refreshBtn.addEventListener('click', handleRefresh);
  sessionSearch.addEventListener('input', handleSessionSearch);

  // Filter popover toggle
  filterIconBtn.addEventListener('click', () => {
    const isOpen = filterPanel.classList.contains('open');
    if (isOpen) { closeFilterPopover(); } else { openFilterPopover(); }
  });
  filterPopoverOverlay.addEventListener('click', closeFilterPopover);
  filterPopoverClose.addEventListener('click', closeFilterPopover);

  // Filter controls
  // Date inputs validate the 3-day gap on change (for warning display)
  filterDateFrom.addEventListener('change', validateDateRange);
  filterDateTo.addEventListener('change', validateDateRange);
  // Sort and reviewed are client-side only — debounced re-render
  filterSort.addEventListener('change', debouncedRender);
  filterReviewed.addEventListener('change', debouncedRender);
  // Apply / Clear buttons
  filterApply.addEventListener('click', async () => { await applyFilters(); closeFilterPopover(); renderFilterTags(); });

  // Dropdown checklist toggle + click-outside
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.dd-trigger');
    if (trigger) {
      const panel = trigger.nextElementSibling;
      const isOpen = panel.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) { panel.classList.add('open'); trigger.classList.add('active'); }
      return;
    }
    if (!e.target.closest('.dd-filter')) closeAllDropdowns();
  });
  filterClear.addEventListener('click', async () => { await clearFilters(); closeFilterPopover(); renderFilterTags(); });

  // Feedback modal
  fbCancel.addEventListener('click', closeFeedbackModal);
  fbSubmit.addEventListener('click', submitFeedback);
  feedbackOverlay.addEventListener('click', (e) => {
    if (e.target === feedbackOverlay) closeFeedbackModal();
  });

  // Admin settings modal
  adminModalClose.addEventListener('click', closeAdminModal);
  adminModalOverlay.addEventListener('click', (e) => {
    if (e.target === adminModalOverlay) closeAdminModal();
  });
  adminInviteBtn.addEventListener('click', () => inviteUser(adminInviteEmail.value.trim(), adminInviteRole.value));

  // Burger menu
  burgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    burgerDropdown.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (burgerDropdown.classList.contains('open') &&
        !burgerDropdown.contains(e.target) && e.target !== burgerBtn) {
      burgerDropdown.classList.remove('open');
    }
  });
  burgerUsersBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    burgerDropdown.classList.remove('open');
    openUsersModal();
  });
  usersModalClose.addEventListener('click', closeUsersModal);
  usersModalOverlay.addEventListener('click', (e) => {
    if (e.target === usersModalOverlay) closeUsersModal();
  });
  burgerInviteBtn.addEventListener('click', () => {
    burgerDropdown.classList.remove('open');
    openAdminModal();
  });
  burgerLogoutBtn.addEventListener('click', () => {
    burgerDropdown.classList.remove('open');
    handleLogout();
  });

  // Infinite scroll on session list
  sessionList.addEventListener('scroll', handleSessionListScroll);

  // Keyboard navigation: Escape closes modals/dropdowns, arrows navigate sessions
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeFeedbackModal();
      closeAdminModal();
      closeUsersModal();
      closeFilterPopover();
      closeAllDropdowns();
      burgerDropdown.classList.remove('open');
      return;
    }
    // Arrow keys for session list navigation (only when sidebar is visible)
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement?.closest('#session-list')) {
      e.preventDefault();
      const items = Array.from(sessionList.querySelectorAll('.session-item'));
      const activeIdx = items.findIndex(li => li.classList.contains('active'));
      let nextIdx = e.key === 'ArrowDown' ? activeIdx + 1 : activeIdx - 1;
      if (nextIdx >= 0 && nextIdx < items.length) {
        items[nextIdx].focus();
        items[nextIdx].click();
      }
    }
  });

  // ── Build environments list from config ──
  const cfg = window.CHAT_VIEW_CONFIG || {};
  if (Array.isArray(cfg.environments) && cfg.environments.length > 0) {
    environments = cfg.environments;
  } else if (cfg.projectId && cfg.anonKey) {
    // Backward compat: single-env format
    environments = [{ name: 'Default', projectId: cfg.projectId, anonKey: cfg.anonKey, allowedDomains: cfg.allowedDomains || [] }];
  }

  // ── Populate environment selector dropdown ──
  if (environments.length > 1) {
    envSelect.innerHTML = '';
    environments.forEach((env, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = env.name || ('Environment ' + (i + 1));
      envSelect.appendChild(opt);
    });
    if (envSelectorWrap) envSelectorWrap.style.display = '';
  } else {
    if (envSelectorWrap) envSelectorWrap.style.display = 'none';
    if (environments.length === 1) {
      const opt = document.createElement('option');
      opt.value = 0;
      opt.textContent = environments[0].name || 'Default';
      envSelect.appendChild(opt);
    }
  }

  // ── Try to restore session from config / localStorage ──
  const savedEnvIdx = parseInt(localStorage.getItem('sb_selected_env') || '0', 10);
  const projectId = localStorage.getItem('sb_project_id');
  const key = localStorage.getItem('sb_key');

  // Restore dropdown selection to match the saved environment
  if (envSelect && !isNaN(savedEnvIdx) && savedEnvIdx < environments.length) {
    envSelect.value = savedEnvIdx;
  }

  if (projectId && key && window.supabase && window.supabase.createClient) {
    initSupabaseClient(projectId, key);
    const { data: { session } } = await db.auth.getSession();
    if (session && session.user) {
      await afterAuthSuccess(session.user);
      return;
    }
  }

  console.log('[app.js] Init complete. Showing login panel.');
})();

// ── Connection ──
function initSupabaseClient(projectId, key) {
  const url = 'https://' + projectId + '.supabase.co';
  db = window.supabase.createClient(url, key);
}

async function handleGoogleSignIn() {
  if (!window.supabase || !window.supabase.createClient) {
    showLoginError('Supabase library failed to load. Check your network or ad blocker.');
    return;
  }

  const selectedIdx = envSelect ? parseInt(envSelect.value || '0', 10) : 0;
  const selectedEnv = environments[selectedIdx] || environments[0];

  let projectId, key;
  if (selectedEnv) {
    projectId = selectedEnv.projectId;
    key = selectedEnv.anonKey;
  }

  if (!projectId || !key) {
    showLoginError('No Supabase credentials configured. Please provide a config.js with projectId and anonKey.');
    return;
  }

  // Save credentials and selected env index so they survive the OAuth redirect
  localStorage.setItem('sb_project_id', projectId);
  localStorage.setItem('sb_key', key);
  localStorage.setItem('sb_selected_env', selectedIdx);

  hideLoginError();
  connectBtn.disabled = true;
  connectBtn.textContent = 'Redirecting to Google...';

  initSupabaseClient(projectId, key);

  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });

  if (error) {
    showLoginError('Failed to start Google sign-in: ' + error.message);
    connectBtn.disabled = false;
    connectBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Sign in with Google';
    db = null;
  }
  // On success the browser navigates away; no further code runs here.
}

async function afterAuthSuccess(user) {
  const savedEnvIdx = parseInt(localStorage.getItem('sb_selected_env') || '0', 10);
  const activeEnv = environments[savedEnvIdx] || environments[0] || {};
  const allowedDomains = Array.isArray(activeEnv.allowedDomains) ? activeEnv.allowedDomains : [];

  if (allowedDomains.length > 0) {
    const domain = (user.email || '').split('@')[1] || '';
    if (!allowedDomains.includes(domain)) {
      await db.auth.signOut();
      db = null;
      showLoginError('Access restricted. Only accounts from ' + allowedDomains.join(', ') + ' are allowed.');
      return;
    }
  }

  currentUser = {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || '',
  };

  burgerUserEmail.textContent = currentUser.email;

  hideLoginError();
  clearStatusLog();
  logStatus('Signed in as ' + currentUser.email + '. Loading sessions...');

  connectBtn.disabled = true;
  connectBtn.textContent = 'Loading...';

  try {
    const testPromise = db
      .from('chat_messages')
      .select('id', { count: 'exact', head: true });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out after 10s. Check your Project ID.')), 10000)
    );
    const { count, error } = await Promise.race([testPromise, timeoutPromise]);

    if (error) {
      logStatus('ERROR from Supabase: ' + JSON.stringify(error));
      throw error;
    }
    logStatus('Connection OK. Row count: ' + (count !== null ? count : 'unknown (RLS may hide count)'));

    const authorized = await fetchOrCreateUserRole();
    if (!authorized) return;

    loadReviewed();

    logStatus('Loading sessions...');
    loadingOverlay.style.display = 'flex';

    // Load filter options: prefer config.js, fall back to RPC if empty
    const hasConfigFilters = loadFilterOptionsFromConfig();
    const sessionsPromise = loadDefaultSessions();
    if (!hasConfigFilters) await loadFilterOptionsFromRPC();
    const sessionsOk = await sessionsPromise;

    if (!sessionsOk) {
      logStatus('Failed to load sessions. Staying on login screen.');
      showLoginError('Failed to load sessions. The get_session_list RPC may be missing or inaccessible. Check the Supabase SQL Editor.');
      db = null;
      currentUser = null;
      return;
    }

    if (allSessions.length === 0) {
      logStatus('Connected but no sessions found. Table may be empty or restricted by RLS.');
      showLoginError('Connected successfully, but no sessions found. The chat_messages table may be empty or restricted by RLS policies.');
      db = null;
      currentUser = null;
      return;
    }

    logStatus('Loaded ' + allSessions.length + ' sessions. Switching to chat view...');
    loginPanel.style.display = 'none';
    chatPanel.classList.add('active');
    setupEnvSwitcher();
    populateFilters();
    renderSessionList();
    updateTimeGate();
    subscribeRealtime();
  } catch (err) {
    logStatus('FAILED: ' + (err.message || String(err)));
    showLoginError('Connection failed: ' + (err.message || 'Check your credentials.'));
    db = null;
    currentUser = null;
  } finally {
    loadingOverlay.style.display = 'none';
    connectBtn.disabled = false;
    connectBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Sign in with Google';
  }
}

async function handleLogout() {
  if (db) {
    await db.auth.signOut().catch(() => {});
  }
  localStorage.removeItem('sb_project_id');
  localStorage.removeItem('sb_key');
  localStorage.removeItem('sb_selected_env');
  unsubscribeRealtime();
  db = null;
  currentUser = null;
  currentUserRole = null;
  allSessions = [];
  sessionMap = new Map();
  currentSessionId = null;
  reviewedSessions = new Set();
  sessionCursor = null;
  isLoadingMore = false;
  noMoreSessions = false;
  filtersApplied = false;
  currentFilterParams = null;
  searchResults = null;
  clearTimeout(searchDebounceTimer);
  sessionSearch.value = '';
  if (envSwitcher) { envSwitcher.classList.remove('active'); envSwitcher.innerHTML = ''; }
  if (timeGateEl) timeGateEl.textContent = '';
  burgerUserEmail.textContent = '';
  burgerUserRole.textContent = '';
  burgerUsersBtn.style.display = 'none';
  burgerInviteBtn.style.display = 'none';
  burgerDropdown.classList.remove('open');
  closeUsersModal();
  closeAdminModal();
  const sc = document.getElementById('chat-session-controls');
  if (sc) sc.innerHTML = '';
  chatPanel.classList.remove('active');
  loginPanel.style.display = 'flex';
  sessionList.innerHTML = '';
  chatMain.innerHTML = '<div class="chat-empty">Select a session to view the conversation</div>';
}

async function handleRefresh() {
  if (!db) return;
  unsubscribeRealtime();
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Refreshing...';
  sessionCount.textContent = 'Refreshing sessions...';

  // Refresh filter options (RPC fallback if config is empty)
  const hasConfigFilters = loadFilterOptionsFromConfig();
  if (!hasConfigFilters) await loadFilterOptionsFromRPC();

  // Re-run current view (default or filtered)
  if (filtersApplied && currentFilterParams) {
    await applyFilters();
  } else {
    loadingOverlay.style.display = 'flex';
    await loadDefaultSessions();
    loadingOverlay.style.display = 'none';
    if (allSessions.length > 0) {
      populateFilters();
      renderSessionList();
      updateTimeGate();
      // Auto-select session from URL ?session=<id> (shareable links)
      const urlSession = new URL(window.location).searchParams.get('session');
      if (urlSession && sessionMap.has(urlSession)) {
        selectSession(urlSession);
      }
    } else {
      sessionCount.textContent = 'No sessions found.';
    }
  }
  refreshBtn.disabled = false;
  refreshBtn.textContent = 'Refresh';
  subscribeRealtime();
}

// ── Realtime ──
let realtimeRetryTimer = null;

function subscribeRealtime() {
  if (!db || realtimeChannel) return;
  clearTimeout(realtimeRetryTimer);
  realtimeChannel = db.channel('chat-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, handleRealtimeInsert)
    .subscribe((status) => {
      console.log('[realtime] Channel status:', status);
      liveBadge.classList.toggle('active', status === 'SUBSCRIBED');
      // Auto-retry on error or timeout
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[realtime] Channel lost, retrying in 5s...');
        unsubscribeRealtime();
        realtimeRetryTimer = setTimeout(subscribeRealtime, 5000);
      }
    });
}

function unsubscribeRealtime() {
  clearTimeout(realtimeRetryTimer);
  if (realtimeChannel && db) db.removeChannel(realtimeChannel);
  realtimeChannel = null;
  liveBadge.classList.remove('active');
}

function handleRealtimeInsert(payload) {
  const row = payload.new;
  if (!row || !row.session_id) return;
  const { session_id: sid, created_at: ts, message: rawMsg } = row;

  let msg = null;
  try { msg = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg; } catch (e) {}

  let isNew = false;
  let session = sessionMap.get(sid);
  if (!session) {
    isNew = true;
    session = {
      id: sid, count: 0, latest: ts, earliest: ts,
      tools: [], typeCounts: { human: 0, ai: 0, tool: 0, system: 0 },
      categories: [], requestTypes: [], hasVerified: false, hasEndConversation: false,
    };
    allSessions.unshift(session);
    sessionMap.set(sid, session);
  }

  session.count++;
  if (ts > session.latest) session.latest = ts;
  if (ts < session.earliest) session.earliest = ts;

  if (msg) {
    const t = msg.type;
    if (t in session.typeCounts) session.typeCounts[t]++;

    if (msg.tool_calls && msg.tool_calls.length) {
      for (const tc of msg.tool_calls) {
        if (tc.name && !session.tools.includes(tc.name)) session.tools.push(tc.name);
      }
    }
    if (t === 'tool' && msg.name) {
      if (!session.tools.includes(msg.name)) session.tools.push(msg.name);
    }

    if (t === 'ai' && !(msg.tool_calls && msg.tool_calls.length)) {
      let c = msg.content;
      try { if (typeof c === 'string') c = JSON.parse(c); } catch (e) { c = null; }
      if (c && c.output) {
        const { request_category: cat, request_type: rtype, identity_verified, end_conversation } = c.output;
        if (cat && !session.categories.includes(cat)) session.categories.push(cat);
        if (rtype && !session.requestTypes.includes(rtype)) session.requestTypes.push(rtype);
        if (identity_verified) session.hasVerified = true;
        if (end_conversation) session.hasEndConversation = true;
      }
    }
  }

  // Move session to front of array (instead of full re-sort)
  if (!isNew) {
    const idx = allSessions.indexOf(session);
    if (idx > 0) {
      allSessions.splice(idx, 1);
      allSessions.unshift(session);
    }
  }

  // Targeted DOM update instead of full rebuild
  updateSessionInDOM(session, isNew);
  if (sid === currentSessionId) appendRealtimeMessage(row);
}

function getCheckedValues(panel) {
  return Array.from(panel.querySelectorAll('input[type=checkbox]:checked')).map((cb) => cb.value);
}

function updateDropdownLabel(panel, trigger, defaultLabel, activePrefix) {
  const count = panel.querySelectorAll('input[type=checkbox]:checked').length;
  trigger.textContent = count ? activePrefix + ' (' + count + ')' : defaultLabel;
}

function closeAllDropdowns() {
  document.querySelectorAll('.dd-panel.open').forEach((p) => {
    p.classList.remove('open');
    p.previousElementSibling.classList.remove('active');
  });
}

function openFilterPopover() {
  filterPanel.classList.add('open');
  filterPopoverOverlay.classList.add('open');
}

function closeFilterPopover() {
  filterPanel.classList.remove('open');
  filterPopoverOverlay.classList.remove('open');
  closeAllDropdowns();
}

function renderFilterTags() {
  const tags = [];

  // Date — format datetime-local values for display
  const dateFrom = filterDateFrom.value;
  const dateTo = filterDateTo.value;
  if (dateFrom) tags.push({ label: 'From', value: formatDatetimeTag(dateFrom), clear: () => { filterDateFrom.value = ''; } });
  if (dateTo) tags.push({ label: 'To', value: formatDatetimeTag(dateTo), clear: () => { filterDateTo.value = ''; } });

  // Messages
  const msgMin = filterMsgMin.value;
  const msgMax = filterMsgMax.value;
  if (msgMin) tags.push({ label: 'Msg min', value: msgMin, clear: () => { filterMsgMin.value = ''; } });
  if (msgMax) tags.push({ label: 'Msg max', value: msgMax, clear: () => { filterMsgMax.value = ''; } });

  // Sort (only if non-default)
  if (filterSort.value !== 'newest') {
    const sortLabel = filterSort.options[filterSort.selectedIndex].text;
    tags.push({ label: 'Sort', value: sortLabel, clear: () => { filterSort.value = 'newest'; renderSessionList(); } });
  }

  // Reviewed (only if non-default)
  if (filterReviewed.value !== 'all') {
    const revLabel = filterReviewed.options[filterReviewed.selectedIndex].text;
    tags.push({ label: 'Reviewed', value: revLabel, clear: () => { filterReviewed.value = 'all'; renderSessionList(); } });
  }

  // Dropdown checklists
  const ddConfigs = [
    { panel: filterToolsPanel, trigger: filterToolsTrigger, label: 'Tools', defaultLabel: 'All tools', prefix: 'Tools' },
    { panel: filterCategoryPanel, trigger: filterCategoryTrigger, label: 'Category', defaultLabel: 'All categories', prefix: 'Category' },
    { panel: filterRequestTypePanel, trigger: filterRequestTypeTrigger, label: 'Type', defaultLabel: 'All types', prefix: 'Type' },
    { panel: filterProjectPanel, trigger: filterProjectTrigger, label: 'Project', defaultLabel: 'All projects', prefix: 'Project' },
    { panel: filterVisitorTypePanel, trigger: filterVisitorTypeTrigger, label: 'Visitor', defaultLabel: 'All visitor types', prefix: 'Visitor type' },
    { panel: filterLanguagePanel, trigger: filterLanguageTrigger, label: 'Language', defaultLabel: 'All languages', prefix: 'Language' },
  ];
  for (const dd of ddConfigs) {
    const checked = getCheckedValues(dd.panel);
    if (checked.length > 0) {
      const display = checked.length <= 2 ? checked.join(', ') : checked.length + ' selected';
      tags.push({
        label: dd.label, value: display,
        clear: () => {
          for (const cb of dd.panel.querySelectorAll('input[type=checkbox]')) cb.checked = false;
          dd.trigger.textContent = dd.defaultLabel;
        }
      });
    }
  }

  // Boolean selects
  const boolConfigs = [
    { el: filterValidation, label: 'Validated' },
    { el: filterWhatsapp, label: 'WhatsApp' },
    { el: filterHasLead, label: 'Has lead' },
    { el: filterHasCase, label: 'Has case' },
    { el: filterHasBooking, label: 'Has booking' },
  ];
  for (const bc of boolConfigs) {
    if (bc.el.value) {
      tags.push({ label: bc.label, value: bc.el.value === 'true' ? 'Yes' : 'No', clear: () => { bc.el.value = ''; } });
    }
  }

  // Render
  filterTagsBar.innerHTML = '';
  if (tags.length === 0) {
    filterTagsBar.classList.remove('has-tags');
    filterIconBtn.classList.remove('has-filters');
    return;
  }
  filterTagsBar.classList.add('has-tags');
  filterIconBtn.classList.add('has-filters');
  for (const tag of tags) {
    const el = document.createElement('span');
    el.className = 'filter-tag';
    el.innerHTML = `<span class="filter-tag-label">${escapeHtml(tag.label)}:</span> ${escapeHtml(tag.value)} <button class="filter-tag-dismiss" title="Remove">&times;</button>`;
    el.querySelector('.filter-tag-dismiss').addEventListener('click', async () => {
      tag.clear();
      renderFilterTags();
      await applyFilters();
      renderFilterTags();
    });
    filterTagsBar.appendChild(el);
  }
  // Clear all link
  const clearAll = document.createElement('button');
  clearAll.className = 'filter-tags-clear';
  clearAll.textContent = 'Clear all';
  clearAll.addEventListener('click', async () => { await clearFilters(); renderFilterTags(); renderSessionList(); });
  filterTagsBar.appendChild(clearAll);
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
  loginError.style.textAlign = 'center';
}

function hideLoginError() {
  loginError.style.display = 'none';
}

// ── Status Log ──
function logStatus(msg) {
  console.log('[status]', msg);
}

function clearStatusLog() {
  // no-op: status log removed from UI
}

// ── Sessions (RPC-based lazy loading) ──

// Parse the RPC result into the allSessions format used by the rest of the app
function parseSessionResults(rows) {
  return (rows || []).map(row => ({
    id: row.session_id,
    count: Number(row.msg_count),
    latest: row.latest,
    earliest: row.earliest,
    tools: row.tools || [],
    typeCounts: row.type_counts || { human: 0, ai: 0, tool: 0, system: 0 },
    categories: row.categories || [],
    requestTypes: row.request_types || [],
    hasVerified: row.has_verified || false,
    hasEndConversation: row.has_end_conversation || false,
    // Visitor settings enrichment
    project: row.project || null,
    visitorType: row.visitor_type || null,
    language: row.language || null,
    validation: row.validation || false,
    isWhatsapp: row.is_whatsapp || false,
    hasLead: row.has_lead || false,
    hasCase: row.has_case || false,
    hasBooking: row.has_booking || false,
    requestId: row.request_id || null,
    maskedClientPhone: row.masked_client_phone || null,
  }));
}

// Default load: most recent 50 sessions, no filters
async function loadDefaultSessions() {
  filtersApplied = false;
  currentFilterParams = null;
  sessionCursor = null;
  noMoreSessions = false;

  try {
    const { data, error } = await db.rpc('get_session_list', { p_limit: 50 });
    if (error) {
      logStatus('Session fetch ERROR: ' + (error.message || JSON.stringify(error)));
      console.error('Failed to load sessions:', error);
      return false;
    }

    allSessions = parseSessionResults(data);
    rebuildSessionMap();
    if (allSessions.length > 0) {
      sessionCursor = allSessions[allSessions.length - 1].latest;
    }
    if (allSessions.length < 50) noMoreSessions = true;

    logStatus('Loaded ' + allSessions.length + ' sessions via RPC.');
    return true;
  } catch (err) {
    logStatus('Session fetch FAILED: ' + (err.message || String(err)));
    console.error('loadDefaultSessions error:', err);
    return false;
  }
}

// Load 10 more sessions (older) — called on infinite scroll
async function loadMoreSessions() {
  if (isLoadingMore || noMoreSessions || !db) return;
  isLoadingMore = true;

  // Show a small loading indicator at the bottom of the list
  const loader = document.createElement('li');
  loader.className = 'scroll-loader';
  loader.textContent = 'Loading more sessions...';
  sessionList.appendChild(loader);

  try {
    const params = { p_limit: 10, p_cursor: sessionCursor };
    // If filters are active, include filter params
    if (filtersApplied && currentFilterParams) {
      Object.assign(params, currentFilterParams);
    }

    const { data, error } = await db.rpc('get_session_list', params);
    if (error) { console.error('loadMoreSessions error:', error); return; }

    const newSessions = parseSessionResults(data);
    if (newSessions.length === 0) {
      noMoreSessions = true;
    } else {
      allSessions = allSessions.concat(newSessions);
      for (const s of newSessions) sessionMap.set(s.id, s);
      sessionCursor = newSessions[newSessions.length - 1].latest;
      if (newSessions.length < 10) noMoreSessions = true;
    }

    renderSessionList();
    updateTimeGate();
  } catch (err) {
    console.error('loadMoreSessions failed:', err);
  } finally {
    loader.remove();
    isLoadingMore = false;
  }
}

// Infinite scroll handler for the session list sidebar
function handleSessionListScroll() {
  if (noMoreSessions || isLoadingMore || searchResults !== null) return;
  const { scrollTop, scrollHeight, clientHeight } = sessionList;
  if (scrollTop + clientHeight >= scrollHeight - 60) {
    loadMoreSessions();
  }
}

// Server-side session_id search with debounce
function handleSessionSearch() {
  clearTimeout(searchDebounceTimer);
  const query = sessionSearch.value.trim();
  if (!query) {
    // Cleared — restore normal view
    searchResults = null;
    renderSessionList();
    updateTimeGate();
    return;
  }
  // Show searching indicator immediately
  sessionList.innerHTML = '<li class="scroll-loader">Searching...</li>';
  sessionCount.textContent = 'Searching...';

  // Debounce: wait 400ms after last keystroke before hitting the server
  searchDebounceTimer = setTimeout(async () => {
    if (!db) return;
    try {
      const { data, error } = await db.rpc('get_session_list', {
        p_limit: 50,
        p_session_id: query,
      });
      // If the search box was cleared while the RPC was in flight, ignore results
      if (!sessionSearch.value.trim()) { searchResults = null; renderSessionList(); return; }
      if (error) {
        console.warn('[search] RPC error:', error);
        searchResults = null;
        renderSessionList();
        return;
      }
      searchResults = parseSessionResults(data);
      renderSessionList();
      updateTimeGate();
    } catch (err) {
      console.warn('[search] Failed:', err);
      searchResults = null;
      renderSessionList();
    }
  }, 400);
}

// Validate date range and show/hide warning (max 3 days)
function validateDateRange() {
  const from = filterDateFrom.value;
  const to = filterDateTo.value;
  if (from && to) {
    const diffMs = new Date(to) - new Date(from);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 3 || diffDays < 0) {
      filterDateWarning.style.display = 'block';
      filterApply.disabled = true;
      return false;
    }
  }
  filterDateWarning.style.display = 'none';
  filterApply.disabled = false;
  return true;
}

// Apply server-side filters via the RPC
async function applyFilters() {
  if (!db) return;
  if (!validateDateRange()) return;

  const dateFrom = filterDateFrom.value;
  const dateTo = filterDateTo.value;
  const msgMin = filterMsgMin.value ? parseInt(filterMsgMin.value, 10) : null;
  const msgMax = filterMsgMax.value ? parseInt(filterMsgMax.value, 10) : null;
  const selectedTools = getCheckedValues(filterToolsPanel);
  const selectedCategories = getCheckedValues(filterCategoryPanel);
  const selectedReqTypes = getCheckedValues(filterRequestTypePanel);
  const selectedProjects = getCheckedValues(filterProjectPanel);
  const selectedVisitorTypes = getCheckedValues(filterVisitorTypePanel);
  const selectedLanguages = getCheckedValues(filterLanguagePanel);
  const validationVal = filterValidation.value;
  const whatsappVal = filterWhatsapp.value;
  const hasLeadVal = filterHasLead.value;
  const hasCaseVal = filterHasCase.value;
  const hasBookingVal = filterHasBooking.value;

  // If no server-side filters specified, fall back to default load
  const hasServerFilters = dateFrom || dateTo || msgMin !== null || msgMax !== null
    || selectedTools.length > 0 || selectedCategories.length > 0 || selectedReqTypes.length > 0
    || selectedProjects.length > 0 || selectedVisitorTypes.length > 0 || selectedLanguages.length > 0
    || validationVal || whatsappVal || hasLeadVal || hasCaseVal || hasBookingVal;

  if (!hasServerFilters) {
    // No server filters — reload default sessions
    await clearFilters();
    return;
  }

  // Auto-fill date range to last 3 days if not specified
  // datetime-local values are "YYYY-MM-DDTHH:MM", date values are "YYYY-MM-DD"
  const params = { p_limit: 50 };
  if (dateFrom) {
    // datetime-local gives "YYYY-MM-DDTHH:MM"; append seconds
    params.p_date_from = dateFrom.length > 10 ? dateFrom + ':00' : dateFrom + 'T00:00:00';
  } else {
    // Default to 3 days ago at midnight
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const defaultFrom = d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
    params.p_date_from = defaultFrom + ':00';
    filterDateFrom.value = d.toISOString().slice(0, 10) + 'T00:00';
  }
  if (dateTo) {
    params.p_date_to = dateTo.length > 10 ? dateTo + ':59.999' : dateTo + 'T23:59:59.999';
  } else {
    params.p_date_to = new Date().toISOString();
    filterDateTo.value = new Date().toISOString().slice(0, 16);
  }
  validateDateRange(); // re-validate after auto-fill
  if (filterApply.disabled) return;

  if (msgMin !== null && !isNaN(msgMin)) params.p_msg_min = msgMin;
  if (msgMax !== null && !isNaN(msgMax)) params.p_msg_max = msgMax;
  if (selectedTools.length > 0) params.p_tools = selectedTools;
  if (selectedCategories.length > 0) params.p_categories = selectedCategories;
  if (selectedReqTypes.length > 0) params.p_request_types = selectedReqTypes;
  if (selectedProjects.length > 0) params.p_projects = selectedProjects;
  if (selectedVisitorTypes.length > 0) params.p_visitor_types = selectedVisitorTypes;
  if (selectedLanguages.length > 0) params.p_languages = selectedLanguages;
  if (validationVal) params.p_validation = validationVal === 'true';
  if (whatsappVal) params.p_is_whatsapp = whatsappVal === 'true';
  if (hasLeadVal) params.p_has_lead = hasLeadVal === 'true';
  if (hasCaseVal) params.p_has_case = hasCaseVal === 'true';
  if (hasBookingVal) params.p_has_booking = hasBookingVal === 'true';

  filtersApplied = true;
  // Store filter params (without p_limit / p_cursor) for loadMore
  currentFilterParams = { ...params };
  delete currentFilterParams.p_limit;
  delete currentFilterParams.p_cursor;
  sessionCursor = null;
  noMoreSessions = false;

  loadingOverlay.style.display = 'flex';
  try {
    const { data, error } = await db.rpc('get_session_list', params);
    if (error) {
      console.error('applyFilters error:', error);
      sessionCount.textContent = 'Filter query failed.';
      return;
    }
    allSessions = parseSessionResults(data);
    if (allSessions.length > 0) {
      sessionCursor = allSessions[allSessions.length - 1].latest;
    }
    if (allSessions.length < 50) noMoreSessions = true;

    rebuildSessionMap();
    renderSessionList();
    updateTimeGate();
  } catch (err) {
    console.error('applyFilters failed:', err);
  } finally {
    loadingOverlay.style.display = 'none';
  }
}

function populateFilters() {
  buildDropdown(filterToolsPanel, filterToolsTrigger, allToolNames, 'All tools', 'Tools');
  buildDropdown(filterCategoryPanel, filterCategoryTrigger, allCategories, 'All categories', 'Category');
  buildDropdown(filterRequestTypePanel, filterRequestTypeTrigger, allRequestTypes, 'All types', 'Type');
  buildDropdown(filterProjectPanel, filterProjectTrigger, allProjects, 'All projects', 'Project');
  buildDropdown(filterVisitorTypePanel, filterVisitorTypeTrigger, allVisitorTypes, 'All visitor types', 'Visitor type');
  buildDropdown(filterLanguagePanel, filterLanguageTrigger, allLanguages, 'All languages', 'Language');
}

function buildDropdown(panel, trigger, items, defaultLabel, activePrefix) {
  panel.innerHTML = '';
  for (const item of items) {
    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = item;
    cb.addEventListener('change', () => {
      updateDropdownLabel(panel, trigger, defaultLabel, activePrefix);
      debouncedRender();
    });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + item));
    panel.appendChild(lbl);
  }
  updateDropdownLabel(panel, trigger, defaultLabel, activePrefix);
}

function updateLoadProgress(loaded, total) {
  if (!loadProgressBar || !loadProgressText) return;
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  loadProgressBar.style.width = pct + '%';
  if (total === 0) {
    loadProgressText.textContent = 'Loading sessions…';
  } else if (loaded < total) {
    loadProgressText.textContent = `${loaded.toLocaleString()} of ${total.toLocaleString()} rows (${pct}%)`;
  } else {
    loadProgressText.textContent = `${total.toLocaleString()} rows loaded`;
  }
}

async function clearFilters() {
  filterDateFrom.value = '';
  filterDateTo.value = '';
  filterMsgMin.value = '';
  filterMsgMax.value = '';
  for (const cb of filterToolsPanel.querySelectorAll('input[type=checkbox]')) cb.checked = false;
  filterToolsTrigger.textContent = 'All tools';
  for (const cb of filterCategoryPanel.querySelectorAll('input[type=checkbox]')) cb.checked = false;
  filterCategoryTrigger.textContent = 'All categories';
  for (const cb of filterRequestTypePanel.querySelectorAll('input[type=checkbox]')) cb.checked = false;
  filterRequestTypeTrigger.textContent = 'All types';
  for (const cb of filterProjectPanel.querySelectorAll('input[type=checkbox]')) cb.checked = false;
  filterProjectTrigger.textContent = 'All projects';
  for (const cb of filterVisitorTypePanel.querySelectorAll('input[type=checkbox]')) cb.checked = false;
  filterVisitorTypeTrigger.textContent = 'All visitor types';
  for (const cb of filterLanguagePanel.querySelectorAll('input[type=checkbox]')) cb.checked = false;
  filterLanguageTrigger.textContent = 'All languages';
  filterValidation.value = '';
  filterWhatsapp.value = '';
  filterHasLead.value = '';
  filterHasCase.value = '';
  filterHasBooking.value = '';
  filterSort.value = 'newest';
  filterReviewed.value = 'all';
  filterDateWarning.style.display = 'none';
  filterApply.disabled = false;
  searchResults = null;
  clearTimeout(searchDebounceTimer);
  sessionSearch.value = '';

  // Reset to default 50 most recent sessions
  loadingOverlay.style.display = 'flex';
  await loadDefaultSessions();
  loadingOverlay.style.display = 'none';
  populateFilters();
  renderSessionList();
  updateTimeGate();
}

function buildTypePillsHtml(tc) {
  const parts = [];
  if (tc.human) parts.push(`<span class="type-pill human">${tc.human} human</span>`);
  if (tc.ai) parts.push(`<span class="type-pill ai">${tc.ai} ai</span>`);
  if (tc.tool) parts.push(`<span class="type-pill tool">${tc.tool} tool</span>`);
  if (tc.system) parts.push(`<span class="type-pill system">${tc.system} sys</span>`);
  return parts.join('');
}

function buildVisitorInfoHtml(session) {
  if (!session) return '';
  const parts = [];
  if (session.project) parts.push(`<span class="badge badge-project">${escapeHtml(session.project)}</span>`);
  if (session.visitorType) parts.push(`<span class="badge badge-visitor-type">${escapeHtml(session.visitorType)}</span>`);
  if (session.language) parts.push(`<span class="badge badge-language">${escapeHtml(session.language)}</span>`);
  if (session.isWhatsapp) parts.push('<span class="badge badge-whatsapp">WhatsApp</span>');
  if (session.validation) parts.push('<span class="badge badge-validated">validated</span>');
  if (session.hasLead) parts.push('<span class="badge badge-entity">lead</span>');
  if (session.hasCase) parts.push('<span class="badge badge-entity">case</span>');
  if (session.hasBooking) parts.push('<span class="badge badge-entity">booking</span>');
  return parts.length ? `<div class="chat-header-visitor">${parts.join('')}</div>` : '';
}

function buildSessionBadgesHtml(session) {
  const badges = [];
  if (reviewedSessions.has(session.id)) {
    badges.push('<span class="badge reviewed-badge">reviewed</span>');
  }
  // Visitor settings: project and type only
  if (session.project) badges.push(`<span class="badge badge-project">${escapeHtml(session.project)}</span>`);
  if (session.visitorType) badges.push(`<span class="badge badge-visitor-type">${escapeHtml(session.visitorType)}</span>`);
  // AI metadata badges only (conversation data)
  for (const cat of session.categories) {
    badges.push(`<span class="badge">${escapeHtml(cat)}</span>`);
  }
  for (const rt of session.requestTypes) {
    badges.push(`<span class="badge">${escapeHtml(rt)}</span>`);
  }
  if (session.hasVerified) badges.push('<span class="badge verified">verified</span>');
  if (session.hasEndConversation) badges.push('<span class="badge end-conv">end</span>');
  return badges.length ? `<div class="session-badges">${badges.join('')}</div>` : '';
}

function renderSessionList() {
  // Client-side filters only: reviewed, sort
  // Server-side: date, tools, categories, session_id search — applied via the RPC
  const sortBy = filterSort.value;
  const reviewedFilter = filterReviewed.value; // 'all', 'reviewed', 'unreviewed'

  // When a server search is active, use those results instead of allSessions
  let filtered = searchResults !== null ? searchResults : allSessions;

  // Reviewed filter
  if (reviewedFilter === 'reviewed') {
    filtered = filtered.filter((s) => reviewedSessions.has(s.id));
  } else if (reviewedFilter === 'unreviewed') {
    filtered = filtered.filter((s) => !reviewedSessions.has(s.id));
  }

  // Sort
  filtered = [...filtered];
  switch (sortBy) {
    case 'oldest':
      filtered.sort((a, b) => a.earliest.localeCompare(b.earliest));
      break;
    case 'most-msgs':
      filtered.sort((a, b) => b.count - a.count);
      break;
    case 'least-msgs':
      filtered.sort((a, b) => a.count - b.count);
      break;
    default: // 'newest'
      filtered.sort((a, b) => b.latest.localeCompare(a.latest));
  }

  const label = filtersApplied ? ' found' : '';
  sessionCount.textContent = `${filtered.length} session${filtered.length !== 1 ? 's' : ''}${label}${noMoreSessions ? '' : '+'}`;

  sessionList.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'session-empty-state';
    empty.innerHTML = filtersApplied
      ? '<div>No sessions match your filters</div><button class="filter-clear-link" id="empty-clear-filters">Clear Filters</button>'
      : '<div>No sessions found</div>';
    sessionList.appendChild(empty);
    if (filtersApplied) {
      const clearBtn = empty.querySelector('#empty-clear-filters');
      if (clearBtn) clearBtn.addEventListener('click', clearFilters);
    }
    return;
  }

  const frag = document.createDocumentFragment();
  for (const session of filtered) {
    frag.appendChild(createSessionLi(session));
  }
  sessionList.appendChild(frag);
}

function createSessionLi(session) {
  const li = document.createElement('li');
  li.className = 'session-item' + (session.id === currentSessionId ? ' active' : '');
  li.tabIndex = 0;
  li.dataset.sessionId = session.id;
  const typePills = buildTypePillsHtml(session.typeCounts);
  const badgesHtml = buildSessionBadgesHtml(session);
  li.innerHTML = `
    <div class="session-id">${escapeHtml(session.id)}<button class="session-id-copy-btn" title="Copy session ID" data-sid="${escapeHtml(session.id)}">&#x2398;</button></div>
    <div class="session-meta">${session.count} messages &middot; ${formatDate(session.latest)}</div>
    <div class="type-counts">${typePills}</div>
    ${badgesHtml}
  `;
  li.addEventListener('click', () => selectSession(session.id));
  const copyBtn = li.querySelector('.session-id-copy-btn');
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(session.id).then(() => {
      copyBtn.textContent = '✓';
      setTimeout(() => { copyBtn.innerHTML = '&#x2398;'; }, 1200);
    });
  });
  return li;
}

function updateSessionInDOM(session, isNew) {
  if (isNew) {
    const li = createSessionLi(session);
    // Prepend for newest-first (default sort)
    sessionList.prepend(li);
  } else {
    const li = sessionList.querySelector(`[data-session-id="${session.id}"]`);
    if (!li) return; // session filtered out, nothing to update
    // Update content in-place
    const metaEl = li.querySelector('.session-meta');
    if (metaEl) metaEl.textContent = `${session.count} messages \u00b7 ${formatDate(session.latest)}`;
    const countsEl = li.querySelector('.type-counts');
    if (countsEl) countsEl.innerHTML = buildTypePillsHtml(session.typeCounts);
    const oldBadges = li.querySelector('.session-badges');
    const newBadgesHtml = buildSessionBadgesHtml(session);
    if (oldBadges) {
      if (newBadgesHtml) { oldBadges.outerHTML = newBadgesHtml; } else { oldBadges.remove(); }
    } else if (newBadgesHtml) {
      li.insertAdjacentHTML('beforeend', newBadgesHtml);
    }
    // Move to top if sort is newest (default)
    const sortBy = filterSort.value;
    if (sortBy === 'newest' || sortBy === '') {
      sessionList.prepend(li);
    }
  }

  // Update count text
  const sessions = searchResults !== null ? searchResults : allSessions;
  const label = filtersApplied ? ' found' : '';
  sessionCount.textContent = `${sessions.length} session${sessions.length !== 1 ? 's' : ''}${label}${noMoreSessions ? '' : '+'}`;
}

async function selectSession(sessionId) {
  currentSessionId = sessionId;
  // Update URL for sharing (without triggering navigation)
  const url = new URL(window.location);
  url.searchParams.set('session', sessionId);
  history.replaceState(null, '', url);

  // Targeted active highlight toggle (instead of full renderSessionList)
  const prevActive = sessionList.querySelector('.session-item.active');
  if (prevActive) prevActive.classList.remove('active');
  const nextActive = sessionList.querySelector(`[data-session-id="${sessionId}"]`);
  if (nextActive) nextActive.classList.add('active');

  // Show loading state
  chatMain.innerHTML = '<div class="loading-messages"><div class="spinner"></div> Loading messages...</div>';

  const { data, error } = await db
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    chatMain.innerHTML = '<div class="chat-empty">Failed to load messages.</div>';
    console.error(error);
    return;
  }

  // Sync sidebar counts to match the actual rows fetched (fixes mismatch when
  // loadSessions() used a date filter that excluded some older messages in this session).
  const session = sessionMap.get(sessionId);
  if (session && data.length !== session.count) {
    const tc = { human: 0, ai: 0, tool: 0, system: 0 };
    for (const row of data) {
      try {
        const msg = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
        const t = msg && msg.type;
        if (t && tc[t] !== undefined) tc[t]++;
      } catch { /* skip */ }
    }
    session.count = data.length;
    session.typeCounts = tc;
    updateSessionInDOM(session, false);
  }

  renderMessages(data, sessionId);
}

// ── Message Parsing ──
function parseMessage(row) {
  let msg;
  try {
    msg = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
  } catch {
    return { type: 'unknown', text: row.message, raw: row.message };
  }

  const type = msg.type || 'unknown';
  const result = { type, raw: msg, timestamp: row.created_at };

  if (type === 'human') {
    // Human messages: content is a plain text string or could be JSON
    let text = msg.content;
    if (typeof text === 'string') {
      // Try parsing as JSON in case it's nested
      try {
        const parsed = JSON.parse(text);
        text = parsed.text || parsed.content || parsed.input || JSON.stringify(parsed, null, 2);
      } catch {
        // It's plain text, use as-is
      }
    }
    result.text = text || '';
  } else if (type === 'ai') {
    const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
    result.hasToolCalls = hasToolCalls;

    if (hasToolCalls) {
      result.toolCalls = msg.tool_calls;
      result.text = msg.content || '';
    } else {
      // Parse the content JSON for output.text
      let content = msg.content;
      if (typeof content === 'string') {
        try {
          content = JSON.parse(content);
        } catch {
          result.text = content;
          return result;
        }
      }

      if (content && content.output) {
        result.text = content.output.text || '';
        result.meta = {
          identityVerified: content.output.identity_verified,
          requestCategory: content.output.request_category,
          requestType: content.output.request_type,
          endConversation: content.output.end_conversation,
        };
      } else {
        result.text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      }
    }
  } else if (type === 'tool') {
    result.toolName = msg.name || 'Tool';
    result.toolCallId = msg.tool_call_id || '';
    let content = msg.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        // plain text
      }
    }
    result.toolContent = content;
    result.text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  } else if (type === 'system') {
    let content = msg.content;
    if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content);
        // Format system metadata nicely — show all key-value pairs
        const keys = Object.keys(parsed);
        if (keys.length > 0) {
          const labels = { session_id: 'Session', client_id: 'Client', platform: 'Platform', project: 'Project' };
          const parts = keys.map(k => {
            const label = labels[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return label + ': ' + parsed[k];
          });
          result.text = parts.join(' · ');
        } else {
          result.text = JSON.stringify(parsed, null, 2);
        }
      } catch {
        result.text = content;
      }
    } else {
      result.text = JSON.stringify(content, null, 2);
    }
  } else {
    result.text = JSON.stringify(msg, null, 2);
  }

  return result;
}

// ── Message Rendering ──
function renderMessages(rows, sessionId) {
  chatMain.innerHTML = '';

  // Count message types
  const headerCounts = { human: 0, ai: 0, tool: 0, system: 0 };
  for (const row of rows) {
    try {
      const msg = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
      const t = msg && msg.type;
      if (headerCounts[t] !== undefined) headerCounts[t]++;
    } catch { /* skip */ }
  }

  // Chat header — update permanent session controls bar
  const isReviewed = reviewedSessions.has(sessionId);
  const sessionControls = document.getElementById('chat-session-controls');
  const session = sessionMap.get(sessionId);
  const visitorInfoHtml = buildVisitorInfoHtml(session);
  sessionControls.innerHTML = `
    <button class="chat-reviewed-btn${isReviewed ? ' reviewed-active' : ''}" id="chat-reviewed-btn">${isReviewed ? 'Reviewed ✓' : 'Mark Reviewed'}</button>
    <button class="chat-feedback-btn" id="chat-feedback-btn">Feedback</button>
    <span class="meta-info">${rows.length} messages</span>
    ${visitorInfoHtml}
  `;

  sessionControls.querySelector('#chat-reviewed-btn').addEventListener('click', () => toggleReviewed(sessionId));

  sessionControls.querySelector('#chat-feedback-btn').addEventListener('click', () => {
    openFeedbackModal('chat', { session_id: sessionId, message_count: rows.length });
  });


  // Messages container
  const container = document.createElement('div');
  container.className = 'messages-container';
  chatMain.appendChild(container);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const parsed = parseMessage(row);
    const wrapper = document.createElement('div');

    if (parsed.type === 'human') {
      wrapper.className = 'message-wrapper human';
      wrapper.appendChild(createHumanBubble(parsed));
    } else if (parsed.type === 'ai' && parsed.hasToolCalls) {
      wrapper.className = 'message-wrapper tool';
      wrapper.appendChild(createToolCallBubble(parsed));
    } else if (parsed.type === 'ai') {
      wrapper.className = 'message-wrapper ai';
      wrapper.appendChild(createAiBubble(parsed));
    } else if (parsed.type === 'tool') {
      wrapper.className = 'message-wrapper tool';
      wrapper.appendChild(createToolResultBubble(parsed));
    } else if (parsed.type === 'system') {
      wrapper.className = 'message-wrapper system';
      wrapper.appendChild(createSystemBubble(parsed));
    } else {
      wrapper.className = 'message-wrapper system';
      wrapper.appendChild(createSystemBubble(parsed));
    }

    // Hover feedback button on every message
    const fbBtn = document.createElement('button');
    fbBtn.className = 'feedback-hover-btn';
    fbBtn.title = 'Leave feedback on this message';
    fbBtn.textContent = '\uD83D\uDCAC'; // speech bubble
    fbBtn.addEventListener('click', () => {
      openFeedbackModal('message', {
        session_id: sessionId,
        message_index: i,
        message_type: parsed.type,
        message_timestamp: parsed.timestamp,
        message_text_excerpt: parsed.text || '',
        tool_name: parsed.toolName || (parsed.toolCalls ? parsed.toolCalls.map((t) => t.name).join(', ') : undefined),
        raw: parsed.raw,
      });
    });
    wrapper.appendChild(fbBtn);

    container.appendChild(wrapper);
  }

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function appendRealtimeMessage(row) {
  const container = chatMain.querySelector('.messages-container');
  if (!container) return; // chat view not currently loaded

  const parsed = parseMessage(row);
  const wrapper = document.createElement('div');
  const messageIndex = container.querySelectorAll('.message-wrapper').length;

  if (parsed.type === 'human') {
    wrapper.className = 'message-wrapper human';
    wrapper.appendChild(createHumanBubble(parsed));
  } else if (parsed.type === 'ai' && parsed.hasToolCalls) {
    wrapper.className = 'message-wrapper tool';
    wrapper.appendChild(createToolCallBubble(parsed));
  } else if (parsed.type === 'ai') {
    wrapper.className = 'message-wrapper ai';
    wrapper.appendChild(createAiBubble(parsed));
  } else if (parsed.type === 'tool') {
    wrapper.className = 'message-wrapper tool';
    wrapper.appendChild(createToolResultBubble(parsed));
  } else {
    wrapper.className = 'message-wrapper system';
    wrapper.appendChild(createSystemBubble(parsed));
  }

  // Feedback hover button (same pattern as renderMessages)
  const fbBtn = document.createElement('button');
  fbBtn.className = 'feedback-hover-btn';
  fbBtn.title = 'Leave feedback on this message';
  fbBtn.textContent = '\uD83D\uDCAC';
  fbBtn.addEventListener('click', () => {
    openFeedbackModal('message', {
      session_id: currentSessionId,
      message_index: messageIndex,
      message_type: parsed.type,
      message_timestamp: parsed.timestamp,
      message_text_excerpt: parsed.text || '',
      tool_name: parsed.toolName || (parsed.toolCalls ? parsed.toolCalls.map((t) => t.name).join(', ') : undefined),
      raw: parsed.raw,
    });
  });
  wrapper.appendChild(fbBtn);

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;

  // Update header message count and type pills
  const session = sessionMap.get(currentSessionId);
  const sessionControls = document.getElementById('chat-session-controls');
  const metaEl = sessionControls && sessionControls.querySelector('.meta-info');
  if (metaEl && session) metaEl.textContent = session.count + ' messages';
  const pillsEl = sessionControls && sessionControls.querySelector('.chat-header-counts');
  if (pillsEl && session) pillsEl.innerHTML = buildTypePillsHtml(session.typeCounts);
}

function createHumanBubble(parsed) {
  const el = document.createElement('div');
  el.className = 'message human-bubble';
  el.innerHTML = `
    <div class="message-label human-label">Customer</div>
    <div class="message-text">${escapeHtml(parsed.text)}</div>
    <div class="message-time">${formatTime(parsed.timestamp)}</div>
  `;
  return el;
}

function createAiBubble(parsed) {
  const el = document.createElement('div');
  el.className = 'message ai-bubble';

  let badgesHtml = '';
  if (parsed.meta) {
    const badges = [];
    if (parsed.meta.requestCategory) {
      badges.push(`<span class="badge">${escapeHtml(parsed.meta.requestCategory)}</span>`);
    }
    if (parsed.meta.requestType) {
      badges.push(`<span class="badge">${escapeHtml(parsed.meta.requestType)}</span>`);
    }
    if (parsed.meta.identityVerified) {
      badges.push('<span class="badge verified">verified</span>');
    }
    if (parsed.meta.endConversation) {
      badges.push('<span class="badge end-conv">end</span>');
    }
    if (badges.length) {
      badgesHtml = `<div class="badges">${badges.join('')}</div>`;
    }
  }

  el.innerHTML = `
    <div class="message-label ai-label">AI Agent</div>
    <div class="message-text">${escapeHtml(parsed.text)}</div>
    ${badgesHtml}
    <div class="message-time">${formatTime(parsed.timestamp)}</div>
  `;
  return el;
}

function createToolCallBubble(parsed) {
  const el = document.createElement('div');
  el.className = 'message tool-bubble';

  let toolNames = '';
  if (parsed.toolCalls && parsed.toolCalls.length > 0) {
    toolNames = parsed.toolCalls.map((tc) => tc.name || 'unknown').join(', ');
  }

  let detailsHtml = '';
  if (parsed.toolCalls && parsed.toolCalls.length > 0) {
    const argsStr = parsed.toolCalls
      .map((tc) => {
        const args = tc.args || tc.input || {};
        return JSON.stringify(args, null, 2);
      })
      .join('\n---\n');
    detailsHtml = `
      <details class="tool-details">
        <summary>Show tool call details</summary>
        <pre>${escapeHtml(argsStr)}</pre>
      </details>
    `;
  }

  el.innerHTML = `
    <div class="message-label" style="color: #856404;">Tool Call: ${escapeHtml(toolNames)}</div>
    ${parsed.text ? `<div class="message-text">${escapeHtml(parsed.text)}</div>` : ''}
    ${detailsHtml}
    <div class="message-time">${formatTime(parsed.timestamp)}</div>
  `;
  return el;
}

function createToolResultBubble(parsed) {
  const el = document.createElement('div');
  el.className = 'message tool-bubble';

  el.innerHTML = `
    <div class="message-label" style="color: #856404;">Tool Result: ${escapeHtml(parsed.toolName)}</div>
    <details class="tool-details">
      <summary>Show response</summary>
      <pre>${escapeHtml(parsed.text)}</pre>
    </details>
    <div class="message-time">${formatTime(parsed.timestamp)}</div>
  `;
  return el;
}

function createSystemBubble(parsed) {
  const el = document.createElement('div');
  el.className = 'message system-bubble';
  el.innerHTML = `<div class="message-text">${escapeHtml(parsed.text)}</div>`;
  return el;
}

// ── Feedback ──
function openFeedbackModal(type, meta) {
  feedbackMeta = { type, ...meta };
  fbCategory.value = '';
  fbComment.value = '';
  fbStatus.textContent = '';
  fbStatus.className = 'fb-status';
  fbSubmit.disabled = false;
  fbSubtitle.textContent = type === 'chat'
    ? 'About chat session: ' + (meta.session_id || '').substring(0, 24) + '...'
    : 'About ' + (meta.message_type || '') + ' message at ' + formatTime(meta.message_timestamp);
  if (fbUserName) fbUserName.textContent = currentUser ? (currentUser.name || currentUser.email) : 'Unknown';
  feedbackOverlay.classList.add('open');
}

function closeFeedbackModal() {
  feedbackOverlay.classList.remove('open');
  feedbackMeta = {};
}

async function submitFeedback() {
  const category = fbCategory.value;
  const comment = fbComment.value.trim();

  if (!category) {
    fbStatus.textContent = 'Please select a category.';
    fbStatus.className = 'fb-status error';
    return;
  }
  if (!comment) {
    fbStatus.textContent = 'Please enter a comment.';
    fbStatus.className = 'fb-status error';
    return;
  }

  fbSubmit.disabled = true;
  fbStatus.textContent = 'Submitting...';
  fbStatus.className = 'fb-status';

  const envIdx = parseInt(localStorage.getItem('sb_selected_env') || '0', 10);
  const envName = (environments[envIdx] || environments[0] || {}).name || 'Default';

  const payload = {
    category,
    comment,
    env: envName,
    feedback_type: feedbackMeta.type, // 'chat' or 'message'
    session_id: feedbackMeta.session_id,
    message_index: feedbackMeta.message_index,
    message_type: feedbackMeta.message_type,
    message_timestamp: feedbackMeta.message_timestamp,
    message_text_excerpt: feedbackMeta.message_text_excerpt,
    tool_name: feedbackMeta.tool_name,
    message_count: feedbackMeta.message_count,
    raw_message: feedbackMeta.raw,
    submitted_by: currentUser?.email ?? null,
    submitted_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await db.functions.invoke('chat-feedback', {
      body: payload,
    });

    if (error) throw error;

    fbStatus.textContent = 'Feedback submitted. Thank you!';
    fbStatus.className = 'fb-status success';
    setTimeout(closeFeedbackModal, 1500);
  } catch (err) {
    console.error('Feedback submit error:', err);
    fbStatus.textContent = 'Failed to submit: ' + (err.message || 'Unknown error');
    fbStatus.className = 'fb-status error';
    fbSubmit.disabled = false;
  }
}

// ── Reviewed Sessions ──
function getReviewedKey() {
  return 'sb_reviewed_' + (localStorage.getItem('sb_project_id') || 'default');
}

function loadReviewed() {
  try {
    const data = JSON.parse(localStorage.getItem(getReviewedKey()) || '[]');
    reviewedSessions = new Set(Array.isArray(data) ? data : []);
  } catch { reviewedSessions = new Set(); }
}

function saveReviewed() {
  localStorage.setItem(getReviewedKey(), JSON.stringify(Array.from(reviewedSessions)));
}

function toggleReviewed(sessionId) {
  if (reviewedSessions.has(sessionId)) {
    reviewedSessions.delete(sessionId);
  } else {
    reviewedSessions.add(sessionId);
  }
  saveReviewed();
  updateReviewedButton(sessionId);
  renderSessionList();
}

function updateReviewedButton(sessionId) {
  const btn = document.getElementById('chat-reviewed-btn');
  if (!btn) return;
  const isReviewed = reviewedSessions.has(sessionId);
  btn.textContent = isReviewed ? 'Reviewed ✓' : 'Mark Reviewed';
  btn.classList.toggle('reviewed-active', isReviewed);
}

// ── Utilities ──
function escapeHtml(str) {
  if (typeof str !== 'string') str = String(str);
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

const TIME_ZONE = 'Europe/Chisinau';

// Populate and show the environment switcher in the sidebar header
function setupEnvSwitcher() {
  if (!envSwitcher || environments.length === 0) return;
  const savedEnvIdx = parseInt(localStorage.getItem('sb_selected_env') || '0', 10);

  envSwitcher.innerHTML = '';
  environments.forEach((env, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = env.name || ('Env ' + (i + 1));
    envSwitcher.appendChild(opt);
  });
  envSwitcher.value = savedEnvIdx;
  envSwitcher.classList.add('active');

  // If only one environment, show as a static label (no dropdown arrow)
  if (environments.length <= 1) {
    envSwitcher.classList.add('single');
  } else {
    envSwitcher.classList.remove('single');
  }

  // Switch environment on change
  envSwitcher.addEventListener('change', handleEnvSwitch);
}

async function handleEnvSwitch() {
  const newIdx = parseInt(envSwitcher.value, 10);
  const newEnv = environments[newIdx];
  if (!newEnv) return;

  // Save new environment selection
  localStorage.setItem('sb_selected_env', newIdx);
  localStorage.setItem('sb_project_id', newEnv.projectId);
  localStorage.setItem('sb_key', newEnv.anonKey);

  // Sign out of current environment
  if (db) await db.auth.signOut().catch(() => {});
  unsubscribeRealtime();
  db = null;
  currentUser = null;
  currentUserRole = null;
  allSessions = [];
  sessionMap = new Map();
  currentSessionId = null;
  sessionCursor = null;
  filtersApplied = false;
  currentFilterParams = null;
  noMoreSessions = false;

  // Initialize new client and trigger OAuth
  initSupabaseClient(newEnv.projectId, newEnv.anonKey);

  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });

  if (error) {
    // Revert to previous env on failure
    chatPanel.classList.remove('active');
    loginPanel.style.display = 'flex';
    showLoginError('Failed to switch environment: ' + error.message);
  }
}

// Update the time-gate display showing the visible time window
function updateTimeGate() {
  if (!timeGateEl) return;
  const source = searchResults !== null ? searchResults : allSessions;
  if (source.length === 0) { timeGateEl.textContent = ''; return; }
  // Use 'latest' (last activity) for both bounds — shows the period of session activity
  let oldest = source[0].latest;
  let newest = source[0].latest;
  for (const s of source) {
    if (s.latest < oldest) oldest = s.latest;
    if (s.latest > newest) newest = s.latest;
  }
  const fmt = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: TIME_ZONE,
    });
  };
  timeGateEl.textContent = fmt(oldest) + ' — ' + fmt(newest);
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TIME_ZONE });
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: TIME_ZONE,
  });
}

function formatDatetimeTag(val) {
  if (!val) return '';
  // datetime-local values are "YYYY-MM-DDTHH:MM", date values are "YYYY-MM-DD"
  const d = new Date(val);
  if (isNaN(d)) return val;
  if (val.length <= 10) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── User Roles ──
async function fetchOrCreateUserRole() {
  if (!db || !currentUser) return false;
  try {
    const { data, error } = await db
      .from('chat_view_user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (error || !data) {
      // No role row — user has been removed; revoke access
      await db.auth.signOut();
      db = null;
      currentUser = null;
      showLoginError('Access denied. Access restricted for this email.');
      return false;
    }

    currentUserRole = data.role;
    updateAdminButton();
    return true;
  } catch (err) {
    console.warn('[roles] fetchOrCreateUserRole failed:', err);
    return false;
  }
}

function updateAdminButton() {
  const isAdmin = currentUserRole === 'admin';
  burgerUsersBtn.style.display = isAdmin ? '' : 'none';
  burgerInviteBtn.style.display = isAdmin ? '' : 'none';
  burgerUserRole.textContent = currentUserRole || 'user';
  burgerUserRole.className = 'burger-user-role' + (isAdmin ? ' role-admin' : '');
}

function openAdminModal() {
  if (!adminModalOverlay) return;
  if (adminInfoName) adminInfoName.textContent = currentUser?.name || '';
  if (adminInfoRole) {
    adminInfoRole.textContent = currentUserRole || 'user';
    adminInfoRole.className = 'admin-info-value admin-role-badge' +
      (currentUserRole === 'admin' ? ' role-admin' : '');
  }
  if (adminInviteEmail) adminInviteEmail.value = '';
  if (adminInviteRole) adminInviteRole.value = 'user';
  if (adminInviteStatus) { adminInviteStatus.textContent = ''; adminInviteStatus.className = 'admin-invite-status'; }
  adminModalOverlay.style.display = 'flex';
}

function closeAdminModal() {
  if (adminModalOverlay) adminModalOverlay.style.display = 'none';
}

async function inviteUser(email, role) {
  if (!email || !email.includes('@')) {
    adminInviteStatus.textContent = 'Please enter a valid email address.';
    adminInviteStatus.className = 'admin-invite-status error';
    return;
  }
  const assignedRole = role === 'admin' ? 'admin' : 'user';
  adminInviteBtn.disabled = true;
  adminInviteStatus.textContent = 'Sending invitation...';
  adminInviteStatus.className = 'admin-invite-status';
  try {
    const { data, error } = await db.functions.invoke('invite-user', {
      body: { email, role: assignedRole },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    adminInviteStatus.textContent = 'Invitation sent to ' + email + ' as ' + assignedRole;
    adminInviteStatus.className = 'admin-invite-status success';
    adminInviteEmail.value = '';
    if (adminInviteRole) adminInviteRole.value = 'user';
  } catch (err) {
    console.error('[roles] inviteUser error:', err);
    adminInviteStatus.textContent = 'Failed: ' + (err.message || 'Unknown error');
    adminInviteStatus.className = 'admin-invite-status error';
  } finally {
    adminInviteBtn.disabled = false;
  }
}

// ── Users Modal ──

function closeUsersModal() {
  if (usersModalOverlay) usersModalOverlay.classList.remove('open');
}

async function openUsersModal() {
  if (!usersModalOverlay || !usersModalBody) return;
  usersModalBody.innerHTML = '<div class="users-dropdown-loading">Loading…</div>';
  usersModalOverlay.classList.add('open');
  try {
    const { data, error } = await db
      .from('chat_view_user_roles')
      .select('email, role')
      .order('email', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) {
      usersModalBody.innerHTML = '<div class="users-dropdown-empty">No users found.</div>';
      return;
    }
    usersModalBody.innerHTML = data.map(u => {
      const email = u.email || '';
      const name = email.includes('@') ? email.split('@')[0] : email;
      return `<div class="users-dropdown-item">
        <div class="users-dropdown-info">
          <span class="users-dropdown-username">${escapeHtml(name)}</span>
          <span class="users-dropdown-email">${escapeHtml(email)}</span>
        </div>
        <span class="users-dropdown-role${u.role === 'admin' ? ' role-admin' : ''}">${escapeHtml(u.role || 'user')}</span>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('[users] fetch error:', err);
    usersModalBody.innerHTML = '<div class="users-dropdown-empty">Failed to load users.</div>';
  }
}
