# Member portal: setup guide

This adds accounts, registration, payments, attendance, the member directory, the email list and the programs (resume critique, mock interviews, mentorship) to the club website. The website itself keeps working exactly as before. The new **Account** tab only comes alive once you finish the steps below.

Everything here was tested in a real browser against a local copy of Firebase (80 checks across members, an exec and the club account), and the security rules were tested separately (98 checks). It has not been tested against *your* Firebase project, so use the checklist in Part E before real students use it.

---

## 1. Where each file goes

Keep the same folder structure as the rest of the site. The file names are unique, so there's no confusion.

**New files**

| File | Put it in |
|---|---|
| `SETUP.md`, `firestore.rules` | the top folder of the repo |
| `portal.json` | `data/` |
| `portal.css` | `css/` |
| `account.js`, `checkin.js` | `js/pages/` |
| `app.js`, `auth.js`, `checkin-core.js`, `config.js`, `db.js`, `firebase.js`, `members.js`, `payments.js`, `session.js`, `terms.js`, `ui.js` | `js/portal/` |
| `admin.js`, `attendance.js`, `checkin-view.js`, `directory.js`, `emaillist.js`, `manage.js`, `membership.js`, `my-programs.js`, `programadmin.js`, `signin.js` | `js/portal/views/` |
| `mentor.js`, `mock-member.js`, `resume-member.js` | `js/portal/programs/` |
| `mentorship-admin.js`, `mock-admin.js`, `resume-admin.js` | `js/portal/programadmin/` |

**Replace these two existing files** (they have small changes for the Account tab and event ids):

| File | Put it in |
|---|---|
| `main.js` | `js/` |
| `data.js` | `js/` |

**Edit one existing file**, `index.html`, in two places:

1. Under the line `<link rel="stylesheet" href="css/styles.css">` add:
   ```html
   <link rel="stylesheet" href="css/portal.css">
   ```
2. Under the line for the Execs tab, `<li><a class="tab" href="#execs">Execs</a></li>`, add:
   ```html
   <li><a class="tab" href="#account">Account</a></li>
   ```

You can do all of this now, before Firebase exists. Until you fill in `config.js`, the Account tab just says the portal isn't switched on yet, and nothing else changes.

---

## 2. Part A: Create the Firebase project (about 20 minutes)

Do this while signed in as the **club Google account**, so the club owns it.

