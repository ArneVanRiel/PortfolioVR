import React, { useState } from 'react';

// De hoofdcomponent van de applicatie
function ToDo() {
  // De initiële to-do gegevens per categorie
  const [todos, setTodos] = useState({
    algemeen: [
      { id: 1, description: 'heb ik alle tabbladen nodig?', date: '18-06-2025' },
      { id: 2, description: 'Plan zomervakantie', date: '2025-07-01' },
    ],
    idealeportfoliowatchlist: [
        { id: 1, description: 'ETF en crypto toevoegen aan watchlist', date: '18-06-2025' },
        { id: 1, description: 'Als een prijs nog onder het koop signaal is, kan het koopsignaal nog gekocht worden.', date: '18-06-2025' },
        { id: 1, description: 'tabel met berekende data: waardeverdeling, marketcap, intrinsieke waarde', date: '18-06-2025' },
        { id: 1, description: 'intrinsieke waarde kunnen invullen en opslaan bij het bijhorende kwartaal en aandeel', date: '24-06-2025' },
        { id: 1, description: 'intrinsieke waarde kunnen berekenen aan de hand van FCF, zie python_file ', date: '24-06-2025' },
        { id: 1, description: 'cik toevoegen aan stocks TABEL??', date: '24-06-2025' },
    
    ], // Deze categorie wordt niet weergegeven omdat deze leeg is
    aandelen: [
      { id: 3, description: 'Analyseer prestaties van AAPL', date: '2025-06-20' },
      { id: 4, description: 'Onderzoek nieuwe beleggingsmogelijkheden', date: '2025-06-22' },
    ],
    data: [
        { id: 5, description: 'handmatig data kunnen toevoegen', date: '2025-06-28' },
        { id: 5, description: 'controle dubbele gegevens/ontbrekende gegevens, opeenvolgende FP, max 4 gegevens in 1 jaar (of 13 maanden)', date: '2025-06-28' },
        { id: 5, description: 'filteren van bestaande fundamentele data tabel', date: '2025-06-28' },
        { id: 5, description: 'data kunnen toevoegen via sec', date: '2025-06-28' },
    ],
    update: [
      { id: 6, description: 'Voer systeemupdates uit', date: '25-06-2025' },
      { id: 7, description: 'Update softwarelicenties', date: '2025-06-30' },
    ],
    dashboard: [], // Deze categorie wordt niet weergegeven omdat deze leeg is
    backend: [
      { id: 8, description: 'Implementeer nieuwe authenticatiemethode', date: '2025-07-15' },
      { id: 9, description: 'Schrijf API-documentatie', date: '2025-07-20' },
    ],
  });

  // Array van alle beschikbare categorieën
  const categories = [
    'algemeen',
    'idealeportfoliowatchlist',
    'aandelen',
    'data',
    'update',
    'dashboard',
    'backend',
  ];

  return (
    // Hoofdcontainer met Bootstrap achtergrondkleur en compacte padding
    <div className="bg-light p-3">
      <div className="container">
        {/* Titel van de to-do lijst met centrering en compacte marge */}
        <h1 className="my-4 text-center fs-2 fw-bold text-dark">Mijn To-Do Lijst</h1>

        {/* Bootstrap rij voor het raster van categorieën met een kleine tussenruimte */}
        <div className="row g-3">
          {categories.map((category) => {
            // Controleer of de categorie taken bevat voordat deze wordt weergegeven
            if (todos[category] && todos[category].length > 0) {
              return (
                // Kolomdefinitie voor responsieve lay-out (12 kolommen op small, 6 op medium, 4 op large)
                <div key={category} className="col-12 col-md-6 col-lg-4">
                  {/* Card component voor elke categorie met een lichte schaduw */}
                  <div className="card border-0 shadow-sm mb-3">
                    {/* Card body met compacte padding */}
                    <div className="card-body p-3">
                      {/* Categorie titel, geformatteerd met Bootstrap klassen. Nu fw-bold voor extra vet. */}
                      <h2 className="card-title fs-5 fw-bold text-primary mb-3 text-capitalize">
                        {category.replace('-', ' ')}
                      </h2>
                      {/* Responsieve tabel container voor kleine schermen */}
                      <div className="table-responsive">
                        {/* Compacte tabel met hover-effect en geen onderste marge */}
                        <table className="table table-sm table-hover mb-0">
                          {/* Tabelkop met lichte achtergrond */}
                          <thead className="table-light">
                            <tr>
                              {/* Kolomkoppen met compacte styling en small lettergrootte */}
                              <th scope="col" className="text-uppercase text-secondary small">
                                Taakomschrijving
                              </th>
                              <th scope="col" className="text-uppercase text-secondary small">
                                Datum van taak
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {todos[category].map((task) => (
                              <tr key={task.id}>
                                {/* Tabelcellen met compacte verticale padding. fs-6 voor een kleinere lettergrootte. */}
                                <td className="py-2 fs-6">{task.description}</td>
                                <td className="py-2 fs-6">{task.date}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            return null; // Geef niets weer als de categorie leeg is
          })}
        </div>
      </div>
    </div>
  );
}

export default ToDo;
