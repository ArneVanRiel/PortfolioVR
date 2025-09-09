import React, { useState, useEffect } from 'react';
import axios from 'axios';

const UserCash = ({ userID }) => {
  const [entries, setEntries] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [date, setDate] = useState('');
  const [noDataFound, setNoDataFound] = useState(false);

  // Compute total available cash
  const totalAvailable = entries.reduce((sum, e) => sum + parseFloat(e.value || 0), 0);

  useEffect(() => {
    const fetchUserCash = async () => {
      try {
        const response = await axios.get(`/api/user/${userID}`);
        if (response.status === 200) {
          const data = response.data;
          let initialEntries = [];

          // If backend returns an array of entries, use it; otherwise fallback to single value
          if (Array.isArray(data.availableCash)) {
            initialEntries = data.availableCash;
          } else {
            initialEntries = [{ name: 'Algemeen', value: data.availableCash || '' }];
          }

          setEntries(initialEntries);
          setDate(data.date || '');
          setNoDataFound(initialEntries.length === 0);
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          setNoDataFound(true);
          setEntries([{ name: 'Algemeen', value: '' }]);
        } else {
          console.error('Error fetching user cash:', error);
        }
      }
    };

    fetchUserCash();
  }, [userID]);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleAddField = () => {
    setEntries([...entries, { name: '', value: '' }]);
  };

  const handleFieldChange = (index, field, newValue) => {
    const updated = entries.map((entry, i) =>
      i === index ? { ...entry, [field]: newValue } : entry
    );
    setEntries(updated);
  };

  const handleSaveClick = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const payload = {
        userID,
        availableCash: entries,
        date: today
      };

      const response = await axios.post('/api/user/update', payload);
      if (response.status === 200) {
        setIsEditing(false);
        setNoDataFound(false);
        setDate(today);
      } else {
        console.error('Error saving data:', response.statusText);
      }
    } catch (error) {
      console.error('Error saving data:', error);
    }
  };

  return (
    <div>
      <h3>Beschikbaar bedrag om te investeren</h3>
      {isEditing ? (
        <div>
          {entries.map((entry, idx) => (
            <div key={idx} style={{ marginBottom: '0.5rem' }}>
              <input
                type="text"
                placeholder="Naam (bv. eToro cash)"
                value={entry.name}
                onChange={e => handleFieldChange(idx, 'name', e.target.value)}
                style={{ marginRight: '0.5rem' }}
              />
              <input
                type="number"
                placeholder="Bedrag"
                value={entry.value}
                onChange={e => handleFieldChange(idx, 'value', e.target.value)}
              />
            </div>
          ))}
          <button onClick={handleAddField}>+ Extra veld</button>
          <div style={{ marginTop: '1rem' }}>
            <strong>Totaal: € {totalAvailable.toFixed(2)}</strong>
          </div>
          <button onClick={handleSaveClick}>Opslaan</button>
          <button onClick={() => setIsEditing(false)}>Annuleren</button>
        </div>
      ) : (
        <div>
          {entries.map((entry, idx) => (
            <p key={idx}>
              {entry.name}: € {parseFloat(entry.value || 0).toFixed(2)}
            </p>
          ))}
          <p><strong>Totaal: € {totalAvailable.toFixed(2)}</strong></p>
          <button onClick={handleEditClick}>Bewerk</button>
        </div>
      )}
    </div>
  );
};

export default UserCash;
