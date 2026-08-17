// Receipt file storage.
//
// Render's filesystem is ephemeral — anything written to disk (the old
// behaviour, via multer.diskStorage into ./uploads/receipts) disappears on
// every deploy/restart/scale event, silently orphaning every receipt
// fileUrl already in the database. Since this app is deployed on Render
// with a Supabase Postgres database, we use Supabase's own Storage
// product (an S3-compatible object store bundled with every Supabase
// project) instead — one less external service to wire up, and the
// person already has the project/keys.
//
// Configuration is env-driven with a local-disk fallback, same pattern as
// bankVerification.js / email.js in this codebase: if SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY aren't set, we fall back to writing to
// ./uploads on local disk so `npm run dev` still works with zero setup.
// That fallback is NOT suitable for Render/production — see the boot
// warning in server.js.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_RECEIPTS_BUCKET = process.env.SUPABASE_RECEIPTS_BUCKET || 'receipts';

const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

// Service-role key on purpose: uploads/deletes happen from trusted backend
// code after our own auth/authorize/tenantScope middleware has already
// run, not directly from the browser, so RLS bypass here is intentional
// and no more permissive than the rest of this API.
const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'receipts');
if (!isSupabaseConfigured) {
  fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

function randomName(originalName) {
  return `${crypto.randomUUID()}${path.extname(originalName || '')}`;
}

// Saves a single already-validated file (multer memoryStorage gives us
// { buffer, mimetype, originalname }) and returns the URL to store on the
// Receipt row. Local mode returns a path served by the /uploads static
// route in app.js; Supabase mode returns the bucket's public URL.
async function saveReceiptFile(file) {
  const filename = randomName(file.originalname);

  if (isSupabaseConfigured) {
    const { error } = await supabase.storage
      .from(SUPABASE_RECEIPTS_BUCKET)
      .upload(filename, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);

    const { data } = supabase.storage.from(SUPABASE_RECEIPTS_BUCKET).getPublicUrl(filename);
    return { fileUrl: data.publicUrl, storageKey: filename };
  }

  fs.writeFileSync(path.join(LOCAL_UPLOAD_DIR, filename), file.buffer);
  return { fileUrl: `/uploads/receipts/${filename}`, storageKey: filename };
}

// Best-effort delete, mirroring recordAudit's "never let this take down
// the real request" stance — an orphaned file in storage is a much
// smaller problem than a receipt row failing to delete because storage
// cleanup errored.
async function deleteReceiptFile(storageKey) {
  if (!storageKey) return;
  try {
    if (isSupabaseConfigured) {
      await supabase.storage.from(SUPABASE_RECEIPTS_BUCKET).remove([storageKey]);
    } else {
      fs.unlinkSync(path.join(LOCAL_UPLOAD_DIR, storageKey));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete receipt file from storage:', err.message);
  }
}

module.exports = { saveReceiptFile, deleteReceiptFile, isSupabaseConfigured, LOCAL_UPLOAD_DIR };
