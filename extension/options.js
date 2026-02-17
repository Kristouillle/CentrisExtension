const form = document.getElementById('options-form');
const statusElement = document.getElementById('status');
const supabaseUrlInput = document.getElementById('supabase-url');
const supabaseAnonKeyInput = document.getElementById('supabase-anon-key');

function setStatus(text) {
  statusElement.textContent = text;
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

async function restoreOptions() {
  const values = await storageGet(['supabaseUrl', 'supabaseAnonKey']);
  if (values.supabaseUrl) {
    supabaseUrlInput.value = values.supabaseUrl;
  }
  if (values.supabaseAnonKey) {
    supabaseAnonKeyInput.value = values.supabaseAnonKey;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const supabaseUrl = supabaseUrlInput.value.trim().replace(/\/$/, '');
  const supabaseAnonKey = supabaseAnonKeyInput.value.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    setStatus('Please provide both values.');
    return;
  }

  await storageSet({ supabaseUrl, supabaseAnonKey });
  setStatus('Saved.');
});

restoreOptions().catch((error) => {
  setStatus(`Failed to load settings: ${error.message}`);
});
