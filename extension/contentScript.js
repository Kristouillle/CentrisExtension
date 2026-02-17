(() => {
  const WIDGET_ID = 'centris-comments-widget';
  const INSTALL_ID_KEY = 'centrisInstallId';
  const MAX_USERNAME = 32;
  const MAX_BODY = 1000;
  const PAGE_SIZE = 50;

  let currentListingKey = null;
  let widget = null;

  function getLastPathSegment(pathname) {
    const cleanPath = pathname.replace(/\/+$/, '');
    const segments = cleanPath.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
  }

  function getListingIdFromUrl(urlString) {
    try {
      const url = new URL(urlString);
      const segment = getLastPathSegment(url.pathname);
      if (!segment || !/^\d+$/.test(segment)) {
        return null;
      }
      return segment;
    } catch (error) {
      console.error('Centris Comments: invalid URL.', error);
      return null;
    }
  }

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
  }

  function getOrCreateInstallId() {
    return storageGet([INSTALL_ID_KEY]).then((result) => {
      if (result[INSTALL_ID_KEY]) {
        return result[INSTALL_ID_KEY];
      }

      const installId = (typeof crypto?.randomUUID === 'function')
        ? crypto.randomUUID()
        : `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      return storageSet({ [INSTALL_ID_KEY]: installId }).then(() => installId);
    });
  }

  function createTextElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    element.textContent = text;
    return element;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown date';
    }
    return date.toLocaleString();
  }

  function buildWidget() {
    const container = document.createElement('section');
    container.id = WIDGET_ID;
    container.className = 'centris-comments';

    const header = createTextElement('h2', 'centris-comments__title', 'Comments');
    const status = createTextElement('p', 'centris-comments__status', 'Loading...');
    const list = document.createElement('div');
    list.className = 'centris-comments__list';

    const form = document.createElement('form');
    form.className = 'centris-comments__form';

    const usernameLabel = createTextElement('label', 'centris-comments__label', 'Username (optional)');
    usernameLabel.setAttribute('for', 'centris-comments-username');

    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.id = 'centris-comments-username';
    usernameInput.maxLength = MAX_USERNAME;
    usernameInput.placeholder = 'Anonymous';

    const commentLabel = createTextElement('label', 'centris-comments__label', 'Comment');
    commentLabel.setAttribute('for', 'centris-comments-body');

    const commentInput = document.createElement('textarea');
    commentInput.id = 'centris-comments-body';
    commentInput.maxLength = MAX_BODY;
    commentInput.required = true;
    commentInput.rows = 4;

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = 'Post';

    form.append(usernameLabel, usernameInput, commentLabel, commentInput, submitButton);
    container.append(header, status, list, form);

    return {
      container,
      status,
      list,
      form,
      usernameInput,
      commentInput,
      submitButton
    };
  }

  function findInsertionPoint() {
    const candidates = [
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.querySelector('.property-details, .property-details-container')
    ];

    return candidates.find(Boolean) || document.body;
  }

  function validateInput(username, body) {
    if (username.length > MAX_USERNAME) {
      return `Username must be ${MAX_USERNAME} characters or fewer.`;
    }

    if (body.length < 1 || body.length > MAX_BODY) {
      return `Comment must be between 1 and ${MAX_BODY} characters.`;
    }

    return null;
  }

  async function getSupabaseConfig() {
    const config = await storageGet(['supabaseUrl', 'supabaseAnonKey']);
    return {
      supabaseUrl: config.supabaseUrl || '',
      supabaseAnonKey: config.supabaseAnonKey || ''
    };
  }

  async function fetchComments(listingKey) {
    const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase config. Set it in extension options.');
    }

    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/comments`;
    const params = new URLSearchParams({
      select: 'id,username,body,created_at',
      listing_key: `eq.${listingKey}`,
      is_deleted: 'eq.false',
      order: 'created_at.desc',
      limit: String(PAGE_SIZE)
    });

    const response = await fetch(`${endpoint}?${params.toString()}`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to load comments (${response.status}): ${text}`);
    }

    return response.json();
  }

  function renderComments(comments) {
    widget.list.textContent = '';

    if (!comments.length) {
      widget.list.append(createTextElement('p', 'centris-comments__empty', 'No comments yet.'));
      return;
    }

    comments.forEach((comment) => {
      const item = document.createElement('article');
      item.className = 'centris-comments__item';

      const username = createTextElement('p', 'centris-comments__meta', comment.username || 'Anonymous');
      const timestamp = createTextElement('time', 'centris-comments__time', formatDate(comment.created_at));
      const body = createTextElement('p', 'centris-comments__body', comment.body);

      item.append(username, timestamp, body);
      widget.list.append(item);
    });
  }

  async function loadComments(listingKey) {
    widget.status.textContent = 'Loading...';

    try {
      const comments = await fetchComments(listingKey);
      renderComments(comments);
      widget.status.textContent = '';
    } catch (error) {
      widget.status.textContent = error.message || 'Error loading comments.';
      console.error('Centris Comments: load failed.', error);
    }
  }

  async function postComment(listingKey, username, body) {
    const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase config. Set it in extension options.');
    }

    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/comments`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify([
        {
          listing_key: listingKey,
          username: username || null,
          body
        }
      ])
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Post failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  function registerFormHandler(listingKey) {
    widget.form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const username = widget.usernameInput.value.trim();
      const body = widget.commentInput.value.trim();

      const validationError = validateInput(username, body);
      if (validationError) {
        widget.status.textContent = validationError;
        return;
      }

      const rateKey = `centris-last-post-${listingKey}`;
      const now = Date.now();
      const stored = await storageGet([rateKey]);
      const lastPost = stored[rateKey] || 0;
      if (now - lastPost < 10_000) {
        widget.status.textContent = 'Please wait at least 10 seconds between posts.';
        return;
      }

      widget.submitButton.disabled = true;
      widget.status.textContent = 'Posting...';

      try {
        await postComment(listingKey, username, body);
        await storageSet({ [rateKey]: now });
        widget.commentInput.value = '';
        widget.status.textContent = 'Posted.';
        await loadComments(listingKey);
      } catch (error) {
        widget.status.textContent = error.message || 'Error posting comment.';
        console.error('Centris Comments: post failed.', error);
      } finally {
        widget.submitButton.disabled = false;
      }
    });
  }

  async function mountWidget(listingKey) {
    if (widget) {
      widget.container.remove();
    }

    widget = buildWidget();
    findInsertionPoint().appendChild(widget.container);
    registerFormHandler(listingKey);
    await loadComments(listingKey);
  }

  async function refreshForCurrentUrl() {
    const listingId = getListingIdFromUrl(window.location.href);
    if (!listingId) {
      if (widget) {
        widget.container.remove();
        widget = null;
      }
      currentListingKey = null;
      return;
    }

    const nextKey = `centris:${listingId}`;
    if (currentListingKey === nextKey && widget) {
      return;
    }

    currentListingKey = nextKey;
    await mountWidget(nextKey);
  }

  async function init() {
    await getOrCreateInstallId();
    await refreshForCurrentUrl();

    let previousHref = location.href;
    window.setInterval(async () => {
      if (location.href !== previousHref) {
        previousHref = location.href;
        await refreshForCurrentUrl();
      }
    }, 1000);
  }

  init().catch((error) => {
    console.error('Centris Comments initialization failed.', error);
  });
})();
