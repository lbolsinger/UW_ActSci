// The member portal: decides what to show based on who is signed in.
import { store } from '../data.js';
import { init, session } from './session.js';
import { allowedEmail, signOut } from './auth.js';
import { esc } from './ui.js';
import * as signin from './views/signin.js';

const MEMBER_TABS = [['membership', 'My membership'], ['events', 'Events'], ['programs', 'Programs'], ['directory', 'Directory']];
const EXEC_TABS = [['manage', 'Manage members'], ['attendance', 'Attendance'], ['registrations', 'Event sign-ups'], ['email', 'Email list'], ['programadmin', 'Program admin']];
const ADMIN_TABS = [['admin', 'Admin']];

const VIEWS = {
  membership: () => import('./views/membership.js'),
  events: () => import('./views/events.js'),
  programs: () => import('./views/my-programs.js'),
  directory: () => import('./views/directory.js'),
  manage: () => import('./views/manage.js'),
  attendance: () => import('./views/attendance.js'),
  registrations: () => import('./views/registrations.js'),
  email: () => import('./views/emaillist.js'),
  programadmin: () => import('./views/programadmin.js'),
  admin: () => import('./views/admin.js')
};

/* Things that must be switched off when someone leaves a page (live listeners). */
const cleanups = [];
export const onCleanup = fn => cleanups.push(fn);
export function cleanup() { while (cleanups.length) { try { cleanups.pop()(); } catch (e) { console.error(e); } } }

const makeCtx = rerender => ({ term: store.portal.currentTerm, data: store, portal: store.portal, rerender, onCleanup });

function tabsFor() {
  const tabs = [];
  if (session.isMember) tabs.push(...MEMBER_TABS);
  if (session.isExec) tabs.push(...EXEC_TABS);
  if (session.isAdmin) tabs.push(...ADMIN_TABS);
  return tabs;
}

function subnavHTML(active, tabs) {
  const memberSubs = new Set(MEMBER_TABS.map(t => t[0])), execSubs = new Set(EXEC_TABS.map(t => t[0]));
  let html = '<nav class="subnav" aria-label="Account sections">', lastGroup = '';
  for (const [id, label] of tabs) {
    const group = memberSubs.has(id) ? 'member' : execSubs.has(id) ? 'exec' : 'admin';
    if (group !== lastGroup && group !== 'member') html += `<span class="grp">${group === 'exec' ? 'Exec tools' : 'Club account'}</span>`;
    lastGroup = group;
    html += `<a href="#account/${id}" class="${id === active ? 'on' : ''}" ${id === active ? 'aria-current="page"' : ''}>${esc(label)}</a>`;
  }
  if (!session.isMember) html += `<a href="#account" class="right" data-signout>Sign out</a>`;
  return html + '</nav>';
}

// Shown on the sign-in page when someone clicked through from a sign-up button.
const SIGNIN_NOTES = {
  events: 'Sign in to register for events. Registering takes a minute, and you can pay the club fee in person when we take attendance.',
  programs: 'Sign in to sign up for programs. Programs are for paid members: pay the club fee in cash or through WUSA, and an exec will confirm it.'
};

export async function renderAccount(box, sub) {
  cleanup();
  await init();
  if (!session.user) return signin.render(box, { note: SIGNIN_NOTES[sub] || '' });
  if (!allowedEmail(session.email)) {
    box.innerHTML = `<div class="portal-narrow card"><h2>Use your Waterloo email</h2><p>You're signed in as <b>${esc(session.email)}</b>, but the portal is only for @uwaterloo.ca addresses.</p><a class="btn" href="#account" data-signout>Sign out</a></div>`;
    box.querySelector('[data-signout]').addEventListener('click', async e => { e.preventDefault(); await signOut(); location.reload(); });
    return;
  }

  const needsRegistration = session.isMember && !session.profile;
  const tabs = tabsFor();
  if (needsRegistration) sub = 'membership';
  if (!tabs.some(t => t[0] === sub)) sub = tabs[0][0];

  box.innerHTML = (needsRegistration ? '' : subnavHTML(sub, tabs)) + '<div id="view"></div>';
  box.querySelector('[data-signout]')?.addEventListener('click', async e => { e.preventDefault(); await signOut(); location.reload(); });
  const view = box.querySelector('#view');
  const mod = await VIEWS[sub]();
  await mod.render(view, makeCtx(() => renderAccount(box, sub)));
}

/** The page the door QR code opens. */
export async function renderCheckin(box, eventId) {
  cleanup();
  await init();
  if (!session.user) return signin.render(box, { note: 'Sign in to check in to this event.' });
  const mod = await import('./views/checkin-view.js');
  await mod.render(box, eventId, makeCtx(() => renderCheckin(box, eventId)));
}
