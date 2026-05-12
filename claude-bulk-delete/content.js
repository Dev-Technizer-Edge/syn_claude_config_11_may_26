// ─────────────────────────────────────────────────────────────────────────────
// FILE: content.js
// Claude Bulk Delete — Content Script
// Runs on https://claude.ai/* at document_idle (Manifest V3)
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── Guard: only inject once per page lifetime ──────────────────────────────
  if (window.__claudeBulkDeleteLoaded) return;
  window.__claudeBulkDeleteLoaded = true;

  // ── Namespace prefix used on every injected element / data attribute ───────
  const NS = 'cbd';

  // ── Logging helper — prefix makes it easy to grep in DevTools ─────────────
  const log  = (...a) => console.log(`[CBD]`, ...a);
  const warn = (...a) => console.warn(`[CBD]`, ...a);

  // ── State ──────────────────────────────────────────────────────────────────
  let bulkMode    = false;   // Is the bulk-select UI active?
  let orgId       = null;    // Cached organization UUID from /api/organizations
  let selected    = new Set(); // Set of conversation UUIDs currently checked
  let observer    = null;    // MutationObserver watching for sidebar re-renders
  let prefetchDone = false;  // Has orgId been fetched at least once this session?

  // ══════════════════════════════════════════════════════════════════════════
  // 1.  ORG-ID PREFETCH
  //     We call this as soon as bulk-mode is toggled ON so that by the time
  //     the user clicks Delete, the orgId is already in memory.
  // ══════════════════════════════════════════════════════════════════════════
  async function fetchOrgId() {
    if (orgId) return orgId; // Use cached value
    try {
      const res = await fetch('/api/organizations', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // The first org in the array is the user's primary org
      orgId = data?.[0]?.uuid;
      if (!orgId) throw new Error('orgs[0].uuid missing in response');
      log('orgId fetched:', orgId);
      return orgId;
    } catch (err) {
      warn('Could not fetch orgId:', err);
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2.  DELETE A SINGLE CONVERSATION
  //     Step 1: DELETE /api/organizations/{orgId}/chat_conversations/{convId}
  //     Step 2 (fallback): PATCH same URL with { is_archived: true }
  // ══════════════════════════════════════════════════════════════════════════
  async function deleteConversation(convId) {
    const url = `/api/organizations/${orgId}/chat_conversations/${convId}`;
    // Primary: hard delete
    const res = await fetch(url, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok || res.status === 204) return; // success

    // Fallback: archive (soft delete)
    warn(`DELETE failed (${res.status}), falling back to PATCH archive for ${convId}`);
    const patchRes = await fetch(url, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: true }),
    });
    if (!patchRes.ok) throw new Error(`PATCH archive failed: ${patchRes.status}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3.  TOAST NOTIFICATIONS
  // ══════════════════════════════════════════════════════════════════════════
  function showToast(msg, isError = false) {
    const old = document.getElementById('cbd-toast');
    if (old) old.remove();

    const t = document.createElement('div');
    t.id = 'cbd-toast';
    t.className = `cbd-toast ${isError ? 'cbd-toast--error' : 'cbd-toast--success'}`;
    t.textContent = msg;
    document.body.appendChild(t);

    // Fade in
    requestAnimationFrame(() => t.classList.add('cbd-toast--visible'));

    // Auto-remove after 4 s
    setTimeout(() => {
      t.classList.remove('cbd-toast--visible');
      setTimeout(() => t.remove(), 400);
    }, 4000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4.  CHECKBOX INJECTION
  //
  //     Verified DOM structure (from the extension brief):
  //
  //       <li>
  //         <div>              ← ROW WRAPPER — direct child of <li>
  //           <a href="/chat/UUID">  ← conversation link
  //         </div>
  //       </li>
  //
  //     WHY we walk up from <a> to its grandparent (the <li> child):
  //       The <a> is NOT a direct child of <li>. Calling insertBefore on <li>
  //       with a reference to <a> would throw a silent DOM exception ("The node
  //       before which the new node is to be inserted is not a child of this node").
  //       We must insert inside the ROW WRAPPER (the div), not the <li> itself.
  //
  //     WHY display:flex is set on the ROW WRAPPER and not on <li>:
  //       The <li> may have its own internal layout managed by claude.ai's React
  //       component. We only flex the div that wraps the <a> so our checkbox
  //       sits neatly to the left without disrupting outer layout.
  // ══════════════════════════════════════════════════════════════════════════
  function injectCheckboxes() {
    // Find every conversation link in the sidebar
    const links = document.querySelectorAll('nav a[href^="/chat/"]');

    links.forEach((link) => {
      // ── Idempotency guard 1: dataset flag set after first injection ────────
      if (link.dataset.cbdDone) return;

      // ── Walk up to the ROW WRAPPER (direct child of <li>) ─────────────────
      // parentElement = the div wrapping the <a>
      const rowWrapper = link.parentElement;
      if (!rowWrapper) return;

      // Safety: confirm the rowWrapper's parent really is an <li>
      const li = rowWrapper.parentElement;
      if (!li || li.tagName !== 'LI') return;

      // ── Idempotency guard 2: skip if checkbox column already present ───────
      if (rowWrapper.querySelector(`.${NS}-check-col`)) return;

      // ── Extract conversation UUID from href ("/chat/<UUID>") ───────────────
      const convId = link.pathname.split('/').pop();
      if (!convId) return;

      // ── Build the custom checkbox structure ───────────────────────────────
      //   <span class="cbd-check-col">
      //     <input type="checkbox" class="cbd-cb" data-conv-id="UUID">
      //     <span class="cbd-mark"></span>   ← visual checkbox drawn in CSS
      //   </span>
      const col = document.createElement('span');
      col.className = `${NS}-check-col`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = `${NS}-cb`;
      cb.dataset.convId = convId;
      cb.setAttribute('aria-label', 'Select conversation');

      const mark = document.createElement('span');
      mark.className = `${NS}-mark`;

      col.appendChild(cb);
      col.appendChild(mark);

      // ── Insert checkbox column as FIRST CHILD of the row wrapper ──────────
      // insertBefore(newNode, referenceNode) — referenceNode must be a child
      // of rowWrapper. rowWrapper.firstChild is always valid here.
      rowWrapper.insertBefore(col, rowWrapper.firstChild);

      // ── Apply flex to the ROW WRAPPER so checkbox + title sit side-by-side ─
      rowWrapper.classList.add(`${NS}-row`);

      // ── Sync visual state if this conv was already selected ───────────────
      if (selected.has(convId)) {
        cb.checked = true;
        li.classList.add(`${NS}-selected`);
      }

      // ── Checkbox change handler ────────────────────────────────────────────
      cb.addEventListener('change', () => toggleConv(convId, cb.checked, li));

      // ── Row click handler (clicking anywhere in the row toggles it) ────────
      rowWrapper.addEventListener('click', (e) => {
        // Only act on direct row clicks, not on the checkbox label itself
        if (e.target === cb || e.target === mark) return;
        if (!bulkMode) return;
        cb.checked = !cb.checked;
        toggleConv(convId, cb.checked, li);
      });

      // ── Prevent navigation when clicking <a> in bulk mode ─────────────────
      // WHY capture phase (true): we need to intercept the event BEFORE React's
      // own handlers (which fire in bubble phase) have a chance to navigate.
      link.addEventListener('click', (e) => {
        if (bulkMode) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }, true /* capture */);

      // ── Mark link as processed so we never re-inject ──────────────────────
      link.dataset.cbdDone = '1';
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5.  TOGGLE A CONVERSATION'S SELECTED STATE
  // ══════════════════════════════════════════════════════════════════════════
  function toggleConv(convId, isChecked, li) {
    if (isChecked) {
      selected.add(convId);
      li.classList.add(`${NS}-selected`);
    } else {
      selected.delete(convId);
      li.classList.remove(`${NS}-selected`);
    }
    updateToolbar();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6.  TOOLBAR — "N chats selected" / Select All / Clear / Delete N
  // ══════════════════════════════════════════════════════════════════════════
  let toolbar = null;
  let deleteBtn = null;
  let countLabel = null;

  function createToolbar() {
    toolbar = document.createElement('div');
    toolbar.id = 'cbd-toolbar';
    toolbar.className = 'cbd-toolbar';

    countLabel = document.createElement('span');
    countLabel.className = 'cbd-count';
    countLabel.textContent = 'Click chats to select';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'cbd-btn cbd-btn--ghost';
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.addEventListener('click', selectAll);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'cbd-btn cbd-btn--ghost';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', clearSelection);

    deleteBtn = document.createElement('button');
    deleteBtn.className = 'cbd-btn cbd-btn--danger';
    deleteBtn.textContent = 'Delete 0';
    deleteBtn.disabled = true;
    deleteBtn.addEventListener('click', onDeleteClick);

    toolbar.appendChild(countLabel);
    toolbar.appendChild(selectAllBtn);
    toolbar.appendChild(clearBtn);
    toolbar.appendChild(deleteBtn);
    document.body.appendChild(toolbar);
  }

  function updateToolbar() {
    if (!toolbar) return;
    const n = selected.size;
    countLabel.textContent = n > 0 ? `${n} chat${n !== 1 ? 's' : ''} selected` : 'Click chats to select';
    deleteBtn.textContent = `Delete ${n}`;
    deleteBtn.disabled = n === 0;
  }

  function selectAll() {
    document.querySelectorAll(`.${NS}-cb`).forEach((cb) => {
      cb.checked = true;
      const li = cb.closest('li');
      if (li) li.classList.add(`${NS}-selected`);
      selected.add(cb.dataset.convId);
    });
    updateToolbar();
  }

  function clearSelection() {
    document.querySelectorAll(`.${NS}-cb`).forEach((cb) => {
      cb.checked = false;
      const li = cb.closest('li');
      if (li) li.classList.remove(`${NS}-selected`);
    });
    selected.clear();
    updateToolbar();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7.  DELETE FLOW
  // ══════════════════════════════════════════════════════════════════════════
  async function onDeleteClick() {
    const n = selected.size;
    if (n === 0) return;

    // Confirm dialog
    const ok = confirm(`Delete ${n} chat${n !== 1 ? 's' : ''}? This cannot be undone.`);
    if (!ok) return;

    // Ensure orgId is available (use cached value if pre-fetched)
    const org = await fetchOrgId();
    if (!org) {
      showToast('❌ Could not fetch organization ID. No conversations deleted.', true);
      return;
    }

    // Freeze toolbar during deletion
    deleteBtn.disabled = true;

    const ids = [...selected];
    let doneCount = 0;
    let failCount = 0;

    for (const convId of ids) {
      // Live counter in button: "Deleting… X/N"
      deleteBtn.textContent = `Deleting… ${doneCount + 1}/${n}`;

      try {
        await deleteConversation(convId);
        doneCount++;

        // Fade the deleted row to signal it's gone
        const li = document.querySelector(`a[href="/chat/${convId}"]`)?.closest('li');
        if (li) li.classList.add(`${NS}-deleted`);

        selected.delete(convId);
      } catch (err) {
        warn('Failed to delete', convId, err);
        failCount++;
      }

      // ── Throttle: 400 ms between API calls to avoid rate-limiting ──────────
      await new Promise((r) => setTimeout(r, 400));
    }

    // Final status toast
    if (failCount === 0) {
      showToast(`✅ Deleted ${doneCount} conversation${doneCount !== 1 ? 's' : ''}.`);
    } else {
      showToast(`⚠️ Deleted ${doneCount}, failed ${failCount}. Check console for details.`, true);
    }

    // ── Navigate to root after 3000 ms ────────────────────────────────────
    //
    // WHY location.href = '/' and NOT location.reload():
    //   claude.ai is a React SPA that uses React Query for data fetching.
    //   React Query aggressively caches the conversation list in memory.
    //   Calling location.reload() causes the page to rehydrate from that
    //   in-memory cache — so deleted conversations immediately reappear.
    //
    //   Assigning location.href = '/' forces a full navigation (a brand-new
    //   page load), which discards all in-memory state including the React
    //   Query cache. The sidebar then re-fetches from the server and the
    //   deleted conversations are correctly absent.
    //
    //   We wait 3000 ms before navigating to give the server enough time to
    //   propagate all deletions before the sidebar re-fetches on the new load.
    // ─────────────────────────────────────────────────────────────────────────
    setTimeout(() => {
      window.location.href = '/';
    }, 3000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8.  TOGGLE BUTTON (fixed bottom-right)
  // ══════════════════════════════════════════════════════════════════════════
  function createToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'cbd-toggle';
    btn.className = 'cbd-toggle';
    btn.setAttribute('aria-label', 'Toggle bulk select mode');
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 11 12 14 22 4"></polyline>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
      </svg>
      <span>Bulk Select</span>
    `;

    btn.addEventListener('click', () => {
      bulkMode = !bulkMode;
      btn.classList.toggle('cbd-toggle--active', bulkMode);
      btn.querySelector('span').textContent = bulkMode ? 'Exit Select' : 'Bulk Select';

      if (bulkMode) {
        // Show toolbar
        if (!toolbar) createToolbar();
        toolbar.classList.add('cbd-toolbar--visible');

        // Inject checkboxes into all currently visible rows
        injectCheckboxes();

        // Make checkboxes visible
        document.querySelectorAll(`.${NS}-check-col`).forEach((el) => {
          el.style.display = 'flex';
        });

        // Start watching for new rows (lazy-loaded conversations, re-renders)
        startObserver();

        // Prefetch orgId in the background so delete is instant later
        if (!prefetchDone) {
          prefetchDone = true;
          fetchOrgId().catch(() => {});
        }
      } else {
        // Exit bulk mode: hide toolbar, hide checkboxes, clear state
        if (toolbar) toolbar.classList.remove('cbd-toolbar--visible');
        document.querySelectorAll(`.${NS}-check-col`).forEach((el) => {
          el.style.display = 'none';
        });
        clearSelection();
        stopObserver();
      }
    });

    document.body.appendChild(btn);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9.  MUTATION OBSERVER
  //     Watches document.body for DOM changes (sidebar re-renders, lazy load).
  //     Re-runs injectCheckboxes() so newly added rows get checkboxes.
  // ══════════════════════════════════════════════════════════════════════════
  function startObserver() {
    if (observer) return; // Already running
    observer = new MutationObserver(() => {
      if (bulkMode) injectCheckboxes();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    log('MutationObserver started');
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
      log('MutationObserver stopped');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 10.  INIT — Wait for the sidebar to be in the DOM, then mount the button
  // ══════════════════════════════════════════════════════════════════════════
  function init() {
    // If nav already exists, mount immediately
    if (document.querySelector('nav')) {
      log('Nav found — mounting toggle button');
      createToggleButton();
      return;
    }

    // Otherwise wait for nav to appear (SPA may render it after document_idle)
    log('Nav not yet found — waiting via MutationObserver');
    const initObserver = new MutationObserver(() => {
      if (document.querySelector('nav')) {
        initObserver.disconnect();
        log('Nav appeared — mounting toggle button');
        createToggleButton();
      }
    });
    initObserver.observe(document.body, { childList: true, subtree: true });
  }

  init();

})();
