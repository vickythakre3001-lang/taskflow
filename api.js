// Small wrapper around fetch so every call site gets the same error
// handling: a failed request always throws an Error with a readable
// message, instead of components needing to check res.ok themselves.

const BASE = '/api';

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response (e.g. a proxy error page) — fall through to the
    // generic message below.
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  return data;
}

export function getBoards() {
  return request('/boards');
}

export function getBoard(boardId, { priority } = {}) {
  const query = priority ? `?priority=${encodeURIComponent(priority)}` : '';
  return request(`/boards/${boardId}${query}`);
}

export function createTask({ columnId, title, description, priority }) {
  return request('/tasks', {
    method: 'POST',
    body: JSON.stringify({ columnId, title, description, priority }),
  });
}

export function updateTask(taskId, { title, description, priority }) {
  return request(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ title, description, priority }),
  });
}

export function moveTask(taskId, columnId) {
  return request(`/tasks/${taskId}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ columnId }),
  });
}

export function deleteTask(taskId) {
  return request(`/tasks/${taskId}`, { method: 'DELETE' });
}
