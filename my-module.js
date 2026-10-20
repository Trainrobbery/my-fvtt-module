// FVTT drawing hover descriptions with polygon interior hit testing.
import { renderMarkdown } from "./markdown.mjs";
import { containsDrawingPoint } from "./geometry.mjs";

const MODULE_ID = "my-module";
let cleanup = () => {};
let resetHoverDelay = () => {};

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "hoverDelay", {
    name: "호버 설명 표시 지연 (밀리초)",
    hint: "도형에 마우스를 올린 뒤 설명이 나타날 때까지의 시간입니다. 1000 = 1초, 0 = 즉시 표시. GM이 지정하며 모든 접속자에게 적용됩니다.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 5000, step: 100 },
    default: 500,
    onChange: () => resetHoverDelay()
  });
});

function getHoverDelay() {
  const value = Number(game.settings.get(MODULE_ID, "hoverDelay"));
  return Number.isFinite(value) ? Math.min(5000, Math.max(0, value)) : 500;
}

// DrawingConfig v13 is a DocumentSheetV2. A named form field is included
// in its normal submit data, so Save persists it alongside the drawing.
Hooks.on("renderDrawingConfig", (app, element) => {
  const root = element?.querySelector ? element : app.element;
  if (!root || root.querySelector(".my-module-hover-field")) return;
  const textInput = root.querySelector('[name="text"]');
  const anchor = textInput?.closest(".form-group") ?? textInput;
  if (!anchor || !app.document) return;

  const group = document.createElement("div");
  group.className = "form-group stacked my-module-hover-field";
  const label = document.createElement("label");
  const input = document.createElement("textarea");
  input.id = `${app.id}-my-module-hover-body`;
  input.name = `flags.${MODULE_ID}.tooltip.body`;
  input.rows = 4;
  input.placeholder = "마우스를 올렸을 때 표시할 설명을 입력하세요.";
  input.value = app.document.getFlag(MODULE_ID, "tooltip")?.body ?? "";
  input.disabled = !app.isEditable;
  label.htmlFor = input.id;
  label.textContent = "호버 설명";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "마크다운 지원: **굵게**, *기울임*, # 제목, - 목록. 저장 후 호버하면 표시되며, 비워 두면 표시하지 않습니다.";
  group.append(label, input, hint);
  anchor.after(group);
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    // Call from a GM Script macro after selecting one drawing.
    async setSelected(title, body, gmOnly = false) {
      if (!game.user.isGM) return ui.notifications.warn("GM만 설명을 등록할 수 있습니다.");
      const selected = canvas.drawings?.controlled ?? [];
      if (selected.length !== 1) return ui.notifications.warn("그리기를 정확히 하나 선택하세요.");
      await selected[0].document.setFlag(MODULE_ID, "tooltip", {
        enabled: true, title: String(title), body: String(body), gmOnly
      });
      ui.notifications.info("설명을 저장했습니다.");
    },
    async clearSelected() {
      if (!game.user.isGM) return;
      const selected = canvas.drawings?.controlled ?? [];
      if (selected.length !== 1) return ui.notifications.warn("그리기를 정확히 하나 선택하세요.");
      await selected[0].document.unsetFlag(MODULE_ID, "tooltip");
      ui.notifications.info("설명을 삭제했습니다.");
    },
    async installSceneExample() {
      if (!game.user.isGM) return ui.notifications.warn("GM만 설명을 등록할 수 있습니다.");
      const drawing = canvas.scene?.drawings.get("eTmClQWPOGXNqmqH");
      if (!drawing) return ui.notifications.warn("현재 씬에서 예제의 +20ft 도형을 찾지 못했습니다. 직접 도형을 선택해 등록하세요.");
      await drawing.setFlag(MODULE_ID, "tooltip", {
        enabled: true,
        title: "높은 지형 (+20ft)",
        body: "주변보다 20피트 높은 지형입니다. 이 문장은 호버 기능을 확인하기 위한 예시입니다.",
        gmOnly: false
      });
      ui.notifications.info("+20ft 도형에 예제 설명을 등록했습니다.");
    }
  };
  if (canvas.ready) mount();
});

Hooks.on("canvasReady", mount);
Hooks.on("canvasTearDown", () => cleanup());

