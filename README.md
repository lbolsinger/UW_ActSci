# UW ActSci Club Website

The website for the University of Waterloo Actuarial Science Club. It has two halves:

- **The public site**: Home, Events (calendar), Resources, Programs and Execs pages. All of its content comes from small JSON files, so updating it never means touching code.
- **The member portal** (the **Account** tab): sign-in, club registration, payments, event sign-up and attendance, the member directory, and the mentorship / resume critique / mock interview programs. It runs on [Supabase](https://supabase.com).

**Jump to:**
[Part 1: The code base](#part-1-the-code-base) ·
[Part 2: Supabase and accounts](#part-2-supabase-and-accounts) ·
[Part 3: What to update each term](#part-3-what-to-update-each-term) ·
[Reference](#reference-images-dates-and-times) ·
[Known issues and open decisions](#known-issues-and-open-decisions)

---

# Part 1: The code base

## What it is

A **static website with no build step**. It is plain HTML, CSS and JavaScript (ES modules), published on GitHub Pages. There is nothing to install, compile or deploy: push to `main` and the site updates.

- Public content lives in `data/*.json`.
- The only "backend" is Supabase, and it is only loaded when someone opens the Account tab (`js/portal/supabase.js`), so the public pages never depend on it.

## Run it on your computer

Browsers block data files when you double-click `index.html`. Instead, run this in the project folder and visit <http://localhost:8000>:

```
python3 -m http.server
```

## Publish it

1. Push the repository to GitHub.
2. Settings > Pages > Deploy from a branch > `main` / root.
3. The site appears at `https://<username>.github.io/<repo>/`.

## Folder layout

```
index.html                 Page shell: banner, navigation tabs, footer
css/
  styles.css               Public-site styling (colours and fonts are variables at the top)
  portal.css               Styling for the Account / portal pages
data/                      All public content, and the portal's settings
  site.json                Club name, social links, office, about text, "join" text, footer
  events.json              Calendar events (and how people sign up for them)
  key-dates.json           Purple calendar items: reading week, last day of classes, ...
  office-hours.json        Office-hour date ranges, and each exec's weekly slots and colour
  execs.json               Exec teams and members (the public Execs page)
  resources.json           Sections on the Resources page
  programs.json            Text for the Programs page
  portal.json              Portal settings: CURRENT TERM, year list, exam list, limits
images/                    Pictures (see "Images" below)
js/
  main.js                  Starts the site, loads data, handles page navigation
  data.js                  Loads the JSON files; office-hours and next-event logic
  utils.js                 Date, time and image helpers
  components/              Banner, icons, and the day pop-up on the calendar
  pages/                   One file per public page (home, events, resources, programs, execs)
                           plus account.js and checkin.js, which hand off to the portal
  portal/                  The member portal (only loaded on the Account tab)
    config.js              Supabase URL + public key, the club account email
    supabase.js            Creates the Supabase connection
    auth.js                Email-code sign-in and sign-out
    session.js             "Who is signed in, and are they a member / exec / admin?"
    app.js                 Decides which tabs to show; loads one view per tab
    db.js, dbcore.js       The database layer (see "How data moves" below)
    terms.js               Term helpers (Winter -> Spring -> Fall, "fall-2026")
    ui.js                  Shared interface bits: toggles, chips, star ratings, toasts, formatters
    payments.js            Marking a membership paid / undoing it / renewing
    eventreg-core.js       Event sign-up rules: capacity, deadline, waitlist, questions
    eventreg.js            Event sign-up database calls
    checkin-core.js        Check-in windows and self check-in
    views/                 One file per Account tab (membership, events, programs, directory,
                           manage, attendance, registrations, emaillist, programadmin, admin)
    programs/              Member side of resume critique, mock interviews, mentorship
    programadmin/          Exec side of the same three programs
supabase/
  schema.sql               Creates the database and ALL the security rules (run once; safe to re-run)
  purge-old-terms.sql      Clears old program data (run once a term)
  delete-member.sql        Deletes one person's data and login (for deletion requests)
```

## How the site starts up

1. `index.html` loads `js/main.js`.
2. `main.js` calls `loadData()` (in `data.js`), which fetches all eight JSON files at once. If any file has a typo, the page shows "The site could not load its data".
3. `data.js` joins the data together: office-hour slots are linked to execs by `execId`, and events plus key dates are merged into one list for the calendar. Any event without an `id` is given one (see [Events in detail](#events-in-detail)).
4. Navigation uses the URL hash (`#home`, `#events`, `#account/membership`, ...). Each page file exports `render()` (returns HTML) and optionally `mount()` / `unmount()`.

**To add a page:** create `js/pages/<name>.js` exporting `render()`, import it in `js/main.js`, add it to `PAGES`, and add a tab in `index.html`.

## How the member portal is wired in

- `js/pages/account.js` does nothing but check that Supabase is configured, then lazy-loads `js/portal/app.js`.
- `app.js` asks `session.js` who is signed in, builds the tab list for that person, and loads one view file per tab.
- Four exec pages (Manage members, Attendance, Event sign-ups, Program admin) refresh themselves about every 5 seconds, and immediately after you save something, so two execs working at once see each other's changes. The other pages load once when opened.

## How data moves

All club records live in **one Supabase table, `docs`**. Each row is a *collection name* (like `memberships`), an *id*, and a block of JSON. `js/portal/dbcore.js` wraps this in Firestore-style calls (`setDoc`, `updateDoc`, `batch`, `watch`) because the portal was originally built on Firestore; that is why the view files look the way they do.

```
Browser  ->  query_docs()  ->  docs table   (reads: rows filtered by the read rules)
Browser  ->  apply_ops()   ->  docs table   (writes: every change checked by app_authorize())
```

Nobody can read or write the table directly. See [How Supabase protects the data](#how-supabase-protects-the-data).

---

# Part 2: Supabase and accounts

## What Supabase does here

Supabase is a hosted database plus a sign-in service. This site uses it for exactly two things:

1. **Sign-in.** Members sign in with a one-time code emailed to their `@uwaterloo.ca` address. There are no passwords.
2. **Storing and protecting club records**: members, payments, attendance, event sign-ups, directory entries, and program data.

There is no server code to maintain. The "backend" is the SQL in `supabase/schema.sql`, which lives inside Supabase.

## What's in `js/portal/config.js`

| Setting | What it is |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Which Supabase project to talk to. **These are meant to be public** (they ship in the page); the data is protected by the rules in `schema.sql`, not by hiding them. **Never** put the `service_role` / secret key in this repo. |
| `ADMIN_EMAIL` | The club account. It **must match** `app_admin_email()` at the top of `supabase/schema.sql`. |
| `MEMBER_EMAIL_ENDING` | `@uwaterloo.ca`. Only these addresses can register. |
| `SUPABASE_JS_VERSION` | Version of Supabase's browser library, loaded from the jsDelivr CDN. |

## One-time setup (a new Supabase project)

1. Create a Supabase project.
2. Copy the project URL and the publishable ("anon") key from Project Settings > API into `config.js`.
3. Put the club account's email in `ADMIN_EMAIL` **and** in `app_admin_email()` in `schema.sql`.
4. Paste all of `supabase/schema.sql` into Supabase > SQL Editor > New query, and Run. It is safe to run again later; it replaces its own functions.
5. Switch on the sign-up filter: Authentication > Hooks > Before User Created > Postgres function > `public.hook_before_user_created`. This stops anyone without an `@uwaterloo.ca` address (or the club address) from creating an account.
6. Check the sign-in email: the Supabase email templates must include the code (`{{ .Token }}`), not just a link. The site asks people to type a code because university email scanners often open links and use them up. The sign-in page tells people the code has 8 digits, so make sure Supabase's email OTP length setting matches.
7. If codes ever stop arriving during busy weeks, Supabase's built-in email sender is rate-limited; set up custom SMTP in Supabase.
8. Sign in once with the club account, open Account > Admin, and add the execs (see [Admin guide](#admin-guide)).

> Note: the site's own messages mention a `SUPABASE_SETUP.md` file. It is not in this repository. Until it is added, this section is the setup guide.

**Moving to a new Supabase project?** Redo steps 1 to 8 and update the two values in `config.js`. Records do not move automatically.

## Signing in

1. The person enters their `@uwaterloo.ca` email on the Account tab.
2. Supabase emails a one-time code (valid for about an hour, single use). The same step creates the account for someone new.
3. They type the code and are signed in on that device (the session is remembered until they sign out).
4. A first-time member then lands on the registration form.

## How Supabase protects the data

- Row-level security is on, and direct access to the `docs` table is revoked. The only ways in are two functions:
  - **`query_docs`** reads. Which rows come back is decided by `app_can_read()` for the signed-in person.
  - **`apply_ops`** writes (up to 50 changes at once, all-or-nothing). Each change is checked by `app_authorize()` before it is saved.
- The rules are enforced **in the database**, so editing the website's JavaScript cannot give anyone more access.
- Examples of rules worth knowing: members can never set `paid` on their own membership; programs, check-in and mentor profiles require a **paid** membership; a mentor can never have more than 3 mentees; event sign-ups must have a current timestamp (so nobody can back-date to skip the queue); resume links must start with `http(s)://`.
- To change what anyone is allowed to do, edit `app_can_read` / `app_authorize` in `schema.sql` and run the file again.

## Who is who

| | **Member** | **Exec** | **Admin (club account)** |
|---|---|---|---|
| How they're recognised | Signed in with an `@uwaterloo.ca` address | A member whose email has a row in the `execs` list | The email equal to `ADMIN_EMAIL` |
| Account tabs | My membership, Events, Programs, Directory | All member tabs, plus **Exec tools**: Manage members, Attendance, Event sign-ups, Email list, Program admin | Exec tools plus **Admin**. It has **no member tabs**, because the club address isn't `@uwaterloo.ca` |
| Sees | Own data; the directory; anonymous queue positions for events | Everything members enter, payments, attendance, all program data | Everything an exec sees, plus reviewer ratings and deletion requests |

**Admin-only abilities:** adding/removing execs, reading reviewer ratings, and handling deletion requests. At the database level the club account is also the only one allowed to delete member and membership records (which is why account deletion is done through the SQL script rather than by execs).

**Important:** exec status is separate from the public Execs page. `data/execs.json` is only the photo/bio page and the office-hours roster. Access to the exec tools is controlled in **Account > Admin > Who's an exec**. Update both when the team changes.

## What members can do

| Tab | What it does |
|---|---|
| **My membership** | First visit: the registration form (name, year, work term, dietary needs, and an optional public profile: LinkedIn, co-op experience, credentials and exams). After that: this term's status (**Awaiting payment** or **Paid**), a one-click **Renew** each new term, events attended, the club-email switch, **Sign out**, and **Request account deletion**. |
| **Events** | Sign up for events, join a waitlist when one is full, answer the event's questions, change answers, cancel (the next person moves up automatically). Needs registration for the current term; payment is not needed to sign up. |
| **Programs** | Resume critique, mock interviews and mentorship. **Unlocks only once an exec has confirmed payment.** |
| **Directory** | Search other members of the current term. Shows only what each person chose to share: name, year, LinkedIn, co-op experience, credentials/exams, and a Mentor badge. Email and dietary details are never shown. Members can switch themselves off the directory. |
| *Check-in (not a tab)* | An "event is on now" prompt appears on My membership from 15 minutes before an event starts until it ends (`checkInOpensMinutesBefore` in `portal.json`). Only **paid** members can check in. |

**Membership and payment flow:** register (unpaid) -> pay the club fee in cash or through WUSA -> an exec marks it paid -> programs and check-in unlock. A new term needs a new registration ("Renew"); details carry over. Last term's membership then shows as **Expired**.

**Privacy shown to members at registration:** execs see everything entered; other members only see the "Tell us more" section and only if the directory switch is on; payment details are only ever seen by execs.

## Exec guide

Execs should sign in with **their own `@uwaterloo.ca` account**, not the club account, so "Verified by" on payments, "Marked by" on attendance and comment authors show real names. An exec must also register as a member before the exec tabs appear. They become an exec the next time they open the site after the admin adds them.

Manage members, Attendance, Event sign-ups and Program admin refresh about every 5 seconds, so it is fine for several execs to work at once. Email list and Admin load once when opened; reload them to see recent changes.

### Manage members
The member table for the current term, with counts for registered, paid, awaiting payment and past members who haven't renewed.
- Search by name or email. Filter: All, Awaiting payment, Paid, Past members, No club emails.
- Click a person for their details, events attended, and payment panel.
- **Mark as paid**: choose **WUSA** (a **6-digit confirmation number is required**) or **Cash**. "Verified by" is filled from your login. Every payment is logged with who did it and when.
- **Undo this payment** puts them back to awaiting payment (the undo is kept in the history, and an unpaid mentor loses their Mentor badge).
- **Past members** can be renewed and marked paid in one step.
- The **Club emails** switch changes whether they appear on the email list.

### Attendance
Used at the door.
- Pick the event (it starts on the one nearest to today). Search a member (at least two letters).
  - Paid: **Mark present**.
  - Not paid yet: take payment and **Mark paid + present**.
  - Expired: **Renew + collect payment + mark present**.
- **Show door check-in QR** opens a printable code for that event. Paid members who scan it are marked present automatically. It only works from 15 minutes before the event until it ends. (See [Known issues](#known-issues-and-open-decisions): the scan link currently needs a small fix.)
- The "Present so far" list and the "Paid tonight" count update live.

### Event sign-ups
For events that use portal sign-up.
- Shows spots taken (out of capacity), the waitlist, who actually came, and walk-ins.
- Lists dietary needs for everyone registered, plus each person's answers to the event's questions.
- **Remove** takes someone off (everyone behind them moves up). **Copy list (CSV)** copies the sheet to paste into a spreadsheet.
- Sign-ups made after the deadline are listed separately and not counted.

### Email list
Everyone who registered in the **current term or the previous 3** (`emailListTerms` in `portal.json`), minus anyone who turned off club emails.
- **Copy emails** (comma-separated, for the BCC line) or **Download CSV**.
- Always include an unsubscribe option, and point people to the email switch on My membership.

### Program admin
Three sub-tabs, all scoped to the current term.
- **Resume critique**: a queue of submitted links. **Open resume link** marks it viewed and assigns you as reviewer; **I'll review this** claims it without opening; **Can't open this link** asks the member to fix sharing settings; **Save comment** (the member sees it); **Mark reviewed**. We store only the link, never the file.
- **Mock interviews**: create sessions (date and time, location, interviewer), mark **Full** / reopen, delete; see who registered; write feedback (and an optional link) for each person. They see it as soon as you save.
- **Mentorship**: pick a waiting mentee and see up to five suggested mentors, ranked by shared interests, higher year, and matching meeting style. **Pair** creates the match; **Unpair** removes it. Matches are suggestions; you choose the pair. Each mentor takes at most 3 mentees and never more than they chose. Earlier terms' pairs are shown for reference.

## Admin guide

Sign in with the club account (the address in `ADMIN_EMAIL`). Use it for admin work only; day-to-day exec work should be done on personal accounts. The **Admin** tab has:

- **Who's an exec**: search members and flip the switch. To add someone who hasn't registered yet, type their `@uwaterloo.ca` email under **Add an exec by email**. **At the start of each term, add the new execs and switch off the outgoing ones.**
- **Reviewer ratings**: members rate resume reviewers and mock interviewers (1 to 5 stars, optional comment). Ratings are anonymous and only the club account can see them, shown as an average per reviewer.
- **Account deletion requests**: see [Deleting someone's data](#deleting-someones-data).

## Data, retention and deletion

### What is stored

| Collection | Contents | Who can read it |
|---|---|---|
| `users` | Profile: name, year, work term, dietary, LinkedIn, co-op, credentials, email preference | The person; execs |
| `memberships` | One per person per term (`<uid>_<term>`), with `paid` | The person; execs |
| `payments` | Method, WUSA number, who verified, full history | Execs only |
| `attendance` | One per person per event | The person; execs |
| `directory` | The public profile, current term | Signed-in members; execs |
| `eventRegistrations` | Event sign-ups and answers | The person; execs |
| `resumeRequests` (+ comments), `mockSessions`, `mockRegistrations`, `mentorProfiles`, `pairings` | Program data | The people involved; execs |
| `ratings` | Anonymous reviewer ratings | Club account only (a member can read back their own) |
| `execs` | Who has exec access | Execs |
| `deletionRequests` | Members asking to be deleted | Club account only |

### What is cleaned up, and when

- **Old program data: run `supabase/purge-old-terms.sql` once a term.** It deletes mentorship pairings, mentor/mentee profiles, resume requests (with comments), mock interview sign-ups (with feedback) and their ratings for any term older than the last 4 (the current term plus 3 before it, the same window as the email list).
  1. Open it in Supabase > SQL Editor.
  2. Set `v_current` (for example `'fall-2026'`) and `v_keep` on the two lines marked `CHANGE THIS`.
  3. Run it as is. It only **counts** what it would delete (see the Messages tab).
  4. If the numbers look right, change `v_dry_run` to `false` and run it again.
- **Not removed by that script:** members and their memberships, attendance, directory entries, event sign-ups, mock interview *sessions*, and payment records.
- **Nothing automatically deletes inactive members.** A member who stops renewing stays in the system (and shows under "Past members") until they ask to be deleted or an admin removes them. See [open decisions](#known-issues-and-open-decisions).
- **Keep `emailListTerms` in `portal.json` and `v_keep` in the purge script the same.** The mentorship tab tells execs that pairings are cleared after the same number of terms as the email list.

### Deleting someone's data

When a member presses **Request account deletion** (on My membership), the request appears under **Admin > Account deletion requests**.

1. Open `supabase/delete-member.sql` in Supabase > SQL Editor.
2. Replace the email on the line marked `CHANGE THIS`, and Run.
3. Back on the Admin tab, press **Mark done**.

The script removes their profile, memberships, attendance, directory entry, event sign-ups, program records, the comments and ratings attached to their requests, their mentorship pairings (and fixes every mentor's mentee count), and their login. **Payment records are kept on purpose.** Check the university's and WUSA's rules for how long payment records must be kept before removing that exception (the script says where).

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Account tab says "The member portal isn't switched on yet" | `config.js` values are empty or still placeholders. |
| "The member portal couldn't load" | No internet, or Supabase is unreachable. If it persists, check the Supabase dashboard (a project on a free plan can be paused after a period of inactivity). |
| "Please use your @uwaterloo.ca email address" | Only `@uwaterloo.ca` and the club address can sign in. |
| Sign-in code doesn't arrive | Check spam/junk; use **Send a new code**. If it happens to many people, see setup steps 6 and 7. |
| "That code is wrong or has expired" | Codes are single-use and last about an hour. Send a new one. |
| An exec doesn't see the exec tabs | They must be added under Admin > Who's an exec, must have registered as a member, and need to reload the site. |
| A member can't open Programs or check in | Their payment hasn't been confirmed. Mark it paid in Manage members. |
| Registration says it was blocked | They signed in with a non-Waterloo address. |
| Everything is "Expired" at the start of a term | Expected after you change `currentTerm`. Members press **Renew**. |
| "The site could not load its data" | A typo in a JSON file (no comments or trailing commas allowed). Paste the file into a JSON validator. |

---

# Part 3: What to update each term

Almost everything is in the `data/` folder. **The first item, `portal.json`, is the most important one.**

## Term checklist

Do these at the start of each term (the order below works well):

- [ ] **1. `data/portal.json`: set `currentTerm`** to the new season and year. This is the switch that moves the whole portal to the new term. Every membership, program and exec view is tied to it, and everyone's membership shows **Expired** until they press **Renew**. Do it when registration should open, after the last term's programs have wrapped up.
- [ ] **2. `data/events.json`**: add the term's events, and remove or archive old ones.
- [ ] **3. `data/key-dates.json`**: reading week, last day of classes, program deadlines.
- [ ] **4. `data/office-hours.json`**: the date ranges and each exec's weekly slots.
- [ ] **5. `data/execs.json`**: the new exec team, photos, and years.
- [ ] **6. Supabase > Account > Admin**: add the new execs, switch off the outgoing ones. (Separate from step 5.)
- [ ] **7. `data/site.json`**: the "Sign up for ... now!" line (`joinSubtitle`), the footer year, any changed links.
- [ ] **8. `data/resources.json`**: term-specific text (the exam-material discount section names the term) and the event slides list.
- [ ] **9. `data/programs.json`**: only if the program descriptions changed.
- [ ] **10. `images/`**: new exec photos, event posters, sponsor logos.
- [ ] **11. Supabase SQL Editor: run `purge-old-terms.sql`** (set `v_current` to the new term; dry run first).
- [ ] **12. Process any account deletion requests** (Admin tab).

After editing, open the site (locally or on GitHub Pages) and click through Home, Events and Execs to make sure nothing says "could not load its data".

## File-by-file guide

### `data/portal.json`: portal settings

```json
{
  "currentTerm": { "season": "Fall", "year": 2026 },
  "emailListTerms": 4,
  "mentorMaxMentees": 3,
  "checkInOpensMinutesBefore": 15,
  "years": ["1A", "1B", "...", "Graduate"],
  "credentials": { "designations": ["ASA", "..."], "tracks": { "SOA (ASA)": ["P", "FM", "..."] } },
  "mentorInterests": ["P&C", "Life", "..."]
}
```

- `currentTerm.season` is `Winter`, `Spring` or `Fall`.
- `emailListTerms`: how many terms (including the current one) are on the email list. Keep it equal to `v_keep` in `purge-old-terms.sql`.
- `mentorMaxMentees`: note that `schema.sql` also hard-codes a maximum of 3. To allow more, change both.
- `credentials`, `years`, `mentorInterests`: the choices shown on the registration and mentorship forms. Edit these when exam names change.

### `data/events.json`: the calendar and event sign-up

Add an object to the list. Dates are `YYYY-MM-DD`; times are 24-hour `HH:MM`.

```json
{
  "title": "Exam P Workshop",
  "start": "2026-11-03",
  "startTime": "17:00",
  "endTime": "19:00",
  "location": "Library, Study Room 3",
  "registerUrl": "",
  "description": "A guided problem session.",
  "photos": ["images/events/exam-p-poster.jpg"],
  "sponsors": [{ "name": "Acme Insurance", "logo": "images/sponsors/acme.png" }],
  "registration": { "capacity": 40, "deadline": "2026-11-02" }
}
```

- **All-day or multi-day:** add `"allDay": true`, optionally `"end": "2026-11-22"`, and leave out the times.
- `photos` and `sponsors` can be empty lists (`[]`). A `null` photo or logo shows a placeholder.
- Teal items on the calendar are events; purple items come from `key-dates.json`.

#### Events in detail

**How people sign up.** What the **Register** button does depends on these fields:

| You write | What happens |
|---|---|
| Nothing special (`registerUrl` is `""` or `"#"`, no `registration`) | **Sign-up inside the portal** (the default). The button goes to Account > Events. |
| `"registerUrl": "https://..."` and no `registration` | The button opens that outside link instead. |
| `"registration": false` (and no real `registerUrl`) | No sign-up. The pop-up says "No registration needed". Use this for drop-in events. |
| `"registration": { ... }` | Portal sign-up with extra options (below). |

**Portal sign-up options** (all optional):

```json
"registration": {
  "capacity": 40,
  "deadline": "2026-11-20",
  "questions": [
    { "label": "Any food allergies?", "type": "text" },
    { "label": "Will you attend in person?", "type": "yesno", "required": true },
    { "label": "Which session?", "type": "choice", "options": ["Early", "Late"] },
    { "label": "I agree to the photo policy", "type": "checkbox", "required": true }
  ]
}
```

- `capacity`: after this many people, further sign-ups join a **waitlist** in the order they signed up. When someone cancels, everyone behind them moves up automatically. Nothing is stored for the waitlist; it is worked out from sign-up times.
- `deadline`: `"2026-11-20"` means the end of that day; `"2026-11-20 17:00"` is an exact local time. Sign-ups after the deadline are not counted.
- `questions`: up to 10. Types are `text`, `yesno`, `choice` (needs `options`) and `checkbox`. Answers appear on the Event sign-ups tab for execs.
- To sign up, a person must be registered for the current term. They don't have to have paid, but they do before they can check in.

**Event IDs (read this before opening sign-up).** Sign-ups, attendance and the door QR code all identify an event by its `id`. If you don't write one, it is made from the title and start date, for example `excel-101-2026-11-23`. **If you rename an event or move its date after people have signed up, the id changes and those records no longer match.** To avoid this, give any event with sign-ups a fixed id and never change it:

```json
{ "id": "excel-101-fall-2026", "title": "Excel 101", "...": "..." }
```

If you must change a title or date after sign-up has opened, add `"id"` set to the *old* generated id first.

### `data/key-dates.json`: purple calendar items

```json
{ "title": "Reading week", "start": "2026-10-12", "end": "2026-10-16", "pausesOfficeHours": true }
```

`end` is optional (for a range). `"pausesOfficeHours": true` hides office-hour dots during that range.

### `data/office-hours.json`

- `periods`: the date ranges when office hours run (for example one per term).
- `people`: each person is linked to `execs.json` by `execId`, so the id must match exactly.
  - `day`: 0 = Sunday through 6 = Saturday. Times are 24-hour.
  - `color`: that person's dot colour on the calendar and Home page.

### `data/execs.json`: the public Execs page

A list of teams, each with `name`, `photo` and `members`. Each member has `id`, `name`, `role`, `year`, `program` and `photo`. Keep each person's `id` stable (lowercase, hyphenated) because `office-hours.json` refers to it. A `null` photo shows the person's initials. This file does **not** give anyone exec access in the portal; that is done in the Admin tab.

### `data/site.json`

Club name, social links (`"#"` means "not set yet"), contact `email`, `address`, `office` (shown to members in payment instructions), the About text, the "Not a member yet?" box (`joinTitle`, `joinSubtitle`, `joinText`), `footer`, and image paths for the banner and group photos.

### `data/resources.json`

A list of sections, each with `title`, `image`, `text` and `links` (`label` and `url`). Two parts go stale each term: the exam-material discount text (it names the term) and the "Event slides" links.

### `data/programs.json`

The text and sign-up buttons for Mentorship, Resume critique and OPG. The OPG section is switched off in `js/pages/programs.js` (instructions to bring it back are in a comment there).

## Things to change occasionally

- **Colours and fonts:** variables at the top of `css/styles.css`.
- **Exam lists:** `portal.json` > `credentials`. The rule that hides exams "covered by" a designation is written out in code, in `coveredByDesignation()` in both `js/portal/views/membership.js` and `js/portal/views/directory.js`. Update both if the exam structure changes.
- **Changing the club account:** update `ADMIN_EMAIL` in `config.js` **and** `app_admin_email()` in `schema.sql`, then run `schema.sql` again.
- **Changing security rules or adding a type of record:** edit `schema.sql`, then run the whole file again.

---

# Reference: images, dates and times

Set any image path in the JSON files to a file in `images/`, for example `"photo": "images/execs/jordan-lee.jpg"`. Where a path is `null`, a grey placeholder is shown. (The `blank` files only exist so Git keeps the empty folders.)

| Folder | For |
|---|---|
| `images/banner/` | Banner image and logo mark (`bannerImage` / `bannerLogo` in `site.json`) |
| `images/general/` | Exec group photo, office hours schedule photo |
| `images/execs/` | Individual exec photos (square works best) |
| `images/teams/` | Team photos (4:3 works best); create the folder when needed |
| `images/events/` | Promotional photos |
| `images/sponsors/` | Sponsor logos |
| `images/resources/` | Pictures for the Resources page |

Tip: resize photos to about 1600 px wide before uploading so pages load quickly.

- Dates are always `YYYY-MM-DD`; times are 24-hour `HH:MM`.
- JSON does not allow comments or trailing commas. If the site shows "could not load its data", paste the file into a JSON validator to find the typo.

---

# Known issues and open decisions

**To fix**

1. **The door QR code link doesn't open the check-in page.** `js/pages/checkin.js` exists but is never registered in `js/main.js`, so a scanned `#checkin/<event>` link falls back to Home. Fix: in `main.js`, add `import * as checkin from './pages/checkin.js';` next to the other page imports and add `checkin` to the `PAGES` object. Members can still check in from the prompt on My membership, and execs can mark people present.
2. **`SUPABASE_SETUP.md` is mentioned but missing.** `config.js`, `account.js`, `views/admin.js` and `supabase/delete-member.sql` all point to it. Either add the file (this README's setup and deletion sections cover its content) or update those messages.

**To double-check**

3. **Drop-in events show a Register button.** An event with `"registerUrl": ""` and no `registration` field gets portal sign-up. For drop-ins such as study nights, add `"registration": false`.
4. **Sign-in code length.** The sign-in page says the code has 8 digits. Confirm Supabase's email OTP length is also 8.

**To decide as a club**

5. **How long do inactive members stay in the system?** Today only program data is cleaned up automatically (4 terms). Member accounts, attendance and directory entries stay until someone asks for deletion. If the club wants a cutoff (for example, delete anyone with no membership in the last N terms), agree on the number, write it here, and add a bulk version of `delete-member.sql`, which currently handles one person at a time.
6. **How long do payment records have to be kept?** Check with the university and WUSA (see [Deleting someone's data](#deleting-someones-data)).
7. **Who holds the club account?** Plan how its login is handed over each year, since it is the only account that can add execs and read ratings.
