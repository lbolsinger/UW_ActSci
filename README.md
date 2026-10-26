# Actuarial Science Club website

A static website (plain HTML, CSS and JavaScript, no build step). All of the content lives in JSON files in `data/`, so most updates never touch the code.

## Folder layout

```
index.html              Page shell: banner, navigation, footer
css/styles.css          All styling (colours are variables at the top)
data/
  site.json             Club name, tagline, social links, registration URLs, about text, key image paths
  key-dates.json        Purple items on the calendar (reading week, last day of classes, ...)
  events.json           Teal items on the calendar, with all the info shown in the day pop-up
  office-hours.json     Office-hour periods, plus each exec's weekly slots and dot colour
  execs.json            Exec teams and members
  resources.json        Sections on the Resources page
  programs.json         Mentorship, resume critique and OPG text and sign-up links
images/                 Put pictures here (see "Images")
js/
  main.js               Starts the site and handles page navigation
  data.js               Loads the JSON files and has the office-hours / next-event logic
  utils.js              Date, time and image helpers
  components/           Banner and the day pop-up
  pages/                One file per page (home, events, resources, programs, execs)
```

## Running it locally

The site loads its JSON files, so it needs a web server (opening `index.html` by double-clicking will not work):

```
python3 -m http.server
```

then visit http://localhost:8000.

## Publishing on GitHub Pages

1. Push this folder to a GitHub repository.
2. Settings > Pages > Deploy from a branch > `main` / root.
3. The site appears at `https://<username>.github.io/<repo>/`.

## Common updates

**Add an event**: add an object to `data/events.json`.

```json
{
  "title": "Exam P Workshop",
  "start": "2026-11-03",
  "startTime": "17:00",
  "endTime": "19:00",
  "location": "Library, Study Room 3",
  "registerUrl": "https://...",
  "description": "A guided problem session.",
  "photos": ["images/events/exam-p-poster.jpg"],
  "sponsors": [{"name": "Acme Insurance", "logo": "images/sponsors/acme.png"}]
}
```
- All-day or multi-day event: add `"allDay": true` and optionally `"end": "2026-11-22"`, and leave out the times.
- Leave `registerUrl` as `""` if no sign-up is needed.
- `photos` and `sponsors` can be empty lists (`[]`). A `null` photo or logo shows a placeholder.

**Add a key date**: add `{"title": "...", "start": "YYYY-MM-DD"}` to `data/key-dates.json` (add `"end"` for a range). Add `"pausesOfficeHours": true` to hide office-hour dots during that range.

**Change office hours**:
- Edit `data/office-hours.json`. `periods` are the date ranges when office hours run (for example one per term).
- Each person is linked to `execs.json` by `execId`. `day` is 0 for Sunday through 6 for Saturday, and times are 24-hour.
- Each person's `color` is their dot colour on the calendar and the home page schedule.

**New school year**: edit `execs.json`, `office-hours.json`, `key-dates.json` and `events.json`, and replace the photos. Nothing else.

**Change colours or fonts**: edit the variables at the top of `css/styles.css`.

**Add a page**: create `js/pages/<name>.js` exporting `render()` (returns HTML), import it in `js/main.js`, add it to `PAGES`, and add a tab in `index.html`.

## Images

Set any image path in the JSON files to a file in `images/`, for example `"photo": "images/execs/jordan-lee.jpg"`. Where a path is `null`, a grey placeholder is shown.

| Folder | For |
|---|---|
| `images/banner/` | Optional full-width banner (`bannerImage` in `site.json`) |
| `images/general/` | Exec group photo, office hours schedule photo |
| `images/execs/` | Individual exec photos (square works best) |
| `images/teams/` | Team photos (4:3 works best) |
| `images/events/` | Promotional photos |
| `images/sponsors/` | Sponsor logos |
| `images/resources/` | Pictures for the Resources page |

Tip: resize photos to about 1600 px wide before uploading so pages load quickly.

## Dates and times

- Dates are always `YYYY-MM-DD`; times are 24-hour `HH:MM`.
- JSON does not allow comments or trailing commas. If the site shows "could not load its data", paste the file into a JSON validator to find the typo.
