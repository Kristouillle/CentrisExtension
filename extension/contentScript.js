(() => {
  const WIDGET_ID = 'centris-comments-widget';
  const MAX_USERNAME = 32;
  const MAX_BODY = 1000;
  const PAGE_SIZE = 50;
  const SUPABASE_URL = 'https://tbabuxbjwtetngdggjmy.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_T3cT3ZWzvyNPwVPPKb6h0A_Bp06IK06';

  let currentListingKey = null;
  let widget = null;
  let commentSort = 'recent';
  const cooldowns = new Map();

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

  function getCooldown(key) {
    return cooldowns.get(key) || 0;
  }

  function setCooldown(key, value) {
    cooldowns.set(key, value);
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

    const header = document.createElement('div');
    header.className = 'centris-comments__header';

    const title = createTextElement('h2', 'centris-comments__title', 'Comments');
    const sortButton = document.createElement('button');
    sortButton.type = 'button';
    sortButton.className = 'centris-comments__sort';
    sortButton.setAttribute('aria-label', 'Sort by most recent');
    sortButton.title = 'Sort by most recent';
    sortButton.dataset.state = 'recent';
    const sortLabel = createTextElement('span', 'centris-comments__sr-only', 'Sort: Recent');
    sortButton.append(sortLabel);
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
    header.append(title, sortButton);
    container.append(header, status, list, form);

    return {
      container,
      sortButton,
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
      document.getElementById('maindiv'),
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
    return {
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY
    };
  }

  async function fetchComments(listingKey, sortOrder) {
    const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase config. Update SUPABASE_URL and SUPABASE_ANON_KEY in contentScript.js.');
    }

    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/comments`;
    const params = new URLSearchParams({
      select: 'id,username,body,created_at',
      listing_key: `eq.${listingKey}`,
      is_deleted: 'eq.false',
      order: `created_at.${sortOrder}`,
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

  async function fetchReplies(listingKey) {
    const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase config. Update SUPABASE_URL and SUPABASE_ANON_KEY in contentScript.js.');
    }

    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/comment_replies`;
    const params = new URLSearchParams({
      select: 'id,comment_id,username,body,created_at',
      listing_key: `eq.${listingKey}`,
      is_deleted: 'eq.false',
      order: 'created_at.asc',
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
      throw new Error(`Failed to load replies (${response.status}): ${text}`);
    }

    return response.json();
  }

  function renderReplies(container, replies) {
    if (!replies.length) {
      return;
    }

    const list = document.createElement('div');
    list.className = 'centris-comments__replies';

    replies.forEach((reply) => {
      const item = document.createElement('article');
      item.className = 'centris-comments__reply';

      const username = createTextElement('p', 'centris-comments__meta', reply.username || 'Anonymous');
      const timestamp = createTextElement('time', 'centris-comments__time', formatDate(reply.created_at));
      const body = createTextElement('p', 'centris-comments__body', reply.body);

      item.append(username, timestamp, body);
      list.append(item);
    });

    container.append(list);
  }

  function buildReplyForm(commentId) {
    const form = document.createElement('form');
    form.className = 'centris-comments__reply-form';
    form.dataset.commentId = commentId;

    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.name = 'username';
    usernameInput.maxLength = MAX_USERNAME;
    usernameInput.placeholder = 'Anonymous';

    const replyInput = document.createElement('textarea');
    replyInput.name = 'body';
    replyInput.maxLength = MAX_BODY;
    replyInput.required = true;
    replyInput.rows = 3;

    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Post reply';

    form.append(usernameInput, replyInput, button);
    return form;
  }

  function renderComments(comments, replies) {
    widget.list.textContent = '';

    if (!comments.length) {
      widget.list.append(createTextElement('p', 'centris-comments__empty', 'No comments yet.'));
      return;
    }

    const repliesByComment = new Map();
    replies.forEach((reply) => {
      if (!repliesByComment.has(reply.comment_id)) {
        repliesByComment.set(reply.comment_id, []);
      }
      repliesByComment.get(reply.comment_id).push(reply);
    });

    comments.forEach((comment) => {
      const item = document.createElement('article');
      item.className = 'centris-comments__item';
      item.dataset.commentId = comment.id;

      const username = createTextElement('p', 'centris-comments__meta', comment.username || 'Anonymous');
      const timestamp = createTextElement('time', 'centris-comments__time', formatDate(comment.created_at));
      const body = createTextElement('p', 'centris-comments__body', comment.body);

      const actions = document.createElement('div');
      actions.className = 'centris-comments__actions';

      const replyToggle = document.createElement('button');
      replyToggle.type = 'button';
      replyToggle.className = 'centris-comments__reply-toggle';
      replyToggle.textContent = 'Reply';

      const replyForm = buildReplyForm(comment.id);
      replyForm.hidden = true;

      actions.append(replyToggle);

      item.append(username, timestamp, body, actions);
      renderReplies(item, repliesByComment.get(comment.id) || []);
      item.append(replyForm);
      widget.list.append(item);
    });
  }

  async function loadComments(listingKey) {
    widget.status.textContent = 'Loading...';

    try {
      const sortOrder = commentSort === 'recent' ? 'desc' : 'asc';
      const [comments, replies] = await Promise.all([
        fetchComments(listingKey, sortOrder),
        fetchReplies(listingKey)
      ]);
      renderComments(comments, replies);
      widget.status.textContent = '';
    } catch (error) {
      widget.status.textContent = error.message || 'Error loading comments.';
      console.error('Centris Comments: load failed.', error);
    }
  }

  async function postComment(listingKey, username, body) {
    const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase config. Update SUPABASE_URL and SUPABASE_ANON_KEY in contentScript.js.');
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

  async function postReply(listingKey, commentId, username, body) {
    const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase config. Update SUPABASE_URL and SUPABASE_ANON_KEY in contentScript.js.');
    }

    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/comment_replies`;
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
          comment_id: commentId,
          username: username || null,
          body
        }
      ])
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Reply failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  function registerFormHandler(listingKey) {
    widget.sortButton.addEventListener('click', async () => {
      commentSort = commentSort === 'recent' ? 'old' : 'recent';
      const isRecent = commentSort === 'recent';
      widget.sortButton.dataset.state = commentSort;
      widget.sortButton.setAttribute('aria-label', isRecent ? 'Sort by most recent' : 'Sort by oldest');
      widget.sortButton.title = isRecent ? 'Sort by most recent' : 'Sort by oldest';
      const label = widget.sortButton.querySelector('.centris-comments__sr-only');
      if (label) {
        label.textContent = isRecent ? 'Sort: Recent' : 'Sort: Old';
      }
      await loadComments(listingKey);
    });

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
      const lastPost = getCooldown(rateKey);
      if (now - lastPost < 10_000) {
        widget.status.textContent = 'Please wait at least 10 seconds between posts.';
        return;
      }

      widget.submitButton.disabled = true;
      widget.status.textContent = 'Posting...';

      try {
        await postComment(listingKey, username, body);
        setCooldown(rateKey, now);
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

    widget.container.addEventListener('click', (event) => {
      const button = event.target.closest('.centris-comments__reply-toggle');
      if (!button) {
        return;
      }

      const item = button.closest('.centris-comments__item');
      const form = item?.querySelector('.centris-comments__reply-form');
      if (!form) {
        return;
      }

      form.hidden = !form.hidden;
      button.textContent = form.hidden ? 'Reply' : 'Cancel';
    });

    widget.container.addEventListener('submit', async (event) => {
      const form = event.target.closest('.centris-comments__reply-form');
      if (!form) {
        return;
      }

      event.preventDefault();

      const commentId = form.dataset.commentId;
      const username = form.querySelector('input[name="username"]').value.trim();
      const body = form.querySelector('textarea[name="body"]').value.trim();

      const validationError = validateInput(username, body);
      if (validationError) {
        widget.status.textContent = validationError;
        return;
      }

      const rateKey = `centris-last-reply-${commentId}`;
      const now = Date.now();
      const lastPost = getCooldown(rateKey);
      if (now - lastPost < 10_000) {
        widget.status.textContent = 'Please wait at least 10 seconds between replies.';
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      widget.status.textContent = 'Posting reply...';

      try {
        await postReply(listingKey, commentId, username, body);
        setCooldown(rateKey, now);
        form.querySelector('textarea[name="body"]').value = '';
        widget.status.textContent = 'Reply posted.';
        await loadComments(listingKey);
      } catch (error) {
        widget.status.textContent = error.message || 'Error posting reply.';
        console.error('Centris Comments: reply failed.', error);
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  async function mountWidget(listingKey) {
    if (widget) {
      widget.container.remove();
    }

    widget = buildWidget();
    const insertionPoint = findInsertionPoint();
    if (insertionPoint?.id === 'maindiv' && insertionPoint.parentNode) {
      insertionPoint.insertAdjacentElement('afterend', widget.container);
    } else {
      insertionPoint.appendChild(widget.container);
    }
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
