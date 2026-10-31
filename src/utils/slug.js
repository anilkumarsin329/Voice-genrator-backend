const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';

const pad = (n, w = 3) => String(n).padStart(w, '0');

module.exports = { slugify, pad };
