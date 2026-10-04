# Hidden Grades for Canvas

A small Chrome extension that works on top of [BetterCampus](https://www.better-campus.com/). Some Canvas courses hide the overall grade, so BetterCampus shows `--%` on the dashboard card even though every assignment score and group weight is visible. This fills that badge in with the grade calculated from your own scores.

## How it works

For each dashboard card showing `--%`, it reads the course's assignment groups and your submissions from the Canvas API (using your existing login), then applies Canvas's own rules:

- weighted assignment groups, rescaled when not every group has grades yet
- drop-lowest / drop-highest / never-drop rules
- excused, ungraded, and "does not count toward final grade" assignments are ignored

Hover a filled-in badge to see that it was calculated rather than reported by Canvas. Courses with nothing graded stay at `--%`.

## Install

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repo folder.
4. Refresh your Canvas dashboard.

It runs on `canvas.vt.edu` and `*.instructure.com`. For a Canvas site at another address, add it to `matches` in `manifest.json`.

## Notes

The result is an estimate. It can differ from the instructor's real total if they grade with a formula outside Canvas, or in groups that drop scores across assignments worth different points.
