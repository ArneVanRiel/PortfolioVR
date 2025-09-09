import React, { useState, useEffect } from 'react';
import axios from 'axios';

const UserCash = ({ userID }) => {
    const [availableCash, setAvailableCash] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [date, setDate] = useState('');
    const [originalCash, setOriginalCash] = useState('');
    const [noDataFound, setNoDataFound] = useState(false); // Geen data gevonden state
  
    useEffect(() => {
        const fetchUserCash = async () => {
          try {
            const response = await axios.get(`/api/user/${userID}`);
            if (response.status === 200) {
              const data = response.data;
              if (data) {
                setAvailableCash(data.availableCash || '');
                setDate(data.date || '');
                setOriginalCash(data.availableCash || '');
                setNoDataFound(false); // Data is gevonden
              }
            }
          } catch (error) {
            if (error.response && error.response.status === 404) {
              console.log('Geen data gevonden voor deze user');
              setNoDataFound(true); // Geen data gevonden
            } else {
              console.error('Error fetching user cash:', error);
            }
          }
        };
    
        fetchUserCash();
      }, [userID]);
  
    const handleEditClick = () => {
      setIsEditing(true);
      setOriginalCash(availableCash); // Bewaar de oorspronkelijke waarde
    };
  
    const handleSaveClick = async () => {
      try {
        const today = new Date().toISOString().split('T')[0]; // Huidige datum
        console.log('Saving data:', { userID, availableCash, date: today }); // Log the data being sent
        const response = await axios.post('/api/user/update', {
            userID: userID,
            availableCash: availableCash,
            date: today,
          });
    
          if (response.status === 200) {
          setIsEditing(false); // Stop met bewerken na succesvolle opslaan
          setNoDataFound(false); // Data is nu opgeslagen
        } else {
          console.error('Error saving data:', response.statusText);
        }
      } catch (error) {
        console.error('Error saving data:', error);
      }
    };
  
    return (
      <div>
        {noDataFound ? (
          <div>
            <p>Je hebt nog geen waarde ingevuld. Vul een waarde in en bevestig.</p>
            <input
              type="number"
              value={availableCash}
              onChange={(e) => setAvailableCash(e.target.value)}
            />
            <button onClick={handleSaveClick}>Opslaan</button>
          </div>
        ) : (
          <div>
            {isEditing ? (
              <div>
                <input
                  type="number"
                  value={availableCash}
                  onChange={(e) => setAvailableCash(e.target.value)}
                />
                <button onClick={handleSaveClick}>Opslaan</button>
                <button onClick={() => setIsEditing(false)}>Annuleren</button>
              </div>
            ) : (
              <div>
                <p>Beschikbaar bedrag om te investeren: € {availableCash}</p>
                <button onClick={handleEditClick}>Bewerk</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

export default UserCash;
