// /src/components/AdminMapEditor.jsx
// Modal/panel for admins to edit map: drag points, add/remove stations and locks

import { useState, useRef } from 'react';
import { useMemo } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';

export default function AdminMapEditor({
  isOpen,
  onClose,
  locks,
  stations,
  onUpdateLocks,
  onUpdateStations,
  onAddStation,
  onRemoveStation,
  onAddLock,
  onRemoveLock,
}) {
  const [editMode, setEditMode] = useState('view'); // 'view', 'editLocks', 'editStations', 'addStation', 'addLock'
  const [editingLocks, setEditingLocks] = useState(locks || []);
  const [editingStations, setEditingStations] = useState(stations || []);
  const [newStation, setNewStation] = useState({
    id: '',
    township: '',
    state: '',
    lat: '',
    lon: '',
    ahps: '',
  });
  const [newLock, setNewLock] = useState({
    id: '',
    name: '',
    riverMile: '',
    lat: '',
    lon: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleSaveLocks = async () => {
    try {
      const res = await fetch('/api/admin/map-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateLocks',
          data: { locks: editingLocks },
        }),
      });
      const result = await res.json();
      if (result.success) {
        onUpdateLocks(editingLocks);
        setSuccess('Locks updated successfully');
        setEditMode('view');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setError(result.message || 'Failed to save locks');
      }
    } catch (e) {
      setError('Error saving locks: ' + e.message);
    }
  };

  const handleSaveStations = async () => {
    try {
      const res = await fetch('/api/admin/map-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateStations',
          data: { stations: editingStations },
        }),
      });
      const result = await res.json();
      if (result.success) {
        onUpdateStations(editingStations);
        setSuccess('Stations updated successfully');
        setEditMode('view');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setError(result.message || 'Failed to save stations');
      }
    } catch (e) {
      setError('Error saving stations: ' + e.message);
    }
  };

  const handleAddStation = async () => {
    setError('');
    const { id, township, state, lat, lon } = newStation;
    
    // Validate
    if (!id || !township || !state || !lat || !lon) {
      setError('All fields (ID, Township, State, Lat, Lon) are required');
      return;
    }
    
    if (isNaN(lat) || isNaN(lon)) {
      setError('Lat and Lon must be numbers');
      return;
    }

    try {
      const res = await fetch('/api/admin/map-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addStation',
          data: newStation,
        }),
      });
      const result = await res.json();
      if (result.success) {
        onAddStation(result.station);
        setNewStation({ id: '', township: '', state: '', lat: '', lon: '', ahps: '' });
        setSuccess('Station added successfully');
        setEditMode('view');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setError(result.message || 'Failed to add station');
      }
    } catch (e) {
      setError('Error adding station: ' + e.message);
    }
  };

  const handleRemoveStation = async (stationId) => {
    if (!confirm(`Remove station ${stationId}?`)) return;
    
    try {
      const res = await fetch('/api/admin/map-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'removeStation',
          data: { id: stationId },
        }),
      });
      const result = await res.json();
      if (result.success) {
        onRemoveStation(stationId);
        setSuccess('Station removed successfully');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setError(result.message || 'Failed to remove station');
      }
    } catch (e) {
      setError('Error removing station: ' + e.message);
    }
  };

  const handleAddLock = async () => {
    setError('');
    const { id, name, riverMile, lat, lon } = newLock;
    
    // Validate
    if (!id || !name || riverMile === '' || !lat || !lon) {
      setError('All fields (ID, Name, River Mile, Lat, Lon) are required');
      return;
    }
    
    if (isNaN(riverMile) || isNaN(lat) || isNaN(lon)) {
      setError('River Mile, Lat, and Lon must be numbers');
      return;
    }

    try {
      const res = await fetch('/api/admin/map-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addLock',
          data: newLock,
        }),
      });
      const result = await res.json();
      if (result.success) {
        onAddLock(result.lock);
        setNewLock({ id: '', name: '', riverMile: '', lat: '', lon: '' });
        setSuccess('Lock added successfully');
        setEditMode('view');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setError(result.message || 'Failed to add lock');
      }
    } catch (e) {
      setError('Error adding lock: ' + e.message);
    }
  };

  const handleRemoveLock = async (lockId) => {
    if (!confirm(`Remove lock ${lockId}?`)) return;
    
    try {
      const res = await fetch('/api/admin/map-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'removeLock',
          data: { id: lockId },
        }),
      });
      const result = await res.json();
      if (result.success) {
        onRemoveLock(lockId);
        setSuccess('Lock removed successfully');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setError(result.message || 'Failed to remove lock');
      }
    } catch (e) {
      setError('Error removing lock: ' + e.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">🗺️ Admin Map Editor</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-600 text-red-200 p-4 rounded mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-900/30 border border-green-600 text-green-200 p-4 rounded mb-4">
            {success}
          </div>
        )}

        {editMode === 'view' && (
          <div className="space-y-4">
            <button
              onClick={() => {
                setEditingLocks(locks || []);
                setEditMode('editLocks');
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition"
            >
              ✏️ Edit Locks/Dams Positions
            </button>
            <button
              onClick={() => {
                setEditingStations(stations || []);
                setEditMode('editStations');
              }}
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2 px-4 rounded transition"
            >
              ✏️ Edit Station Positions
            </button>
            <button
              onClick={() => {
                setNewStation({ id: '', township: '', state: '', lat: '', lon: '', ahps: '' });
                setEditMode('addStation');
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition flex items-center justify-center gap-2"
            >
              <Plus size={20} /> Add New Station
            </button>
            <button
              onClick={() => {
                setNewLock({ id: '', name: '', riverMile: '', lat: '', lon: '' });
                setEditMode('addLock');
              }}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded transition flex items-center justify-center gap-2"
            >
              <Plus size={20} /> Add New Lock/Dam
            </button>
          </div>
        )}

        {editMode === 'editLocks' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Lock/Dam Positions</h3>
            <div className="max-h-[40vh] overflow-y-auto space-y-3">
              {editingLocks.map((lock) => (
                <div
                  key={lock.id}
                  className="bg-slate-800 border border-slate-600 p-4 rounded flex justify-between items-start"
                >
                  <div>
                    <p className="font-semibold text-white">{lock.name}</p>
                    <p className="text-sm text-slate-300">ID: {lock.id}</p>
                    <p className="text-sm text-slate-300">
                      Position: {lock.lat.toFixed(4)}, {lock.lon.toFixed(4)}
                    </p>
                    <p className="text-sm text-slate-400">
                      <small>(Drag on map to update position — coming soon)</small>
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setEditingLocks(editingLocks.filter((l) => l.id !== lock.id))
                    }
                    className="text-red-400 hover:text-red-300 transition"
                    title="Remove from edit list"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-4 border-t border-slate-700">
              <button
                onClick={() => setEditMode('view')}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLocks}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition flex items-center justify-center gap-2"
              >
                <Save size={18} /> Save Changes
              </button>
            </div>
          </div>
        )}

        {editMode === 'editStations' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Station Positions</h3>
            <div className="max-h-[40vh] overflow-y-auto space-y-3">
              {editingStations.map((station) => (
                <div
                  key={station.id}
                  className="bg-slate-800 border border-slate-600 p-4 rounded flex justify-between items-start"
                >
                  <div>
                    <p className="font-semibold text-white">
                      {station.township}, {station.state}
                    </p>
                    <p className="text-sm text-slate-300">ID: {station.id}</p>
                    <p className="text-sm text-slate-300">
                      Position: {station.lat.toFixed(4)}, {station.lon.toFixed(4)}
                    </p>
                    <p className="text-sm text-slate-400">
                      <small>(Drag on map to update position — coming soon)</small>
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setEditingStations(editingStations.filter((s) => s.id !== station.id))
                    }
                    className="text-red-400 hover:text-red-300 transition"
                    title="Remove from edit list"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-4 border-t border-slate-700">
              <button
                onClick={() => setEditMode('view')}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStations}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition flex items-center justify-center gap-2"
              >
                <Save size={18} /> Save Changes
              </button>
            </div>
          </div>
        )}

        {editMode === 'addStation' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Station</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Station ID (e.g., 03151500)"
                value={newStation.id}
                onChange={(e) => setNewStation({ ...newStation, id: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
              <input
                type="text"
                placeholder="Township (e.g., Belleville)"
                value={newStation.township}
                onChange={(e) => setNewStation({ ...newStation, township: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
              <input
                type="text"
                placeholder="State (e.g., WV)"
                value={newStation.state}
                onChange={(e) => setNewStation({ ...newStation, state: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Latitude"
                value={newStation.lat}
                onChange={(e) => setNewStation({ ...newStation, lat: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Longitude"
                value={newStation.lon}
                onChange={(e) => setNewStation({ ...newStation, lon: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
              <input
                type="text"
                placeholder="NOAA AHPS Code (optional)"
                value={newStation.ahps}
                onChange={(e) => setNewStation({ ...newStation, ahps: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
            </div>
            <div className="flex gap-3 pt-4 border-t border-slate-700">
              <button
                onClick={() => setEditMode('view')}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStation}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition flex items-center justify-center gap-2"
              >
                <Plus size={18} /> Create Station
              </button>
            </div>
          </div>
        )}

        {editMode === 'addLock' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Lock/Dam</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Lock ID (e.g., MCALPUNE01)"
                value={newLock.id}
                onChange={(e) => setNewLock({ ...newLock, id: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
              <input
                type="text"
                placeholder="Lock Name (e.g., McAlpine Lock)"
                value={newLock.name}
                onChange={(e) => setNewLock({ ...newLock, name: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
              <input
                type="number"
                step="0.1"
                placeholder="River Mile"
                value={newLock.riverMile}
                onChange={(e) => setNewLock({ ...newLock, riverMile: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Latitude"
                value={newLock.lat}
                onChange={(e) => setNewLock({ ...newLock, lat: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Longitude"
                value={newLock.lon}
                onChange={(e) => setNewLock({ ...newLock, lon: e.target.value })}
                className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded"
              />
            </div>
            <div className="flex gap-3 pt-4 border-t border-slate-700">
              <button
                onClick={() => setEditMode('view')}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLock}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition flex items-center justify-center gap-2"
              >
                <Plus size={18} /> Create Lock
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-700 text-xs text-slate-400">
          <p>💡 <strong>Tip:</strong> Drag and drop functionality for map points coming soon in map view.</p>
          <p>💾 All changes are saved to the backend and synced across all user sessions.</p>
        </div>
      </div>
    </div>
  );
}