1. Go to https://console.firebase.google.com and choose **Create a project**. Name it something like `uw-actsci-club`. Turn **Google Analytics off**.
2. On the project's home page, click the web icon (`</>`) to **add a web app**. Give it any name. You do not need Firebase Hosting. Firebase then shows a block of settings called `firebaseConfig`. Keep that page open, or copy it somewhere safe.
3. **Turn on sign-in:** Build > Authentication > Get started > Sign-in method > **Email/Password**. Enable it, and also switch on **Email link (passwordless sign-in)**. Save.
4. **Allow your website's address:** Authentication > Settings > **Authorized domains** > Add domain. Add `lbolsinger.github.io` (or whatever your site's domain is). `localhost` is already there.
5. **Create the database:** Build > **Firestore Database** > Create database. Choose a Canadian location (Toronto if it's offered). You can't change this later. Choose **production mode**.
6. **Stay on the free plan (Spark).** Don't add a credit card. Nothing in this portal needs one.
7. **Add a backup owner:** Project settings (the gear icon) > Users and permissions > add one trusted exec's Google account as **Owner**, so the project isn't stuck if the club account is lost.

## 3. Part B: Paste your settings into the code

**`js/portal/config.js`** has seven values to fill in:

- Six of them come from the `firebaseConfig` block in step 2: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. Copy each value between the quote marks. (If your block has no `storageBucket` line, type `none`. It isn't used.) Ignore `measurementId`.
- `ADMIN_EMAIL`: the club's Google account, for example `uwactsciclub@gmail.com`.

**`firestore.rules`** has one value to change: in the line near the top, `function adminEmail() { return 'PASTE_CLUB_ACCOUNT_EMAIL_HERE'; }`, put the **same** club email address. It must match `ADMIN_EMAIL` exactly.

> These settings are not secret. Firebase is designed for them to be public. Your data is protected by the rules, not by hiding this file.

## 4. Part C: Publish the security rules

1. In the Firebase console: Firestore Database > **Rules** tab.
2. Delete everything there, paste in the full contents of `firestore.rules` (with your club email in it), and press **Publish**.

These rules are what keep private details private. They make sure that:

- members can only see their own details,
- only execs can see payments, and nobody but an exec can mark a payment,
- only the club account can read reviewer ratings (not even execs can),
- only the club account can make someone an exec,
- a mentor can never have more than 3 mentees, and
- you can only sign yourself in to an event if you are paid.

Don't loosen them without asking someone who knows Firebase rules.

## 5. Part D: First sign-in, and adding your execs

1. Push everything to GitHub and wait for GitHub Pages to update. Hard refresh with Ctrl+F5.
2. Open your site and click **Account**. Enter the **club account's email address** and press the button. Open the email, click the link, and you're signed in. (The club account goes straight to the tools without registering as a member.)
3. Open the **Admin** tab. Under **Who's an exec**, switch on each exec who has registered, or type the email of someone who hasn't registered yet and press **Add**. They become an exec the next time they open the site.
4. Each exec should also register as a member like everyone else, so their name shows on the payments they record ("Verified by").

Turn on **2-step verification** for the club Google account. It is the most powerful login in the system.

---

## 6. Part E: Test checklist (do this before launch)

Use two real @uwaterloo.ca accounts (yours and a friend's), plus the club account.

- [ ] A non-Waterloo email is refused on the sign-in page.
- [ ] The sign-in email arrives (check spam). The link signs you in and the address bar is tidy afterwards.
- [ ] A new member can register. They see "Awaiting payment" on their page.
- [ ] You can't see anyone else's details as a normal member, and you don't see the exec tabs.
- [ ] The club account makes you an exec in Admin. After refreshing, you see **Exec tools**.
- [ ] As an exec: Manage members shows the registration, and you can record a WUSA payment (6 digits) and a cash payment. The member's page then shows **Paid**.
- [ ] Attendance: pick an event, search a member, mark them present. Try an unpaid member and use "Mark paid + present".
- [ ] "Show door check-in QR" shows a code. Scan it with a phone during the event's check-in window (15 minutes before the start until the end). A paid member sees the green "You're signed in" screen.
- [ ] A member submits a resume link. An exec opens it from the review queue, leaves a comment, and marks it reviewed. The member sees the progress and comment, and can rate the reviewer.
- [ ] The club account's Admin tab shows the rating. An ordinary exec cannot see ratings anywhere.
- [ ] Mentorship: one person signs up as a mentor (limit 1), another as a mentee. An exec pairs them. Each sees the other's profile. A full mentor is not suggested for anyone else.
- [ ] The Email list shows the right emails and leaves out anyone who turned off club emails.

---

## 7. Running the club

**New term.** In `data/portal.json`, change `currentTerm`, for example to `{ "season": "Winter", "year": 2027 }` (seasons are Winter, Spring, Fall). Everyone then has an expired membership until they press **Renew**. The directory, programs and attendance all switch to the new term. Past data stays.

**Changing the email-list window.** `emailListTerms` is how many terms are included (the current term plus the ones before it). Right now it is 4, meaning the current term and the previous 3.

**New exec team.** Sign in as the club account, open Admin, and switch the old execs off and the new ones on. Nothing else to do.

**Adding events.** Add them to `data/events.json` as before. Attendance is stored against an event id. If an event has no `"id"`, one is made from its title and date, for example `networking-with-sun-life-2026-09-14`. **If you rename an event or change its date after people have signed in, the id changes and the earlier attendance won't match.** To prevent that, add a fixed `"id"` to the event, for example `"id": "sun-life-networking-fall-2026"`.

**Deleting someone's data.** Members can request it from their page. It then appears in Admin > Account deletion requests. To do it: in the Firebase console, delete their documents from Firestore (collections: `users`, `directory`, `memberships`, `payments`, `attendance`, `mentorProfiles`, `pairings`, `resumeRequests`, `mockRegistrations`) and remove them in Authentication > Users. Check the university's and the student federation's rules about keeping payment records before you delete those. Then press **Mark done**.

**Mock interviews.** Execs create sessions under Program admin > Mock interviews. Members can't see how many others registered, so use **Mark full** when a session fills up.

---

## 8. Things worth knowing

- **The check-in window (15 minutes before to the end of the event) is enforced by the page, not the database.** A determined student could get around it, so execs should still glance at phones. Making it fully enforceable needs paid Firebase features.
- **Resumes are links, not files.** The site never stores a resume. Who can open the file depends on how the member shared it. The form tells them to choose "view only".
- **Sign-in emails can land in spam**, and they take a minute to arrive. Tell students to check junk mail. Opening the link on the same device it was requested from is smoothest. If a student opens it on a different device, they're asked to type their email once.
- **Free plan limits** are far above what a club needs. A busy event with several execs uses a tiny fraction of the daily allowance.
- **Privacy and email.** You're storing students' personal details and sending club emails. Publish a short privacy notice, check the university's and the student federation's rules for clubs, and include an unsubscribe option in what you send (Canada's anti-spam law, CASL, generally expects one). This guide isn't legal advice.
- **Exec access.** An exec can see every member's details and payments. Only give it to people who need it.

## 9. If something goes wrong

| What you see | Likely cause |
|---|---|
| Account tab says "isn't switched on yet" | `config.js` still has `PASTE_…` values |
| "Could not send the link" / sign-in email never arrives | Email link sign-in isn't enabled (Part A step 3), or your site's address isn't in Authorized domains (step 4) |
| "That wasn't allowed" messages | The rules weren't published, or `adminEmail()` in the rules doesn't match your club email |
| A page says it couldn't load | Check your internet connection. If it persists, press F12 and look at the Console for a red message, and send it to whoever maintains the site |
| Changes to your code don't show | GitHub Pages takes a minute or two. Hard refresh with Ctrl+F5 |
