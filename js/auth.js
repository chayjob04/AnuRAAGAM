// js/auth.js
// Shared across all pages: keeps the nav's Login/Profile/Admin link in sync
// with the current Supabase session, plus helpers to guard pages.
// Every function checks that supabaseClient actually loaded first, so a
// CDN hiccup degrades gracefully instead of crashing the page.

async function getCurrentUser() {
  if (!supabaseClient) return null;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session ? session.user : null;
  } catch (err) {
    console.error('getCurrentUser failed:', err);
    return null;
  }
}

async function getMyProfile() {
  if (!supabaseClient) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) { console.warn('profile fetch failed:', error.message); return null; }
    return data;
  } catch (err) {
    console.error('getMyProfile failed:', err);
    return null;
  }
}

async function logout() {
  if (supabaseClient) {
    try { await supabaseClient.auth.signOut(); } catch (err) { console.error('logout failed:', err); }
  }
  window.location.href = 'index.html';
}

// Swap the nav's auth slot between "Login" and "Profile", and reveal the
// Admin link if the signed-in user is an admin. Runs on every page.
async function refreshAuthNav() {
  const authSlot = document.querySelector('#nav-auth-slot');
  const adminLink = document.querySelector('#nav-admin-link');

  if (!supabaseClient) {
    if (authSlot) authSlot.innerHTML = '<a href="login.html">Login</a>';
    if (adminLink) adminLink.style.display = 'none';
    return;
  }

  const user = await getCurrentUser();

  if (!user) {
    if (authSlot) authSlot.innerHTML = '<a href="login.html">Login</a>';
    if (adminLink) adminLink.style.display = 'none';
    return;
  }

  if (authSlot) authSlot.innerHTML = '<a href="profile.html">Profile</a>';

  if (adminLink) {
    const profile = await getMyProfile();
    adminLink.style.display = (profile && profile.is_admin) ? 'inline-block' : 'none';
  }
}

// Call at the top of pages that require a logged-in user (e.g. payment, profile).
// Redirects to login.html (preserving where to return to) if not signed in,
// or if Supabase itself isn't reachable/configured.
async function requireLogin(returnTo) {
  const dest = returnTo || window.location.pathname.split('/').pop();

  if (!supabaseClient) {
    alert("We couldn't connect to the login service. Please check your connection and try again.");
    window.location.href = 'login.html?redirect=' + encodeURIComponent(dest);
    return null;
  }

  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'login.html?redirect=' + encodeURIComponent(dest);
    return null;
  }
  return user;
}

// Call at the top of admin.html. Redirects home if not an admin.
async function requireAdmin() {
  const user = await requireLogin('admin.html');
  if (!user) return null;
  const profile = await getMyProfile();
  if (!profile || !profile.is_admin) {
    alert('This page is only available to Anuraagam admins.');
    window.location.href = 'index.html';
    return null;
  }
  return { user, profile };
}

document.addEventListener('DOMContentLoaded', refreshAuthNav);
