const path = require('path');
const fs   = require('fs');

const IMG_RE = /\.(jpe?g|png|webp|gif)$/i;

module.exports = (req, res) => {
    const dir = path.join(process.cwd(), 'photos');
    try {
        const files = fs.readdirSync(dir)
            .filter(f => IMG_RE.test(f))
            .map(f => `/photos/${encodeURIComponent(f)}`);
        res.json(files);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
