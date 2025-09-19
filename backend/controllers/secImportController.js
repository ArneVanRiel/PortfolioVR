// backend/controllers/secImportController.js
const { spawn } = require('child_process');

const importSecData = (req, res) => {
    const { ticker } = req.body;

    if (!ticker) {
        return res.status(400).json({ message: 'Ticker symbol is required' });
    }

    const pythonScript = 'backend/insertDataToDatabaseFromSec20250302.py';
    const pyProc = spawn('python', [pythonScript, ticker]);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    pyProc.stdout.on('data', (data) => {
        // Stream the output to the client
        res.write(data.toString());
    });

    pyProc.stderr.on('data', (data) => {
        // Stream the error output to the client
        console.error(`[Python STDERR] ${data.toString()}`);
        res.write(`ERROR: ${data.toString()}`);
    });

    pyProc.on('close', (code) => {
        console.log(`Python script exited with code ${code}`);
        if (code !== 0) {
            res.write(`\nPython script finished with errors (exit code: ${code}).`);
        } else {
            res.write('\nImport process finished successfully.');
        }
        res.end(); // End the response stream
    });

    pyProc.on('error', (err) => {
        console.error('Failed to start Python script:', err);
        // This event is for errors in spawning the process itself
        if (!res.headersSent) {
            res.status(500).json({ message: 'Failed to start the import process.' });
        } else {
            res.write(`\nFailed to start the import process: ${err.message}`);
            res.end();
        }
    });
};

module.exports = {
    importSecData,
};
