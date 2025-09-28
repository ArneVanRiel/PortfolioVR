import React, { useState, useEffect } from 'react';
import http from '../../http-common';

const FundamentalDataForm = ({ stock, onClose }) => {
  const [formData, setFormData] = useState({
    stock_id: stock.stock_id,
    period_end_date: '',
    period_start_date: '',
    fy: '',
    fp_id: '',
    form_id: '',
    data: [{ data_type: '', value: '' }], // Array for multiple data points
  });
  const [fiscalPeriods, setFiscalPeriods] = useState([]);
  const [forms, setForms] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(true);

  useEffect(() => {
    const fetchDropdownData = async () => {
      console.log("Fetching dropdown data...");
      setIsLoadingDropdowns(true);
      try {
        const fpResponse = await http.get('/fundamental-data/fiscal-periods');
        console.log("Fiscal Periods response:", fpResponse.data);
        setFiscalPeriods(fpResponse.data);

        const formsResponse = await http.get('/fundamental-data/forms');
        console.log("Forms response:", formsResponse.data);
        setForms(formsResponse.data);
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
        alert('Error loading form data.');
      } finally {
        setIsLoadingDropdowns(false);
      }
    };
    fetchDropdownData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDataChange = (index, e) => {
    const { name, value } = e.target;
    const newData = [...formData.data];
    newData[index][name] = value;
    setFormData(prev => ({ ...prev, data: newData }));
  };

  const addDataPoint = () => {
    setFormData(prev => ({ ...prev, data: [...prev.data, { data_type: '', value: '' }] }));
  };

  const removeDataPoint = (index) => {
    const newData = formData.data.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, data: newData }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      console.log("Submitting form data:", formData);
      const response = await http.post('/fundamental-data/manual', formData);
      console.log("Form submission response:", response.data);
      alert(response.data.message || 'Data saved successfully!');
      onClose(); // Close the modal on success
    } catch (error) {
      console.error("Error saving fundamental data:", error);
      alert(error.response?.data?.message || 'Error saving data.');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Add/Edit Fundamental Data for {stock.ticker}</h2>
      {isLoadingDropdowns ? (
        <p className="text-center text-gray-500">Loading form data...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Period End Date</label>
            <input type="date" name="period_end_date" value={formData.period_end_date} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Period Start Date</label>
            <input type="date" name="period_start_date" value={formData.period_start_date} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Fiscal Year (FY)</label>
            <input type="number" name="fy" value={formData.fy} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Fiscal Period (FP)</label>
            <select name="fp_id" value={formData.fp_id} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" required>
              <option value="">Select FP</option>
              {fiscalPeriods.map(fp => (
                <option key={fp.fp_id} value={fp.fp_id}>{fp.fp}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Form Type</label>
            <select name="form_id" value={formData.form_id} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" required>
              <option value="">Select Form</option>
              {forms.map(form => (
                <option key={form.id} value={form.id}>{form.name}</option>
              ))}
            </select>
          </div>

          <h3 className="text-lg font-semibold mt-6 mb-2">Data Points</h3>
          {formData.data.map((dataPoint, index) => (
            <div key={index} className="flex space-x-2 items-end">
              <div className="flex-grow">
                <label className="block text-sm font-medium text-gray-700">Data Type</label>
                <input type="text" name="data_type" value={dataPoint.data_type} onChange={(e) => handleDataChange(index, e)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" required />
              </div>
              <div className="flex-grow">
                <label className="block text-sm font-medium text-gray-700">Value</label>
                <input type="number" name="value" value={dataPoint.value} onChange={(e) => handleDataChange(index, e)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" step="any" required />
              </div>
              {formData.data.length > 1 && (
                <button type="button" onClick={() => removeDataPoint(index)} className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addDataPoint} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
            Add Data Point
          </button>

          <div className="flex justify-end space-x-2 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400">
              {isSubmitting ? 'Saving...' : 'Save Data'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default FundamentalDataForm;
