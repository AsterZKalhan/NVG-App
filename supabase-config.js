// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://fxewefwwpowhnacrxfdp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZXdlZnd3cG93aG5hY3J4ZmRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxOTQ5NTksImV4cCI6MjEwODc3MDk1OX0.nDlHFbpzBipH3Po61OkzNdAfPnCRaCNOwa1aN6ap8qk';

// La bibliothèque n'est pas chargée sur les pages autonomes (ex. contact.html),
// qui n'ont besoin que de l'URL et de la clé publique.
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;