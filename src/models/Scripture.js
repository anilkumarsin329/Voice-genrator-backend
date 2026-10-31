const mongoose = require('mongoose');

// READ-ONLY mappings of the platform's existing Ramayana collections. This module never writes to
// them and never creates indexes / collections on them.
//   Kanda -> `ramayanas`       (kandaNumber, title, status, clientId)
//   Verse -> `ramayanaverses`  (kandaId, verseNumber, sanskrit, hindi, english)
// The platform has no Sarga level today. If verses gain a numeric `sargaNumber`, Sarga selection
// and S3 folder grouping (sarga-001/) work automatically.
const readOnly = { autoIndex: false, autoCreate: false };

const Kanda = mongoose.model(
  'Kanda',
  new mongoose.Schema(
    { title: String, kandaNumber: Number, description: String, status: String, clientId: String },
    { collection: 'ramayanas', ...readOnly }
  )
);

const Verse = mongoose.model(
  'Verse',
  new mongoose.Schema(
    {
      kandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kanda' },
      verseNumber: Number,
      sargaNumber: Number,
      sanskrit: String,
      hindi: String,
      english: String,
      status: String,
    },
    { collection: 'ramayanaverses', ...readOnly }
  )
);

/** "बालकाण्ड (Bala Kanda)" -> "Bala Kanda" */
const kandaEnglishName = (k) => (k?.title?.match(/\(([^)]+)\)/)?.[1] || k?.title || `Kanda ${k?.kandaNumber ?? ''}`).trim();

module.exports = { Kanda, Verse, kandaEnglishName };
