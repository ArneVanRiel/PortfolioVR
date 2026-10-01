import React, { useState, useEffect, useRef } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const BROKERS = [
  { id: 'etoro', name: 'eToro', type: 'api', icon: 'ph-arrows-clockwise', badge: 'API Koppeling' },
  { id: 'degiro', name: 'DeGiro', type: 'file', icon: 'ph-file-csv', badge: 'Rekeningoverzicht / Transacties' },
  { id: 'trading212', name: 'Trading 212', type: 'file', icon: 'ph-file-csv', badge: 'CSV Export' },
  { id: 'ibkr', name: 'IBKR / Lynx', type: 'file', icon: 'ph-file-csv', badge: 'Flex Query / CSV' },
  { id: 'freedom24', name: 'Freedom24', type: 'file', icon: 'ph-file-csv', badge: 'Account Statement' },
  { id: 'bitvavo', name: 'Bitvavo', type: 'file', icon: 'ph-currency-btc', badge: 'CSV Export' },
  { id: 'coinbase', name: 'Coinbase', type: 'file', icon: 'ph-currency-btc', badge: 'CSV Export' }
];

const BrokerSyncModal = ({ isOpen, onClose, onImportSuccess, allExistingTransactions = [] }) => {
  const [selectedBroker, setSelectedBroker] = useState('etoro');
  const [brokerSettings, setBrokerSettings] = useState({});
  const [apiKey, setApiKey] = useState('');
  const [userKey, setUserKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Import preview / duplicate review state
  const [previewData, setPreviewData] = useState([]);
  const [showReview, setShowReview] = useState(false);

  const fileInputRef = useRef(null);
  const uid = localStorage.getItem('userID') || 1;

  // Haal opgeslagen instellingen op
  const fetchSettings = async () => {
    try {
      const res = await http.get(`/brokers/credentials?userId=${uid}`);
      const map = {};
      if (Array.isArray(res.data)) {
        res.data.forEach(item => {
          map[item.broker_name.toLowerCase()] = item;
        });
      }
      setBrokerSettings(map);
    } catch (err) {
      console.error('Fout bij ophalen broker instellingen:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      setShowReview(false);
      setPreviewData([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentSettings = brokerSettings[selectedBroker] || null;

  // Sla eToro API keys op
  const handleSaveEtoro = async (e) => {
    e.preventDefault();
    if (!apiKey.trim() || !userKey.trim()) {
      toast.error('Vul zowel de API-sleutel als de User Key in.');
      return;
    }
    setLoading(true);
    try {
      const res = await http.post('/brokers/credentials', {
        userId: uid,
        brokerName: 'eToro',
        apiKey: apiKey.trim(),
        userKey: userKey.trim()
      });
      toast.success(res.data?.message || 'eToro API sleutels succesvol gekoppeld!');
      setApiKey('');
      setUserKey('');
      await fetchSettings();
    } catch (err) {
      console.error('Fout bij opslaan eToro:', err);
      toast.error(err.response?.data?.message || 'Kon eToro instellingen niet opslaan.');
    } finally {
      setLoading(false);
    }
  };

  // Ontkoppel eToro
  const handleDisconnect = async (brokerName) => {
    if (!window.confirm(`Weet je zeker dat je ${brokerName} wilt ontkoppelen?`)) return;
    try {
      await http.delete(`/brokers/credentials/${brokerName}?userId=${uid}`);
      toast.success(`${brokerName} succesvol ontkoppeld.`);
      await fetchSettings();
    } catch (err) {
      console.error('Fout bij ontkoppelen:', err);
      toast.error('Ontkoppelen mislukt.');
    }
  };

  // eToro Direct Sync
  const handleSyncEtoro = async () => {
    setSyncing(true);
    try {
      toast.loading('Bezig met synchroniseren van eToro posities & cash...', { id: 'etoro-sync' });
      const res = await http.post('/brokers/sync-etoro', { userId: uid });
      toast.success(res.data?.message || 'eToro data succesvol gesynchroniseerd!', { id: 'etoro-sync' });
      await fetchSettings();
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      console.error('Fout bij sync:', err);
      toast.error(err.response?.data?.message || 'Synchronisatie met eToro mislukt.', { id: 'etoro-sync' });
    } finally {
      setSyncing(false);
    }
  };

  // Helpers voor getallen & datums
  const parseNumber = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    let s = String(val).trim().replace(/€|\$|\s/g, '');
    // Als zowel punt als komma voorkomen (bijv. 1.234,56 of 1,234.56)
    if (s.includes('.') && s.includes(',')) {
      if (s.indexOf('.') < s.indexOf(',')) {
        // Formaat 1.234,56
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // Formaat 1,234.56
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const parseDeGiroDate = (dateStr, timeStr) => {
    if (!dateStr) return new Date().toISOString();
    const str = String(dateStr).trim();
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3) {
        // dd-mm-yyyy of yyyy-mm-dd
        if (parts[0].length === 4) {
          const t = timeStr || '12:00';
          return new Date(`${parts[0]}-${parts[1]}-${parts[2]}T${t}:00`).toISOString();
        } else {
          const t = timeStr || '12:00';
          return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${t}:00`).toISOString();
        }
      }
    } else if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        const t = timeStr || '12:00';
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${t}:00`).toISOString();
      }
    }
    return new Date(dateStr).toISOString();
  };

  // CSV Text Splitter (handelt zowel komma's als puntkomma's, quotes en DeGiro lege headerkolommen af)
  const parseCSVText = (text) => {
    const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    // Bepaal delimiter (, of ;)
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semiCount > commaCount ? ';' : ',';

    const parseLine = (line) => {
      const result = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(cur.trim().replace(/^["']|["']$/g, ''));
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim().replace(/^["']|["']$/g, ''));
      return result;
    };

    const rawHeaders = parseLine(lines[0]).map(h => h.trim());
    const headers = [];
    rawHeaders.forEach((h, idx) => {
      const prev = (rawHeaders[idx - 1] || '').toLowerCase().trim();
      if (!h && (prev === 'mutatie' || prev === 'change' || prev.startsWith('mutatie') || prev.startsWith('change'))) {
        headers.push('Mutatie_amount');
      } else if (!h && (prev === 'saldo' || prev === 'balance' || prev.startsWith('saldo') || prev.startsWith('balance'))) {
        headers.push('Saldo_amount');
      } else {
        headers.push(h || `col_${idx}`);
      }
    });

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.length > 1) {
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] !== undefined ? values[idx] : '';
        });
        rows.push(row);
      }
    }
    return rows;
  };

  // File Upload Handlers
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (file) => {
    const reader = new FileReader();
    const isCsv = file.name.toLowerCase().endsWith('.csv');

    reader.onload = (e) => {
      try {
        let rows = [];

        if (isCsv) {
          const text = e.target.result;
          rows = parseCSVText(text);
          // Fallback via XLSX als parseCSVText leeg was
          if (rows.length === 0) {
            const wb = XLSX.read(text, { type: 'string' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(sheet);
          }
        } else {
          const data = e.target.result;
          const wb = XLSX.read(data, { type: 'binary' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(sheet);
        }

        if (rows.length === 0) {
          toast.error('Geen geldige rijen gevonden in dit bestand.');
          return;
        }

        let parsed = [];

        if (selectedBroker === 'degiro') {
          // Detecteer of het een DeGiro Transacties (`Transactions.csv`) of Rekeningoverzicht (`Account.csv`) is
          const firstRow = rows[0] || {};
          const isTransactionsFile = Object.keys(firstRow).some(k => k.toLowerCase().includes('aantal') || k.toLowerCase().includes('koers') || k.toLowerCase().includes('beurs'));

          if (isTransactionsFile) {
            // DeGiro Transacties.csv Export
            parsed = rows.map(r => {
              const product = r['Product'] || r['Product '] || r['Omschrijving'] || r['Description'] || '';
              const isin = r['ISIN'] || r['isin'] || '';
              const rawQty = parseNumber(r['Aantal'] || r['Quantity'] || r['Aantal/Nominaal']);
              const rawPrice = parseNumber(r['Koers'] || r['Price']);
              const rawFees = Math.abs(parseNumber(r['Transactiekosten en/of kosten van derden'] || r['Transactiekosten'] || r['Fees'] || r['Kosten']));
              const dateStr = r['Datum'] || r['Date'];
              const timeStr = r['Tijd'] || r['Time'];

              if (!product && !isin) return null;
              if (rawQty === 0) return null;

              return {
                ticker: product || isin,
                isin: String(isin).trim().toUpperCase(),
                transaction_type: rawQty < 0 ? 'SELL' : 'BUY',
                broker_id: 2,
                _brokerName: 'DeGiro',
                import_source: 'degiro_upload',
                quantity: Math.abs(rawQty),
                price: Math.abs(rawPrice),
                purchase_time: parseDeGiroDate(dateStr, timeStr),
                fees: rawFees,
                taxes: 0,
                currency: r['FX'] || r['Valuta'] || 'EUR',
                exchange_rate: parseNumber(r['Wisselkoers'] || r['FX Rate']) || 1
              };
            }).filter(Boolean);

          } else {
            // DeGiro Rekeningoverzicht.csv (Account.csv)
            const grouped = {};
            const cashTransactions = [];

            rows.forEach(row => {
              const orderId = row['Order Id'] || row['Order ID'] || row['Order-ID'] || row['OrderId'] || '';
              const desc = String(row['Omschrijving'] || row['Description'] || '').toLowerCase();
              const mutatieAmtStr = row['Mutatie_amount'] || row['Change_amount'] || row['Mutatie'] || row['Change'] || row['Bedrag'] || row['Amount'] || '';
              const mutatie = parseNumber(mutatieAmtStr);
              const dateStr = row['Datum'] || row['Date'] || '';
              const timeStr = row['Tijd'] || row['Time'] || '';
              const isin = row['ISIN'] ? String(row['ISIN']).trim().toUpperCase() : '';
              const product = row['Product'] || row['Product '] || isin || '';
              const currency = row['FX'] || (row['Mutatie'] && isNaN(parseNumber(row['Mutatie'])) ? row['Mutatie'] : 'EUR') || 'EUR';

              if (!dateStr || mutatie === 0) return;

              // Sla interne cash sweeps over (deze heffen elkaar op tussen sub-rekeningen)
              if (desc.includes('cash sweep') || desc.includes('geldrekening bij flatex') || desc.includes('valuta creditering') || desc.includes('valuta debitering')) {
                return;
              }

              const isTrade = desc.startsWith('koop') || desc.startsWith('verkoop') || desc.includes('aankoop') || desc.startsWith('buy') || desc.startsWith('sell');
              const isFeeOrTax = desc.includes('belasting') || desc.includes('tax') || desc.includes('kosten') || desc.includes('transactiekosten') || desc.includes('courtage') || desc.includes('fee');
              const isFlatexOrDeposit = desc.includes('flatex deposit') || desc.includes('storting') || desc.includes('ideal') || desc.includes('deposit') || desc.includes('overboeking');
              const isWithdrawal = desc.includes('terugstorting') || desc.includes('opname') || desc.includes('withdrawal');
              const isDiv = desc.includes('dividend') && !desc.includes('belasting') && !desc.includes('tax');

              if (isTrade || (orderId && !isFlatexOrDeposit && !isWithdrawal && !isDiv)) {
                const grpId = orderId || `GEN_${dateStr}_${timeStr}`;
                if (!grouped[grpId]) {
                  grouped[grpId] = { main: null, fees: 0, taxes: 0, type: 'BUY', qty: 0, price: 0 };
                }

                if (isTrade) {
                  grouped[grpId].main = row;
                  grouped[grpId].type = (desc.startsWith('koop') || desc.includes('aankoop') || desc.startsWith('buy')) ? 'BUY' : 'SELL';
                  
                  // Haal Qty en Prijs uit omschrijving zoals "Koop 4 @ 147,54 EUR"
                  const match = desc.match(/(koop|verkoop|aankoop|buy|sell)\s+([\d,.]+)\s+@\s+([\d,.]+)/i);
                  if (match) {
                    grouped[grpId].qty = parseNumber(match[2]);
                    grouped[grpId].price = parseNumber(match[3]);
                  }
                } else if (desc.includes('belasting') || desc.includes('tax')) {
                  grouped[grpId].taxes += Math.abs(mutatie);
                } else if (isFeeOrTax) {
                  grouped[grpId].fees += Math.abs(mutatie);
                }
              } else if (isDiv) {
                cashTransactions.push({
                  ticker: product || 'Dividend',
                  aandeel_id: null,
                  isin: isin || null,
                  transaction_type: 'DIVIDEND',
                  broker_id: 2,
                  _brokerName: 'DeGiro',
                  import_source: 'degiro_upload',
                  quantity: Math.abs(mutatie),
                  price: 1,
                  purchase_time: parseDeGiroDate(dateStr, timeStr),
                  fees: 0,
                  taxes: 0,
                  currency: currency,
                  exchange_rate: 1
                });
              } else if (isFlatexOrDeposit || mutatie > 0) {
                let depositTitle = 'Storting (Bank)';
                if (desc.includes('flatex')) depositTitle = 'Flatex Deposit';
                else if (desc.includes('ideal')) depositTitle = 'iDEAL Storting';

                cashTransactions.push({
                  ticker: depositTitle,
                  aandeel_id: null,
                  isin: null,
                  transaction_type: 'DEPOSIT',
                  broker_id: 2,
                  _brokerName: 'DeGiro',
                  import_source: 'degiro_upload',
                  quantity: Math.abs(mutatie),
                  price: 1,
                  purchase_time: parseDeGiroDate(dateStr, timeStr),
                  fees: 0,
                  taxes: 0,
                  currency: currency,
                  exchange_rate: 1
                });
              } else if (isWithdrawal || mutatie < 0) {
                cashTransactions.push({
                  ticker: 'Opname / Terugstorting',
                  aandeel_id: null,
                  isin: null,
                  transaction_type: 'WITHDRAWAL',
                  broker_id: 2,
                  _brokerName: 'DeGiro',
                  import_source: 'degiro_upload',
                  quantity: Math.abs(mutatie),
                  price: 1,
                  purchase_time: parseDeGiroDate(dateStr, timeStr),
                  fees: 0,
                  taxes: 0,
                  currency: currency,
                  exchange_rate: 1
                });
              }
            });

            const tradeTransactions = Object.values(grouped).filter(g => g.main && g.qty > 0).map(g => {
              const r = g.main;
              const product = r['Product'] || r['Product '] || r['ISIN'] || '';
              const isin = r['ISIN'] || '';

              return {
                ticker: product || isin,
                isin: String(isin).trim().toUpperCase(),
                transaction_type: g.type,
                broker_id: 2,
                _brokerName: 'DeGiro',
                import_source: 'degiro_upload',
                quantity: g.qty,
                price: g.price,
                purchase_time: parseDeGiroDate(r['Datum'] || r['Date'], r['Tijd'] || r['Time']),
                fees: g.fees,
                taxes: g.taxes,
                currency: r['FX'] || r['Valuta'] || (r['Mutatie'] && isNaN(parseNumber(r['Mutatie'])) ? r['Mutatie'] : 'EUR') || 'EUR',
                exchange_rate: 1
              };
            });

            parsed = [...tradeTransactions, ...cashTransactions];
          }

        } else {
          // Standaard Generic CSV/Excel
          parsed = rows.map(r => {
            const ticker = r['Ticker'] || r['Symbol'] || r['Aandeel'] || r['Product'];
            const isin = r['ISIN'] || null;
            const qty = parseNumber(r['Quantity'] || r['Shares'] || r['Aantal']);
            const price = parseNumber(r['Price'] || r['Cost Per Share'] || r['Prijs']);
            if (!ticker && !isin) return null;

            return {
              ticker: ticker || isin,
              isin: isin ? String(isin).trim().toUpperCase() : null,
              transaction_type: (r['Type'] || r['Action'] || r['Actie'] || 'BUY').toUpperCase(),
              broker_id: 1,
              _brokerName: selectedBroker.toUpperCase(),
              import_source: `${selectedBroker}_upload`,
              quantity: Math.abs(qty),
              price: Math.abs(price),
              purchase_time: new Date(r['Date'] || r['Datum'] || new Date()).toISOString(),
              fees: Math.abs(parseNumber(r['Fees'] || r['Kosten'])),
              taxes: Math.abs(parseNumber(r['Taxes'] || r['Belasting'])),
              currency: r['Currency'] || r['Valuta'] || 'USD',
              exchange_rate: 1
            };
          }).filter(Boolean);
        }

        if (parsed.length === 0) {
          toast.error('Geen verhandelbare aandelentransacties of stortingen gevonden in dit bestand.');
          return;
        }

        // DUPLICAAT DETECTIE
        const reviewed = parsed.map(row => {
          const rowDate = new Date(row.purchase_time).toISOString().split('T')[0];
          const isCash = ['DEPOSIT', 'WITHDRAWAL'].includes(row.transaction_type);

          const matchingTransactions = allExistingTransactions.filter(t => {
            const tDate = new Date(t.purchase_time).toISOString().split('T')[0];
            if (tDate !== rowDate) return false;

            if (isCash) {
              return t.transaction_type === row.transaction_type && (!t.aandeel_id || !t.ticker_symbol);
            }

            // Aandelen transactie matching
            const isinMatch = (row.isin && t.isin && String(row.isin).trim().toUpperCase() === String(t.isin).trim().toUpperCase());
            const tickerMatch = (t.ticker_symbol && row.ticker && (
              t.ticker_symbol.toUpperCase() === String(row.ticker).toUpperCase() ||
              String(row.ticker).toUpperCase().includes(t.ticker_symbol.toUpperCase())
            ));
            const nameMatch = ((t.stock_name || t.name) && row.ticker && (
              String(t.stock_name || t.name).toLowerCase().includes(String(row.ticker).toLowerCase()) ||
              String(row.ticker).toLowerCase().includes(String(t.stock_name || t.name).toLowerCase())
            ));

            return isinMatch || tickerMatch || nameMatch;
          });

          const exactMatch = matchingTransactions.find(t => {
            if (t.transaction_type !== row.transaction_type) return false;
            if (isCash) {
              return Math.abs(parseFloat(t.quantity) - parseFloat(row.quantity)) < 0.01;
            }
            return (
              Math.abs(parseFloat(t.quantity) - parseFloat(row.quantity)) < 0.0001 &&
              Math.abs(parseFloat(t.price) - parseFloat(row.price)) <= 0.05
            );
          });

          const isDuplicate = !!exactMatch;

          return {
            ...row,
            user_id: uid,
            _isDuplicate: isDuplicate,
            _duplicateMatch: exactMatch,
            _dayReferences: matchingTransactions,
            _selected: !isDuplicate // NIET aangevinkt als het een duplicaat is!
          };
        });

        setPreviewData(reviewed);
        setShowReview(true);
        toast.success(`${reviewed.length} transacties ingelezen!`);

      } catch (err) {
        console.error('Fout bij verwerken bestand:', err);
        toast.error('Fout bij inlezen van bestand: ' + err.message);
      }
    };

    if (isCsv) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const toggleRow = (index) => {
    const updated = [...previewData];
    updated[index]._selected = !updated[index]._selected;
    setPreviewData(updated);
  };

  const selectOnlyNew = () => {
    setPreviewData(previewData.map(r => ({ ...r, _selected: !r._isDuplicate })));
  };

  const selectAll = (val) => {
    setPreviewData(previewData.map(r => ({ ...r, _selected: val })));
  };

  const handleConfirmImport = async () => {
    const toImport = previewData.filter(r => r._selected);
    if (toImport.length === 0) {
      toast.error('Geen transacties geselecteerd om toe te voegen.');
      return;
    }

    setLoading(true);
    try {
      const res = await http.post('/portfolio/addMultipleTransactions', { transactions: toImport });
      toast.success(res.data?.message || 'Transacties succesvol geïmporteerd!');
      setShowReview(false);
      onClose();
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      console.error('Fout bij definitief importeren:', err);
      toast.error(err.response?.data?.message || 'Serverfout bij importeren van transacties.');
    } finally {
      setLoading(false);
    }
  };

  const duplicatesCount = previewData.filter(r => r._isDuplicate).length;
  const newCount = previewData.filter(r => !r._isDuplicate).length;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50/60">
          <div>
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <i className="ph-fill ph-plug-charging text-indigo-600"></i>
              Kies je broker
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Bestand, koppeling of API — wij zetten je portfolio exact klaar tot op de cent.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-200/80 hover:bg-gray-300 text-gray-700 flex items-center justify-center transition-colors"
          >
            <i className="ph-bold ph-x text-lg"></i>
          </button>
        </div>

        {/* Broker Tabs (zoals in De Belegger) */}
        <div className="px-6 pt-4 pb-2 border-b border-gray-100 flex items-center gap-2 overflow-x-auto bg-white scrollbar-none">
          {BROKERS.map(b => (
            <button
              key={b.id}
              onClick={() => { setSelectedBroker(b.id); setShowReview(false); }}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                selectedBroker === b.id
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <i className={`ph-bold ${b.icon} text-sm`}></i>
              <span>{b.name}</span>
              {brokerSettings[b.id]?.sync_status === 'ok' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              )}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          
          {/* WEERGAVE 1: PRE-IMPORT DUPLICAAT REVIEW SCHERM */}
          {showReview ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100">
                <div>
                  <h3 className="text-base font-extrabold text-indigo-950">
                    Controleer Import ({previewData.length} transacties)
                  </h3>
                  <p className="text-xs text-indigo-700">
                    Duplicaten zijn automatisch herkend en standaard uitgevinkt zodat je database schoon blijft.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
                    🟢 {newCount} Nieuw
                  </span>
                  {duplicatesCount > 0 && (
                    <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg">
                      🔴 {duplicatesCount} Reeds in DB (Overgeslagen)
                    </span>
                  )}
                  <div className="flex items-center gap-1 border-l border-indigo-200 pl-2">
                    <button
                      type="button"
                      onClick={selectOnlyNew}
                      className="px-2 py-1 bg-white hover:bg-indigo-100 text-indigo-800 rounded border border-indigo-200 text-[11px] font-semibold transition-colors"
                      title="Vink alleen nieuwe transacties en stortingen aan"
                    >
                      Alleen Nieuw
                    </button>
                    <button
                      type="button"
                      onClick={() => selectAll(true)}
                      className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-700 rounded border border-gray-200 text-[11px] font-semibold transition-colors"
                    >
                      Alles
                    </button>
                    <button
                      type="button"
                      onClick={() => selectAll(false)}
                      className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-700 rounded border border-gray-200 text-[11px] font-semibold transition-colors"
                    >
                      Niets
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabel met rijen */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-gray-500 font-bold uppercase tracking-wider sticky top-0 border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3 text-center">Import</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Datum</th>
                      <th className="py-2.5 px-3">Aandeel / ISIN</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Aantal</th>
                      <th className="py-2.5 px-3 text-right">Koers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewData.map((row, idx) => (
                      <tr key={idx} className={row._isDuplicate ? 'bg-rose-50/50' : 'hover:bg-gray-50'}>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={row._selected}
                            onChange={() => toggleRow(idx)}
                            className="w-4 h-4 text-indigo-600 rounded"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-bold">
                          {row._isDuplicate ? (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px]">
                              Reeds in DB
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px]">
                              Nieuw
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {new Date(row.purchase_time).toLocaleDateString('nl-BE')}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-gray-900">
                          {row.ticker}
                          {row.isin && <span className="text-[10px] text-gray-400 block font-normal">{row.isin}</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                            row.transaction_type === 'BUY' ? 'bg-emerald-100 text-emerald-800' :
                            row.transaction_type === 'SELL' ? 'bg-rose-100 text-rose-800' :
                            row.transaction_type === 'DEPOSIT' ? 'bg-blue-100 text-blue-800' :
                            row.transaction_type === 'WITHDRAWAL' ? 'bg-amber-100 text-amber-800' :
                            'bg-purple-100 text-purple-800'
                          }`}>
                            {row.transaction_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-800">
                          {row.transaction_type === 'DEPOSIT' || row.transaction_type === 'WITHDRAWAL' ? `€${row.quantity.toFixed(2)}` : row.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                          {row.transaction_type === 'DEPOSIT' || row.transaction_type === 'WITHDRAWAL' ? '-' : `€${row.price.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setShowReview(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs"
                >
                  Terug
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={loading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md text-xs transition-all disabled:opacity-50"
                >
                  {loading ? 'Bezig met importeren...' : `Bevestig Import (${previewData.filter(r => r._selected).length} transacties)`}
                </button>
              </div>
            </div>

          ) : selectedBroker === 'etoro' ? (
            /* WEERGAVE 2: ETORO API KOPPELING */
            <div className="max-w-2xl mx-auto space-y-6">
              
              {/* Status Banner als al gekoppeld */}
              {currentSettings?.api_key_masked && (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                    <div>
                      <div className="text-sm font-extrabold text-emerald-950">
                        eToro sleutel {currentSettings.api_key_masked}
                      </div>
                      <div className="text-xs text-emerald-700">
                        Laatste sync: {currentSettings.last_sync_date ? new Date(currentSettings.last_sync_date).toLocaleString('nl-BE') : 'Nog niet gesynchroniseerd'} • OK
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSyncEtoro}
                      disabled={syncing}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <i className={`ph-bold ph-arrows-clockwise ${syncing ? 'animate-spin' : ''}`}></i>
                      {syncing ? 'Bezig...' : 'Nu ophalen'}
                    </button>
                    <button
                      onClick={() => handleDisconnect('eToro')}
                      className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold rounded-xl text-xs transition-all"
                    >
                      Ontkoppelen
                    </button>
                  </div>
                </div>
              )}

              {/* Formulier voor invoer sleutels */}
              <form onSubmit={handleSaveEtoro} className="space-y-4 bg-slate-50/80 p-6 rounded-3xl border border-gray-200">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1.5">
                    API-SLEUTEL VAN ETORO
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="plak hier je API sleutel"
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1.5">
                    USER KEY VAN ETORO
                  </label>
                  <input
                    type="password"
                    value={userKey}
                    onChange={(e) => setUserKey(e.target.value)}
                    placeholder="plak hier je User key"
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* Stap voor stap handleiding */}
                <div className="p-4 bg-white rounded-2xl border border-gray-200 space-y-2 text-xs text-gray-600">
                  <div className="font-extrabold text-gray-900 flex items-center gap-1.5">
                    <i className="ph-fill ph-info text-indigo-600"></i>
                    Waar vind ik die sleutels? (stap voor stap)
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-gray-500 leading-relaxed">
                    <li>Log in op de <strong>eToro website</strong> (niet de app) en ga naar <strong>Instellingen → API</strong>.</li>
                    <li>Maak een <strong>API key</strong> aan. eToro toont daarnaast je <strong>User key</strong>; kopieer allebei.</li>
                    <li>Plak ze hierboven. De app leest alleen: posities, gesloten posities en je cash. Handelen kan en mag hij niet.</li>
                  </ol>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md text-xs transition-all disabled:opacity-50"
                  >
                    {loading ? 'Bezig...' : 'Koppelen'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl text-xs transition-all"
                  >
                    Annuleren
                  </button>
                </div>
              </form>

            </div>

          ) : (
            /* WEERGAVE 3: DEGIRO / TRADING 212 / IBKR BESTANDSUPLOAD */
            <div className="max-w-2xl mx-auto space-y-6 text-center">
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-gray-900">
                  {selectedBroker === 'degiro' ? 'DeGiro' : BROKERS.find(b => b.id === selectedBroker)?.name}
                </h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  ✓ Volledig automatisch — tot op de cent nauwkeurig inclusief cash, dividend en splitsingen.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-[11px] font-bold">
                    Posities & GAK exact
                  </span>
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-bold">
                    Cash exact
                  </span>
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-[11px] font-bold">
                    Dividend & kosten exact
                  </span>
                </div>
              </div>

              {/* Stap-voor-stap handleiding */}
              {selectedBroker === 'degiro' && (
                <div className="bg-slate-50 p-5 rounded-3xl border border-gray-200 text-left text-xs text-gray-700 space-y-2">
                  <div className="font-extrabold text-gray-900">Hoe download je het juiste bestand uit DeGiro?</div>
                  <ol className="list-decimal list-inside space-y-1.5 text-gray-600 leading-relaxed">
                    <li>Log in op DeGiro via de website (<strong>trader.degiro.nl</strong>).</li>
                    <li>Ga naar <strong>Inbox → Rekeningoverzicht</strong> (of <strong>Transacties</strong>).</li>
                    <li>Kies als begindatum een datum vóór je allereerste storting of transactie.</li>
                    <li>Exporteer als <strong>CSV of Excel</strong> (<code>Account.csv</code> of <code>Transactions.csv</code>).</li>
                    <li>Upload het bestand hieronder — alle transacties en cash worden automatisch opgebouwd.</li>
                  </ol>
                </div>
              )}

              {/* Drag & Drop Upload Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`p-8 rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center space-y-4 ${
                  dragActive ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-300 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl shadow-inner">
                  <i className="ph-bold ph-upload-simple"></i>
                </div>

                <div>
                  <div className="font-bold text-gray-800 text-sm">
                    Sleep je exportbestand hierheen
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Ondersteunt Rekeningoverzicht / Transacties (.csv, .xlsx en .xls)
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl shadow-lg shadow-indigo-500/25 text-xs transition-all flex items-center gap-2"
                >
                  <i className="ph-bold ph-folder-open"></i>
                  Kies je exportbestand
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default BrokerSyncModal;
