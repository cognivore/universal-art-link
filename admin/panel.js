const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  apiAvailable: false,
  connecting: false,
  deploying: false,
  connection: null,
};

const logBox = document.querySelector('[data-log]');

const addLog = (message, variant = 'info') => {
  if (!logBox) return;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.dataset.variant = variant;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logBox.prepend(entry);
};

const setStatusText = (selector, text) => {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = text;
  }
};

const setButtonState = () => {
  const deployButton = document.querySelector('[data-deploy]');
  const disconnectButton = document.querySelector('[data-disconnect]');
  const connectButton = document.querySelector('.connect-button');

  if (connectButton) {
    connectButton.disabled = state.connecting;
    connectButton.textContent = state.connecting ? 'Connecting…' : 'Connect';
  }

  if (deployButton) {
    deployButton.disabled = !state.connection || state.deploying || !state.apiAvailable;
    deployButton.textContent = state.deploying
      ? 'Deploying…'
      : state.connection
        ? `Deploy to ${state.connection.baseUrl}`
        : 'Deploy site';
  }

  if (disconnectButton) {
    disconnectButton.disabled = !state.connection || state.deploying || state.connecting;
  }
};

const updateConnectionView = () => {
  const statusMeta = document.querySelector('[data-connection-meta]');
  if (!state.apiAvailable) {
    setStatusText('[data-connection-status]', 'Offline');
    if (statusMeta) {
      statusMeta.textContent = 'Admin API unavailable. Run `node build/cli.js dev` locally.';
    }
    return;
  }

  if (!state.connection) {
    setStatusText('[data-connection-status]', 'Not connected');
    if (statusMeta) {
      statusMeta.textContent = 'Use the form above to connect to your deployment host.';
    }
    return;
  }

  setStatusText('[data-connection-status]', state.connection.remoteName ?? 'Connected remote');
  if (statusMeta) {
    const target = state.connection.targetPath ? ` → ${state.connection.targetPath}` : '';
    statusMeta.textContent = `Verified ${new Date(state.connection.lastVerifiedAt).toLocaleString()}${target}`;
  }
};

const updateDeployStatus = (message, variant = 'info') => {
  const element = document.querySelector('[data-deploy-status]');
  if (!element) return;
  element.textContent = message;
  element.dataset.variant = variant;
};

const readFormData = () => {
  const url = $('#remote-url')?.value.trim() ?? '';
  const secret = $('#remote-secret')?.value.trim() ?? '';
  return { url, secret };
};

const storeInputs = (url) => {
  if (url) {
    localStorage.setItem('ual:last-remote-url', url);
  }
};

const restoreInputs = () => {
  const savedUrl = localStorage.getItem('ual:last-remote-url');
  if (savedUrl && $('#remote-url')) {
    $('#remote-url').value = savedUrl;
  }
};

const fetchState = async () => {
  try {
    const response = await fetch('/__ual/api/state');
    if (!response.ok) throw new Error('Admin API offline');
    const payload = await response.json();
    state.apiAvailable = true;
    state.connection = payload.connection ?? null;
    state.deploying = payload.isDeploying ?? false;
    updateConnectionView();
    setButtonState();
    if (payload.lastDeploy) {
      updateDeployStatus(payload.lastDeploy.message, payload.lastDeploy.status);
    }
  } catch (error) {
    state.apiAvailable = false;
    state.connection = null;
    updateConnectionView();
    setButtonState();
    updateDeployStatus('Admin API offline. Run `node build/cli.js dev` to enable this page.', 'error');
    addLog(String(error), 'error');
  }
};

const connect = async () => {
  if (!state.apiAvailable) {
    addLog('Admin API is offline. Start the dev server first.', 'error');
    return;
  }
  const { url, secret } = readFormData();
  if (!url || !secret) {
    addLog('Provide both URL and secret', 'error');
    return;
  }
  state.connecting = true;
  setButtonState();
  addLog(`Connecting to ${url}…`);
  try {
    const response = await fetch('/__ual/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: url, secret }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.message ?? 'Failed to connect');
    }
    state.connection = payload.connection;
    storeInputs(payload.connection?.baseUrl ?? url);
    addLog(`Connected to ${state.connection.remoteName ?? state.connection.baseUrl}`, 'success');
    updateConnectionView();
    updateDeployStatus('Connection ready. Deploy when you are happy.', 'success');
  } catch (error) {
    addLog(`Connection failed: ${error.message ?? error}`, 'error');
    updateDeployStatus('Connection failed. Double-check the URL and secret.', 'error');
  } finally {
    state.connecting = false;
    setButtonState();
  }
};

const disconnect = async () => {
  if (!state.connection) return;
  await fetch('/__ual/api/disconnect', { method: 'POST' });
  state.connection = null;
  updateConnectionView();
  setButtonState();
  addLog('Disconnected.');
};

const deploy = async () => {
  if (!state.apiAvailable || !state.connection || state.deploying) return;
  state.deploying = true;
  setButtonState();
  updateDeployStatus('Building site and uploading bundle…', 'info');
  addLog(`Deploying to ${state.connection.baseUrl}…`);
  try {
    const response = await fetch('/__ual/api/deploy', { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.message ?? 'Deployment failed');
    }
    updateDeployStatus(payload.message ?? 'Deployment succeeded.', 'success');
    addLog(payload.message ?? 'Deployment succeeded', 'success');
  } catch (error) {
    updateDeployStatus(error.message ?? 'Deployment failed', 'error');
    addLog(`Deploy failed: ${error.message ?? error}`, 'error');
  } finally {
    state.deploying = false;
    setButtonState();
    void fetchState();
  }
};

const attachHandlers = () => {
  const form = $('#connect-form');
  const deployButton = document.querySelector('[data-deploy]');
  const disconnectButton = document.querySelector('[data-disconnect]');
  const clearButton = document.querySelector('[data-clear-log]');

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void connect();
    });
  }

  if (deployButton) {
    deployButton.addEventListener('click', () => {
      void deploy();
    });
  }

  if (disconnectButton) {
    disconnectButton.addEventListener('click', () => {
      void disconnect();
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      logBox.innerHTML = '';
    });
  }
};

restoreInputs();
attachHandlers();
void fetchState();


