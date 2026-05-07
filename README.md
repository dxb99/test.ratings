# DXB99 Ratings Lab

DXB99 Ratings Lab is a separate ratings web app for testing and comparing different player rating methods for DXB99 Unreal Tournament sessions.

Live app:

https://dxb99.github.io/ratings/

Backend:

Google Apps Script connected to the `DXB99 Ratings` Google Sheet.

## What This App Does

The app lets players rate each other using three different systems:

- **Version 1**: One overall 0-10 score per player.
- **Version 2**: Three 0-10 scores per player, based on game modes:
  - Elimination
  - Blitz
  - Capture the Flag
- **Version 3**: Six 0-10 gameplay categories:
  - Combat Skills
  - Communication / Status Updates
  - Decision Making
  - Map Awareness
  - Movement / Speed
  - Team Impact

The **Results** tab compares the outcomes from all three methods using average, median, and Version 3 weighted score.

The **Status** tab shows which players have saved ratings for each version, plus update and clear counts.

## Files

- `index.html`  
  Main page structure, tabs, buttons, modals, and visible app sections.

- `style.css`  
  App styling, responsive layout, dark glass theme, sliders, tables, cards, mobile views, and popups.

- `script.js`  
  Frontend app logic, tab switching, ratings forms, email-code verification, saving/updating ratings, results/status rendering, admin actions, and Google Apps Script API calls.

- `Code.gs`  
  Google Apps Script backend. Handles sheet reads/writes, verification codes, email sending, results calculations, status logs, ratings lock/unlock, and applying final ratings to the Players sheet.

- `DXB99.MATCHUP.png`  
  DXB99 logo image used by the app.

## Google Sheet Tabs

The backend expects these sheet tabs:

- `Players`  
  Player list, current skill values, active status, and registered email addresses.

- `VersionVotes`  
  Raw submitted ratings for Version 1, Version 2, and Version 3.

- `VersionResults`  
  Calculated average, median, vote count, and weighted score results.

- `VersionStatusLog`  
  Tracks submit, update, and clear actions.

- `RatingCodes`  
  Stores email verification codes, expiration times, resend times, and verification timestamps.

## Verification Codes

Players must verify by email before editing or saving ratings.

- Codes are sent to the registered email in the `Players` sheet.
- Codes expire after 24 hours.
- Resending uses the same active code until it expires.
- Rating controls stay locked until the selected player verifies successfully.

## Admin Features

Admin-protected actions include:

- Lock ratings
- Unlock ratings
- Apply final ratings to the `Players` sheet

When final ratings are applied, the backend creates a backup sheet first.

Backup names use the month/year format, for example:

`PlayersBackup_APRIL2026`

## Admin Receipt Emails

Rating submit/update notifications are sent to the admin receipt email list in `Code.gs`:

```js
const ADMIN_RECEIPT_EMAILS = [
  'dxb99.clan@gmail.com',
  'arshadfahim@gmail.com'
];
```

To remove the secondary email later, delete the second email line and leave only the main admin email.

## Deployment

### GitHub Pages

Upload these frontend files to the GitHub repository used for:

https://dxb99.github.io/ratings/

Frontend files:

- `index.html`
- `style.css`
- `script.js`
- `DXB99.MATCHUP.png`

After uploading, hard refresh the browser to avoid cached CSS/JS.

### Apps Script

Upload the contents of `Code.gs` into the Google Apps Script project connected to the `DXB99 Ratings` sheet.

After editing `Code.gs`:

1. Save the Apps Script file.
2. Create a new deployment version.
3. Make sure the deployed web app URL matches the `API_URL` in `script.js`.

Current frontend API URL is set at the top of `script.js`:

```js
const API_URL = "https://script.google.com/macros/s/AKfycbyOfQRKh_tj5sdISprAbO2GsS2dyjIE3u37woE2wjzORhWcenHi_FuKyUa20rKD0GpaZQ/exec";
```

## Testing Checklist

After uploading or deploying changes, test:

- App loads without startup error.
- Selecting a player shows the correct registered email message.
- Request code sends email.
- Verify code unlocks rating controls.
- Submit Version 1.
- Submit Version 2.
- Submit Version 3.
- Update an already submitted version.
- Clear saved data for a version.
- Results tab refreshes correctly.
- Status tab refreshes correctly.
- Lock ratings blocks edits/submits.
- Unlock ratings allows edits/submits.
- Apply to Players updates the `Players` sheet and creates a backup.
- Admin receipt emails are received.

## Notes

- Missing votes are ignored. They are not counted as zero.
- A player cannot rate themselves.
- Players can submit any one version, two versions, or all three versions.
- Results are calculated only from submitted ratings for each version.
- Version 3 weighted score only applies to Version 3 because it uses category weights.

