const $ = (id) => document.getElementById(id);
const integer = new Intl.NumberFormat("en");
const dateLabel = (date, options = { month: "short", day: "numeric", year: "numeric" }) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en", { ...options, timeZone: "UTC" });
const colors = ["#1c2934", "#0e4429", "#006d32", "#26a641", "#39d353"];
let snapshot, days = [], selected = 0, drawChart = () => {};

function inspect(index) {
  selected = Math.max(0, Math.min(index, days.length - 1));
  const day = days[selected];
  $("day").value = day.date;
  $("selected-date").textContent = dateLabel(day.date, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  $("selected-count").textContent = `${integer.format(day.count)} contribution${day.count === 1 ? "" : "s"}`;
  const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
  const weekStart = new Date(`${day.date}T12:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  $("week-count").textContent = integer.format(snapshot.days.filter((d) => {
    const date = new Date(`${d.date}T12:00:00Z`);
    return date >= weekStart && date < weekEnd;
  }).reduce((sum, d) => sum + d.count, 0));
  $("month-count").textContent = integer.format(snapshot.days.filter((d) => d.date.slice(0, 7) === day.date.slice(0, 7)).reduce((sum, d) => sum + d.count, 0));
  $("previous").disabled = selected === 0;
  $("next").disabled = selected === days.length - 1;
}

function showRange() {
  const limit = Number($("period").value);
  days = limit ? snapshot.days.slice(-limit) : snapshot.days;
  const total = limit ? days.reduce((sum, d) => sum + d.count, 0) : snapshot.total;
  const active = days.filter((d) => d.count > 0).length;
  const peak = days.reduce((best, day) => day.count > best.count ? day : best, days[0]);
  $("total").textContent = integer.format(total);
  $("range").textContent = `${dateLabel(days[0].date)} – ${dateLabel(days.at(-1).date)}`;
  $("active").textContent = integer.format(active);
  $("consistency").textContent = `${Math.round(active / days.length * 100)}% of days in this range`;
  $("peak").textContent = integer.format(peak.count);
  $("peak-date").textContent = dateLabel(peak.date);
  $("day").min = days[0].date;
  $("day").max = days.at(-1).date;
  $("daily-counts").replaceChildren(...[...days].reverse().map((day) => {
    const row = document.createElement("tr");
    for (const value of [dateLabel(day.date), integer.format(day.count)]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
  inspect(days.length - 1);
  drawChart();
}

async function loadData() {
  const response = await fetch("data.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Calendar unavailable");
  const data = await response.json();
  if (!Array.isArray(data.days) || !data.days.length || data.days.some((d) =>
    !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Number.isInteger(d.count) || d.count < 0 || !Number.isInteger(d.level) || d.level < 0 || d.level > 4
  )) throw new Error("Invalid calendar");
  if (snapshot && snapshot.updatedAt === data.updatedAt) return;
  snapshot = data;
  $("updated").textContent = `Data updated ${new Date(data.updatedAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}`;
  for (const id of ["period", "day", "previous", "next"]) $(id).disabled = false;
  showRange();
}

$("period").addEventListener("change", showRange);
$("day").addEventListener("change", () => {
  const index = days.findIndex((d) => d.date === $("day").value);
  if (index >= 0) { inspect(index); drawChart.highlight?.(index); }
});
for (const [id, delta] of [["previous", -1], ["next", 1]]) {
  $(id).addEventListener("click", () => { inspect(selected + delta); drawChart.highlight?.(selected); });
}

async function start3D() {
  const [THREE, { OrbitControls }] = await Promise.all([import("three"), import("three/addons/controls/OrbitControls.js")]);
  const viewport = $("viewport");
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-30, 30, 18, -18, 0.1, 250);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  viewport.prepend(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minPolarAngle = 0.03;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.minZoom = 0.65;
  controls.maxZoom = 6;
  controls.autoRotateSpeed = 0.55;
  scene.add(new THREE.AmbientLight(0xb8d4e1, 1.7));
  const light = new THREE.DirectionalLight(0xffffff, 2.7);
  light.position.set(-16, 30, 20);
  scene.add(light);
  const geometry = new THREE.BoxGeometry(0.86, 1, 0.86);
  const material = new THREE.MeshLambertMaterial();
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0xa3ffd0 }));
  scene.add(outline);
  let bars, positions = [], labels = [], weekCount = 53, topView = false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function render() {
    renderer.render(scene, camera);
    let previousLabel = null;
    for (const label of labels) {
      const point = label.position.clone().project(camera);
      const x = (point.x + 1) / 2 * viewport.clientWidth;
      const y = (1 - point.y) / 2 * viewport.clientHeight;
      label.element.style.left = `${x}px`;
      label.element.style.top = `${y}px`;
      label.element.hidden = point.z < -1 || point.z > 1 || x < 0 || x > viewport.clientWidth || y < 0 || y > viewport.clientHeight || (previousLabel && Math.hypot(x - previousLabel.x, y - previousLabel.y) < 48);
      if (!label.element.hidden) previousLabel = { x, y };
    }
  }
  function resize() {
    const aspect = viewport.clientWidth / viewport.clientHeight;
    const height = Math.max(17, weekCount * 1.06 / aspect) * 1.15;
    camera.left = -height * aspect / 2;
    camera.right = height * aspect / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    render();
  }
  function home() {
    camera.position.set(topView ? 0 : 26, topView ? 70 : 38, topView ? 0.01 : 44);
    controls.target.set(0, 1.2, 0);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
    render();
  }
  function highlight(index) {
    const position = positions[index];
    outline.position.set(position.x, position.height / 2, position.z);
    outline.scale.set(1.06, position.height + 0.05, 1.06);
    render();
  }
  drawChart = () => {
    if (bars) { scene.remove(bars); bars.dispose(); }
    $("labels").replaceChildren();
    labels = [];
    positions = [];
    const start = new Date(`${days[0].date}T12:00:00Z`).getUTCDay();
    weekCount = Math.ceil((days.length + start) / 7);
    const max = Math.max(1, ...days.map((d) => d.count));
    bars = new THREE.InstancedMesh(geometry, material, days.length);
    const object = new THREE.Object3D();
    let month = "";
    days.forEach((day, index) => {
      const week = Math.floor((index + start) / 7);
      const weekday = (index + start) % 7;
      const height = day.count ? 0.2 + day.count / max * 6 : 0.08;
      const x = (week - (weekCount - 1) / 2) * 1.06;
      const z = (weekday - 3) * 1.06;
      positions.push({ x, z, height });
      object.position.set(x, height / 2, z);
      object.scale.set(1, height, 1);
      object.updateMatrix();
      bars.setMatrixAt(index, object.matrix);
      bars.setColorAt(index, new THREE.Color(colors[day.level]));
      if (day.date.slice(0, 7) !== month) {
        month = day.date.slice(0, 7);
        // A partial opening week can contain two months; label it once.
        if (labels.at(-1)?.week === week) labels.pop().element.remove();
        const element = document.createElement("span");
        element.className = "month-label";
        element.textContent = dateLabel(day.date, { month: "short", ...(!labels.length || day.date.slice(5, 7) === "01" ? { year: "2-digit" } : {}) });
        $("labels").append(element);
        labels.push({ element, week, position: new THREE.Vector3(x, 0, 5.4) });
      }
    });
    bars.instanceMatrix.needsUpdate = true;
    bars.instanceColor.needsUpdate = true;
    bars.computeBoundingSphere();
    scene.add(bars);
    resize();
    home();
    highlight(selected);
  };
  drawChart.highlight = highlight;
  controls.addEventListener("change", () => { $("tooltip").hidden = true; render(); });
  new ResizeObserver(resize).observe(viewport);
  let press = null;
  renderer.domElement.addEventListener("pointerdown", (event) => { press = { x: event.clientX, y: event.clientY }; $("tooltip").hidden = true; });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (event.buttons) return;
    const rect = viewport.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(bars)[0];
    $("tooltip").hidden = !hit;
    if (hit) {
      const day = days[hit.instanceId];
      $("tooltip").textContent = `${dateLabel(day.date)}\n${integer.format(day.count)} contribution${day.count === 1 ? "" : "s"}`;
      $("tooltip").style.left = `${Math.min(event.clientX - rect.left + 14, rect.width - 185)}px`;
      $("tooltip").style.top = `${Math.max(8, event.clientY - rect.top - 72)}px`;
      highlight(hit.instanceId);
    } else highlight(selected);
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) return;
    const rect = viewport.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(bars)[0];
    if (hit) { inspect(hit.instanceId); highlight(selected); }
    press = null;
  });
  renderer.domElement.addEventListener("pointerleave", () => { $("tooltip").hidden = true; highlight(selected); });
  for (const id of ["top", "rotate", "reset", "zoom-in", "zoom-out"]) $(id).disabled = false;
  $("loading").hidden = true;
  $("top").addEventListener("click", () => { topView = !topView; $("top").setAttribute("aria-pressed", String(topView)); home(); });
  function animate() {
    renderer.setAnimationLoop(controls.autoRotate && !document.hidden ? () => controls.update() : null);
  }
  $("rotate").addEventListener("click", () => { controls.autoRotate = !controls.autoRotate; $("rotate").setAttribute("aria-pressed", String(controls.autoRotate)); animate(); });
  document.addEventListener("visibilitychange", animate);
  $("reset").addEventListener("click", () => {
    topView = false;
    controls.autoRotate = false;
    $("top").setAttribute("aria-pressed", "false");
    $("rotate").setAttribute("aria-pressed", "false");
    animate();
    home();
  });
  for (const [id, factor] of [["zoom-in", 1.25], ["zoom-out", 0.8]]) {
    $(id).addEventListener("click", () => { camera.zoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, camera.zoom * factor)); camera.updateProjectionMatrix(); render(); });
  }
  drawChart();
}

try {
  await loadData();
  try { await start3D(); } catch (error) {
    $("loading").textContent = "The 3D view could not load. You can still inspect dates and read the daily counts below.";
    $("loading").classList.add("error");
    console.error(error);
  }
  setInterval(() => { if (!document.hidden) loadData().catch(console.error); }, 10 * 60 * 1000);
} catch (error) {
  $("loading").textContent = "The contribution data could not load. Please refresh to try again.";
  $("updated").textContent = "Calendar unavailable";
  console.error(error);
}
