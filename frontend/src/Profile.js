import React, { useState } from 'react';

const Profile = () => {
  // State voor formuliervelden (In de toekomst koppel je deze aan je backend)
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [currency, setCurrency] = useState('EUR');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleSaveGeneral = (e) => {
    e.preventDefault();
    // Hier komt later de Axios call om de data op te slaan
    alert('Algemene instellingen succesvol opgeslagen!');
  };

  const handleSavePassword = (e) => {
    e.preventDefault();
    // Hier komt later de Axios call om het wachtwoord te updaten
    alert('Wachtwoord succesvol gewijzigd!');
    setCurrentPassword('');
    setNewPassword('');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Mijn Profiel</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Algemene Instellingen */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Algemene Instellingen</h2>
          <form onSubmit={handleSaveGeneral} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gebruikersnaam</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Standaard Valuta</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              >
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Deze valuta wordt als standaard gebruikt in de gehele applicatie.</p>
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">
              Wijzigingen Opslaan
            </button>
          </form>
        </div>

        {/* Wachtwoord Wijzigen */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Beveiliging</h2>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Huidig Wachtwoord</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nieuw Wachtwoord</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">
              Wachtwoord Bijwerken
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;