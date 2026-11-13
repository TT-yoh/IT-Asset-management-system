# Functional audit prompt

Paste everything below the line into Claude Code, opened in the project you want checked.
Fill in the two bracketed lines first.

---

Check that every feature of this application works end to end, fix what is broken, and build
what is missing. Work through it the way a careful QA engineer and developer would, not by
reading the code alone.

Project facts:
- How to run it locally: [e.g. "npm run server" for the API and "npm run dev" for the web app, or "work it out from package.json"]
- Database: [e.g. "a live shared database: only create throwaway test data and delete it afterwards" or "a local test database I can reset"]

How to work:
1. Set up. Start the app locally. Create a throwaway test organisation/tenant and an admin
   account directly in the database (clearly named, e.g. "uicheck"), with a random password
   kept in a temp file outside the repo. Never use or modify real users' data. Ask me before
   any step that writes to a database you have not confirmed is safe.
2. Sign in through the real sign-in page in the browser, as that test admin.
3. Go through every screen in the navigation, one at a time. On each screen, exercise every
   button, link, form field, dropdown, filter, search box, sort header, pagination control,
   tab, modal and its close/cancel/Escape behaviour, and every create / edit / delete action.
4. For every action that changes data, do not trust the screen. Confirm the change actually
   reached the server: read it back from the API or database. Then reload the page and check
   it is still there and still correct. Also try: two edits in a row on the same record,
   editing a record right after creating it, invalid input, a duplicate that the server should
   refuse, and an action the user's role should not be allowed to do.
5. Watch the browser console and network log the whole time. Treat any uncaught error, any
   failed request (4xx/5xx) the user was not told about, and any success message shown for a
   save that did not happen as a bug.
6. Check the less visible paths too: page reload while signed in (must stay signed in),
   sign-out (session must be invalid on the server afterwards), background data refresh
   (must not wipe a half-filled form or undo a fresh save), empty states, loading states,
   and reports/exports (do they show the right records?).
7. Fix each bug at its root cause, keeping the project's existing style. When a feature is
   clearly expected (a page that says "no X configured" with no way to configure X, a server
   endpoint the UI never calls), implement it. Re-test each fix in the browser.
8. Before finishing: run the project's typecheck/lint (for both client and server code) and
   its full test suite, delete every piece of test data you created and confirm none is left,
   and stop any servers you started.

Report back with:
- What was broken and how you fixed it, most serious first, in plain language.
- What you built that was missing.
- What works and was checked.
- What you could not check (e.g. camera, email, payments) and why.
- Anything left unfixed, with the reason.

Do not commit or push; leave that to me.
