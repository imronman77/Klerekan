const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const sqlite3 = require('sqlite3').verbose();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  const zipPath = `/tmp/upload_${Date.now()}.zip`;
  fs.writeFileSync(zipPath, buffer);

  const extractDir = `/tmp/extract_${Date.now()}`;
  fs.mkdirSync(extractDir);

  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractDir }))
        .on('close', resolve)
        .on('error', reject);
    });

    const files = fs.readdirSync(extractDir);
    const dbFile = files.find(f => f.toLowerCase().endsWith('.db'));
    if (!dbFile) return res.status(400).json({ error: 'No .db found' });

    const dbPath = path.join(extractDir, dbFile);
    const db = new sqlite3.Database(dbPath);

    const sql = `SELECT SUM(cash) AS sum_cash, SUM(change_pay) AS sum_change FROM tx_tsale`;

    db.get(sql, [], (err, row) => {
      db.close();
      if (err) return res.status(500).json({ error: 'Query failed' });

      const sumCash = row?.sum_cash || 0;
      const sumChange = row?.sum_change || 0;
      const net = sumCash - sumChange;

      res.json({ sum_cash: sumCash, sum_change: sumChange, net });
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to process ZIP' });
  }
};