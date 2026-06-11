const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app      = express();
const PORT     = 3000;
const KATHY    = path.join(__dirname, 'photos');
const IMG_RE   = /\.(jpe?g|png|webp|gif)$/i;

// Serve Christmas---Amber files (index.html, magic.js, ...)
app.use(express.static(__dirname));

// Serve ảnh trong folder Kathy tại /kathy/
app.use('/kathy', express.static(KATHY));

// API: trả danh sách ảnh trong Kathy (server sort, client sẽ shuffle)
app.get('/api/photos', (_req, res) => {
    try {
        const files = fs.readdirSync(KATHY)
            .filter(f => IMG_RE.test(f))
            .map(f => `/kathy/${encodeURIComponent(f)}`);
        res.json(files);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Web server: http://localhost:${PORT}`);
        console.log(`Ctrl+C để tắt`);
    });
}

module.exports = app;