function mount() {
  cleanup();
  const view = canvas.app?.view ?? canvas.app?.renderer?.view;
  if (!view || !canvas.scene) return;

  const tip = document.createElement("div");
  tip.id = "my-module-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  const title = document.createElement("strong");
  const body = document.createElement("div");
  body.className = "my-module-markdown";
  tip.append(title, body);
  document.body.append(tip);

  let pointer = null;
  let frame = 0;
  let active = "";
  let hoverStarted = 0;
  let hoverTimer = null;
  const cancelHoverTimer = () => {
    if (hoverTimer !== null) clearTimeout(hoverTimer);
    hoverTimer = null;
  };
  const hide = () => {
    cancelHoverTimer();
    tip.hidden = true;
    active = "";
  };
  const leave = () => { pointer = null; hide(); };
  resetHoverDelay = () => { hide(); if (pointer) schedule(); };

  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
  }

  function update() {
    if (!pointer || !canvas.ready) return hide();
    // Convert CSS screen coordinates to renderer coordinates, then scene space.
    const rect = view.getBoundingClientRect();
    const screen = canvas.app.renderer.screen;
    if (!rect.width || !rect.height) return hide();
    const globalPoint = new PIXI.Point(
      (pointer.x - rect.left) * screen.width / rect.width,
      (pointer.y - rect.top) * screen.height / rect.height
    );
    const point = canvas.stage.worldTransform.applyInverse(globalPoint);
    if (!game.user.isGM && canvas.scene.tokenVision) {
      // Missing visibility support fails closed for players.
      if (!canvas.visibility?.testVisibility(point, { tolerance: 0 })) return hide();
    }

    const matches = [];
    for (const drawing of canvas.scene.drawings) {
      const config = drawing.getFlag(MODULE_ID, "tooltip");
      if (!config || config.enabled === false || !String(config.body ?? "").trim()) continue;
      // A hidden drawing never exposes its tooltip, including to the GM.
      if (drawing.hidden) continue;
      if (!game.user.isGM && config.gmOnly) continue;
      const { width, height } = drawing.shape;
      if (containsDrawingPoint(drawing, point)) {
        matches.push({ drawing, config, area: width * height });
      }
    }
    // Small areas take precedence over large ones. Stable ID resolves ties.
    matches.sort((a, b) => a.area - b.area || b.drawing.sort - a.drawing.sort
      || a.drawing.id.localeCompare(b.drawing.id));
    const target = matches[0];
    if (!target) return hide();
    const key = JSON.stringify([target.drawing.id, target.config.title, target.config.body]);
    if (key !== active) {
      hide();
      title.textContent = target.config.title ?? "";
      body.innerHTML = renderMarkdown(target.config.body);
      active = key;
      hoverStarted = performance.now();
    }
    // Movement within the same target does not restart the dwell time.
    // Re-evaluate visibility and the current target when the timer expires.
    const remaining = getHoverDelay() - (performance.now() - hoverStarted);
    if (remaining > 0) {
      tip.hidden = true;
      if (hoverTimer === null) hoverTimer = setTimeout(() => {
        hoverTimer = null;
        schedule();
      }, remaining);
      return;
    }
    cancelHoverTimer();
    tip.hidden = false;
    tip.style.left = `${Math.max(8, Math.min(pointer.x + 16, innerWidth - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, Math.min(pointer.y + 16, innerHeight - tip.offsetHeight - 8))}px`;
  }

  function move(event) {
    // Do not interfere with dragging, touch gestures, or token control.
    if (event.buttons || event.pointerType === "touch") return leave();
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  }
  view.addEventListener("pointermove", move);
  view.addEventListener("pointerleave", leave);
  view.addEventListener("pointerdown", leave);
  view.addEventListener("wheel", leave, { passive: true });
  window.addEventListener("blur", leave);
  // Refresh even if vision or Drawing data changes while the pointer is still.
  const timer = setInterval(() => { if (pointer) schedule(); }, 150);

  cleanup = () => {
    hide();
    resetHoverDelay = () => {};
    clearInterval(timer);
    cancelAnimationFrame(frame);
    view.removeEventListener("pointermove", move);
    view.removeEventListener("pointerleave", leave);
    view.removeEventListener("pointerdown", leave);
    view.removeEventListener("wheel", leave);
    window.removeEventListener("blur", leave);
    tip.remove();
    cleanup = () => {};
  };
}
