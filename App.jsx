import React, { useCallback, useEffect, useState } from 'react';
import * as api from './api.js';
import Board from './components/Board.jsx';
import FilterBar from './components/FilterBar.jsx';
import TaskModal from './components/TaskModal.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';

const PRIORITIES = ['All', 'Low', 'Medium', 'High'];

export default function App() {
  const [boardId, setBoardId] = useState(null);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchText, setSearchText] = useState('');

  // Transient error for failed create/edit/delete/move actions. Loading
  // the board itself uses loadError (full-page state) instead.
  const [actionError, setActionError] = useState(null);

  const [modal, setModal] = useState(null); // { mode: 'create', columnId } | { mode: 'edit', task }

  const loadBoard = useCallback(async (id, priority) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getBoard(id, {
        priority: priority === 'All' ? undefined : priority,
      });
      setBoard(data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: find the first board, then load its detail.
  useEffect(() => {
    (async () => {
      try {
        const boards = await api.getBoards();
        if (boards.length === 0) {
          setLoadError('No boards exist yet. Run the seed script and reload.');
          setLoading(false);
          return;
        }
        setBoardId(boards[0].id);
      } catch (err) {
        setLoadError(err.message);
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (boardId != null) loadBoard(boardId, priorityFilter);
  }, [boardId, priorityFilter, loadBoard]);

  function runAction(promise, { onSuccess } = {}) {
    setActionError(null);
    promise
      .then((result) => {
        onSuccess?.(result);
        loadBoard(boardId, priorityFilter);
      })
      .catch((err) => setActionError(err.message));
  }

  function handleCreateTask(columnId, fields) {
    runAction(api.createTask({ columnId, ...fields }), {
      onSuccess: () => setModal(null),
    });
  }

  function handleEditTask(taskId, fields) {
    runAction(api.updateTask(taskId, fields), { onSuccess: () => setModal(null) });
  }

  function handleDeleteTask(taskId) {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    runAction(api.deleteTask(taskId));
  }

  function handleMoveTask(taskId, columnId) {
    runAction(api.moveTask(taskId, columnId));
  }

  const searchLower = searchText.trim().toLowerCase();
  const visibleBoard =
    board && searchLower
      ? {
          ...board,
          columns: board.columns.map((col) => ({
            ...col,
            tasks: col.tasks.filter((t) => t.title.toLowerCase().includes(searchLower)),
          })),
        }
      : board;

  return (
    <div className="app">
      <header className="app-header">
        <h1>TaskFlow{board ? ` — ${board.name}` : ''}</h1>
      </header>

      {actionError && (
        <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {loadError && (
        <div className="page-state page-state--error">
          <p>{loadError}</p>
          <button onClick={() => loadBoard(boardId, priorityFilter)}>Retry</button>
        </div>
      )}

      {!loadError && loading && !board && <div className="page-state">Loading board…</div>}

      {!loadError && board && (
        <>
          <FilterBar
            priorities={PRIORITIES}
            priorityFilter={priorityFilter}
            onPriorityChange={setPriorityFilter}
            searchText={searchText}
            onSearchChange={setSearchText}
          />
          <Board
            board={visibleBoard}
            onAddTask={(columnId) => setModal({ mode: 'create', columnId })}
            onEditTask={(task) => setModal({ mode: 'edit', task })}
            onDeleteTask={handleDeleteTask}
            onMoveTask={handleMoveTask}
          />
        </>
      )}

      {modal && (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          onCancel={() => setModal(null)}
          onSubmit={(fields) =>
            modal.mode === 'create'
              ? handleCreateTask(modal.columnId, fields)
              : handleEditTask(modal.task.id, fields)
          }
        />
      )}
    </div>
  );
}
