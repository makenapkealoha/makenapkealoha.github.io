# Personal website — Makena Pollon

Static site, no build step. Every file is plain HTML/CSS/JS, so you can edit
anything directly on GitHub and the change is live in about a minute.

## Structure

```
index.html            Home — hero, research focus, about preview
experience.html       Education, teaching, tools
projects.html         Projects and publications
supplementary.html    Unlisted personal statistics library
404.html              Themed not-found page

css/style.css         The entire theme. One file, all four pages.
js/main.js            Nav highlighting + scroll reveals
js/network.js         The animated hero network
js/supplementary.js   Library contents + search/filter

img/                  Images
notes/                PDFs and note files for the supplementary page
robots.txt            Asks crawlers to skip supplementary.html and notes/
.nojekyll             Tells GitHub Pages to serve files as-is
```

## Deploying

Replace the contents of your repository with these files, keeping the folder
structure. Then delete the old files that are no longer used:

- `about.html` (replaced by `experience.html`)
- `css/aboutstyle.css` (the theme is now one stylesheet)
- `text.txt`

If your repo is `username.github.io`, the site is at `https://username.github.io`.
Otherwise it's at `https://username.github.io/repo-name/`.

Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.

## Editing

**Add a project or publication.** Copy an `<article class="work-item">` block in
`projects.html`. Use `status-pending` for the amber badge, `status-active` for blue.

**Add a course, degree, or tool.** Each is one `<li>` in `experience.html`.

**Add supplementary material.** Edit the `LIBRARY` array in `js/supplementary.js`.
Entries without a `url` render greyed out as *To write*, so the page doubles as a
checklist. Put files in `notes/` and link them as `notes/filename.pdf`.

**Change colors.** Every color is a variable at the top of `css/style.css` under
`:root`. Change `--signal` and the accent updates everywhere, including the hero
animation, which reads its colors from the stylesheet.

## A note on the "hidden" page

`supplementary.html` is **unlisted, not private.** It isn't linked from any public
page, it sends `noindex` headers, and `robots.txt` asks crawlers to skip it — so it
won't show up in search results. But GitHub Pages serves everything in a public
repo to anyone who knows the address, and the file is readable in the repo itself.

Treat it as "won't be stumbled upon," not "can't be accessed." Don't put anything
there you'd be unhappy for a stranger to read. If you need real privacy, see the
options in the handoff notes.
