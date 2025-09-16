// components/SearchModal.js
import React, { useState } from 'react';

const SearchModal = ({ onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Functie om de zoekopdracht uit te voeren
  const handleSearch = () => {
    // Hier kun je je eigen zoeklogica implementeren.
    // Voor nu wordt een console.log en een eenvoudige melding getoond.
    console.log('Zoeken naar:', searchTerm);
    // Let op: 'alert()' is over het algemeen niet aanbevolen in React-apps voor een betere UX.
    // Dit is een placeholder, vervang dit door een custom meldingen-component.
    alert(`Zoekfunctie nog te implementeren. Zoekt naar: ${searchTerm}`);
    onClose(); // Sluit de modal na het zoeken
  };

  return (
    // De modale overlay en container
    // d-block: Zorgt ervoor dat de modal zichtbaar is.
    // tabIndex="-1": Maakt de modal focusable maar niet standaard in de tab-volgorde.
    // style: Semi-transparante achtergrond voor de overlay.
    <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      {/* De dialoog container, gecentreerd op het scherm */}
      <div className="modal-dialog modal-dialog-centered">
        {/* De inhoud van de modal */}
        <div className="modal-content">
          {/* Header van de modal met titel en sluitknop */}
          <div className="modal-header">
            <h5 className="modal-title">Zoeken</h5>
            {/* Sluitknop van de modal */}
            <button type="button" className="btn-close" aria-label="Sluiten" onClick={onClose}></button>
          </div>
          {/* Body van de modal met het zoekveld */}
          <div className="modal-body">
            <input
              type="text"
              className="form-control" // Bootstrap styling voor inputvelden
              placeholder="Voer zoekterm in..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              // Luister naar de 'Enter' toets om te zoeken
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
            />
          </div>
          {/* Footer van de modal met actieknoppen */}
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Annuleren</button>
            <button type="button" className="btn btn-primary" onClick={handleSearch}>Zoeken</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
