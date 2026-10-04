// Fills in "--%" grade badges (as rendered by BetterCampus / Better Canvas) with a
// grade calculated from the student's own assignment scores and group weights.

const PLACEHOLDER = /^--\s*%$/;
const TOOLTIP = "Calculated from your assignment scores (course total is hidden)";
const grades = new Map(); // courseId -> Promise<number|null>

async function getJSON(path) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  const text = await res.text();
  return JSON.parse(text.replace(/^while\(1\);/, ""));
}

// Graded, countable assignments in a group as {score, possible, neverDrop}.
function gradedEntries(group) {
  const neverDrop = new Set((group.rules && group.rules.never_drop) || []);
  const entries = [];
  for (const a of group.assignments || []) {
    const s = a.submission;
    if (!s || a.omit_from_final_grade || a.grading_type === "not_graded") continue;
    if (s.excused || s.score == null || s.workflow_state === "pending_review") continue;
    entries.push({
      score: s.score,
      possible: a.points_possible || 0,
      neverDrop: neverDrop.has(a.id),
    });
  }
  return entries;
}

function ratio(entries) {
  const possible = entries.reduce((t, e) => t + e.possible, 0);
  const score = entries.reduce((t, e) => t + e.score, 0);
  return possible > 0 ? score / possible : score;
}

// Drop `count` entries one at a time, each time removing whichever one moves the
// group's ratio furthest in the wanted direction. Always keeps at least one.
function drop(entries, count, wantHigher) {
  let kept = entries;
  for (let n = 0; n < count && kept.length > 1; n++) {
    let best = -1;
    let bestRatio = wantHigher ? -Infinity : Infinity;
    kept.forEach((e, i) => {
      if (e.neverDrop) return;
      const r = ratio(kept.filter((_, j) => j !== i));
      if (wantHigher ? r > bestRatio : r < bestRatio) {
        bestRatio = r;
        best = i;
      }
    });
    if (best === -1) break;
    kept = kept.filter((_, j) => j !== best);
  }
  return kept;
}

function groupTotals(group) {
  const rules = group.rules || {};
  let entries = gradedEntries(group);
  entries = drop(entries, rules.drop_lowest || 0, true);
  entries = drop(entries, rules.drop_highest || 0, false);
  return {
    score: entries.reduce((t, e) => t + e.score, 0),
    possible: entries.reduce((t, e) => t + e.possible, 0),
    weight: group.group_weight || 0,
  };
}

function calculate(groups, weighted) {
  const totals = groups.map(groupTotals);
  if (weighted) {
    let sum = 0;
    let weightSum = 0;
    for (const t of totals) {
      if (t.possible <= 0) continue;
      sum += (t.score / t.possible) * t.weight;
      weightSum += t.weight;
    }
    if (weightSum === 0) return null;
    return weightSum < 100 ? (sum * 100) / weightSum : sum;
  }
  const score = totals.reduce((s, t) => s + t.score, 0);
  const possible = totals.reduce((s, t) => s + t.possible, 0);
  return possible > 0 ? (score / possible) * 100 : null;
}

function courseGrade(courseId) {
  if (!grades.has(courseId)) {
    grades.set(
      courseId,
      Promise.all([
        getJSON(`/api/v1/courses/${courseId}`),
        getJSON(
          `/api/v1/courses/${courseId}/assignment_groups?include[]=assignments&include[]=submission&per_page=100`
        ),
      ])
        .then(([course, groups]) => calculate(groups, course.apply_assignment_group_weights))
        .catch((err) => {
          console.warn("[Hidden Grades]", err);
          return null;
        })
    );
  }
  return grades.get(courseId);
}

// The badge is usually a link to /courses/:id/grades; otherwise use the nearest
// ancestor card that links to exactly one course.
function courseIdFor(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    const links = node.matches("a[href*='/courses/']")
      ? [node]
      : [...node.querySelectorAll("a[href*='/courses/']")];
    const ids = new Set(
      links.map((a) => (a.getAttribute("href").match(/\/courses\/(\d+)/) || [])[1]).filter(Boolean)
    );
    if (ids.size === 1) return [...ids][0];
    if (ids.size > 1) return null;
  }
  return null;
}

function scan() {
  // BetterCampus renders the badge as two text nodes ("--" and "%"), so match on
  // the element's whole text rather than on a single node.
  const badges = document.querySelectorAll(".bettercampus-card-grade, .bettercanvas-card-grade");
  for (const el of badges) {
    if (!PLACEHOLDER.test(el.textContent.trim())) continue;
    const courseId = courseIdFor(el);
    if (!courseId) continue;
    courseGrade(courseId).then((grade) => {
      if (grade == null || !el.isConnected) return;
      if (!PLACEHOLDER.test(el.textContent.trim())) return;
      el.textContent = `${Math.round(grade * 100) / 100}%`;
      el.title = TOOLTIP;
    });
  }
}

let timer;
new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(scan, 300);
}).observe(document.body, { childList: true, subtree: true, characterData: true });
scan();
