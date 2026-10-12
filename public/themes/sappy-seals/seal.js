var ChainLensSappy = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // shared-wallet-sappy-seal.tsx
  var shared_wallet_sappy_seal_exports = {};
  __export(shared_wallet_sappy_seal_exports, {
    SEAL_APPEARANCE_EVENT: () => SEAL_APPEARANCE_EVENT,
    SEAL_APPEARANCE_KEY: () => SEAL_APPEARANCE_KEY,
    SappySeal: () => SappySeal,
    SappySealAppearance: () => SappySealAppearance,
    alternateSeal: () => alternateSeal,
    setAlternateSeal: () => setAlternateSeal
  });
  var SEAL_APPEARANCE_KEY = "cl_sappy_seal_alternate.v1";
  var SEAL_APPEARANCE_EVENT = "cl-sappy-seal-appearance";
  function alternateSeal() {
    try {
      return localStorage.getItem(SEAL_APPEARANCE_KEY) === "1";
    } catch {
      return false;
    }
  }
  function setAlternateSeal(value) {
    try {
      localStorage.setItem(SEAL_APPEARANCE_KEY, value ? "1" : "0");
    } catch {
    }
    window.dispatchEvent(new Event(SEAL_APPEARANCE_EVENT));
  }
  var React = window.React;
  var { useEffect, useRef, useState } = React;
  var coreUrl = "/themes/sappy-seals/live2dcubismcore.min.js";
  var pixiUrl = "/themes/sappy-seals/pixi.min.js";
  var cspUrl = "/themes/sappy-seals/pixi-csp.js";
  var displayUrl = "/themes/sappy-seals/browser.js";
  var mocUrl = "/themes/sappy-seals/Seal Login.moc3";
  var physicsUrl = "/themes/sappy-seals/Seal Login.physics3.json";
  var textureUrl = "/themes/sappy-seals/Seal Login.4096/texture.png";
  var alternateTextureUrl = "/themes/sappy-seals/Seal Login.4096/texture_00.png";
  var fallbackUrl = "/themes/sappy-seals/seal-head.786c8b01.png";
  var motions = { "Motions/0. Blinking.motion3.json": "/themes/sappy-seals/Motions/0.%20Blinking.motion3.json", "Motions/0. Idle.motion3.json": "/themes/sappy-seals/Motions/0.%20Idle.motion3.json", "Motions/1. Seal_Enter.motion3.json": "/themes/sappy-seals/Motions/1.%20Seal_Enter.motion3.json", "Motions/10. Seal_Sleepy_Enter.motion3.json": "/themes/sappy-seals/Motions/10.%20Seal_Sleepy_Enter.motion3.json", "Motions/11. Seal_Sleepy_Constant.motion3.json": "/themes/sappy-seals/Motions/11.%20Seal_Sleepy_Constant.motion3.json", "Motions/12. Seal_Sleepy_Exit.motion3.json": "/themes/sappy-seals/Motions/12.%20Seal_Sleepy_Exit.motion3.json", "Motions/13. Seal_Coffee.motion3.json": "/themes/sappy-seals/Motions/13.%20Seal_Coffee.motion3.json", "Motions/2. Seal_Exit.motion3.json": "/themes/sappy-seals/Motions/2.%20Seal_Exit.motion3.json", "Motions/3. Seal_Failed_Enter.motion3.json": "/themes/sappy-seals/Motions/3.%20Seal_Failed_Enter.motion3.json", "Motions/4. Seal_Failed_Constant.motion3.json": "/themes/sappy-seals/Motions/4.%20Seal_Failed_Constant.motion3.json", "Motions/5. Seal_Failed_Exit.motion3.json": "/themes/sappy-seals/Motions/5.%20Seal_Failed_Exit.motion3.json", "Motions/6. Seal_Wrong_Pass.motion3.json": "/themes/sappy-seals/Motions/6.%20Seal_Wrong_Pass.motion3.json", "Motions/7. Seal_Excited_Enter.motion3.json": "/themes/sappy-seals/Motions/7.%20Seal_Excited_Enter.motion3.json", "Motions/8. Seal_Excited_Constant.motion3.json": "/themes/sappy-seals/Motions/8.%20Seal_Excited_Constant.motion3.json", "Motions/9. Seal_Excited_Exit.motion3.json": "/themes/sappy-seals/Motions/9.%20Seal_Excited_Exit.motion3.json" };
  var loading = null;
  var script = (src) => new Promise((resolve, reject) => {
    const node = document.createElement("script");
    node.src = src;
    node.onload = () => resolve();
    node.onerror = () => {
      node.remove();
      reject(new Error("Seal runtime unavailable"));
    };
    document.head.appendChild(node);
  });
  async function runtime() {
    if (!loading) loading = (async () => {
      const scope = window;
      if (!scope.Live2DCubismCore) await script(coreUrl);
      if (!scope.PIXI) await script(pixiUrl);
      await script(cspUrl);
      if (!scope.PIXI.live2d) await script(displayUrl);
      return scope;
    })().catch((error) => {
      loading = null;
      throw error;
    });
    return loading;
  }
  var clickMotions = ["Enter", "Excited_Enter", "Excited_Constant", "Excited_Exit", "Wrong_Pass", "Failed_Enter", "Failed_Constant", "Failed_Exit", "Sleepy_Enter", "Sleepy_Constant", "Sleepy_Exit", "Coffee", "Exit"];
  var selected = () => document.documentElement.dataset.clArtTheme === "sappy-seals-art" && !document.documentElement.hasAttribute("data-derived");
  function useAlternateSeal() {
    const [alternate, setAlternate] = useState(alternateSeal);
    useEffect(() => {
      const changed = () => setAlternate(alternateSeal());
      const storage = (event) => {
        if (event.key === SEAL_APPEARANCE_KEY || event.key === null) changed();
      };
      window.addEventListener(SEAL_APPEARANCE_EVENT, changed);
      window.addEventListener("storage", storage);
      return () => {
        window.removeEventListener(SEAL_APPEARANCE_EVENT, changed);
        window.removeEventListener("storage", storage);
      };
    }, []);
    return alternate;
  }
  function SappySealAppearance() {
    const alternate = useAlternateSeal();
    return /* @__PURE__ */ React.createElement("button", { type: "button", className: "sappy-seal-appearance", "aria-label": "Use alternate seal artwork", "aria-pressed": alternate, title: `Alternate seal artwork: ${alternate ? "On" : "Off"}`, onClick: () => setAlternateSeal(!alternate) }, " ", /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M8 4 3 7l3 5 2-1v9h8v-9l2 1 3-5-5-3a4 4 0 0 1-8 0Z" })));
  }
  function SappySeal() {
    const [enabled, setEnabled] = useState(selected);
    const alternate = useAlternateSeal();
    const host = useRef(null), canvas = useRef(null);
    useEffect(() => {
      const observer = new MutationObserver(() => setEnabled(selected()));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-cl-art-theme", "data-derived"] });
      return () => observer.disconnect();
    }, []);
    useEffect(() => {
      if (!enabled || !host.current || !canvas.current) return;
      const element = host.current, view = canvas.current, reduced = matchMedia("(prefers-reduced-motion: reduce)");
      delete element.dataset.ready;
      let clickIndex = 0, clickCount = 0;
      delete element.dataset.clickCount;
      delete element.dataset.clickMotion;
      let disposed = false, visible = true, app = null, model = null, lastPoint = null;
      const running = () => !disposed && visible && !document.hidden && !reduced.matches;
      const sync = () => {
        if (!app) return;
        if (model && running()) app.start();
        else app.stop();
      };
      const focus = (event) => {
        if (running()) lastPoint = { x: event.clientX, y: event.clientY };
      };
      const click = () => {
        if (!model || !running()) return;
        const group = clickMotions[clickIndex++ % clickMotions.length];
        void model.motion(group, 0, 3).catch(() => {
        });
      };
      const neutral = () => {
        lastPoint = null;
        model?.focus(view.clientWidth / 2, view.clientHeight / 2, true);
      };
      const visibility = new IntersectionObserver((entries) => {
        visible = (entries[0]?.intersectionRatio ?? 0) > 0;
        sync();
      }, { threshold: [0, 0.01] });
      visibility.observe(element);
      const fit = () => {
        if (!app || !model) return;
        const w = view.clientWidth, h = view.clientHeight;
        app.renderer.resize(w, h);
        model.scale.set(1);
        const scale = Math.min(w / model.width, h / model.height);
        model.scale.set(scale);
        model.anchor.set(0.5, 1);
        model.position.set(w / 2, h + 28);
        model.update(16);
        app.render();
      };
      const resize = new ResizeObserver(fit);
      resize.observe(view);
      window.addEventListener("pointermove", focus, { passive: true });
      window.addEventListener("pointerdown", focus, { passive: true });
      window.addEventListener("click", click, { passive: true });
      window.addEventListener("blur", neutral);
      document.addEventListener("visibilitychange", sync);
      reduced.addEventListener("change", sync);
      void (async () => {
        try {
          const { PIXI } = await runtime();
          if (disposed) return;
          app = new PIXI.Application({ view, width: 220, height: 160, transparent: true, backgroundAlpha: 0, antialias: true, autoStart: false, resolution: Math.min(devicePixelRatio || 1, 1.5) });
          app.ticker.maxFPS = 30;
          const absolute = (url) => new URL(url, window.location.href).href;
          const groups = {};
          const names = ["Idle", "Blinking", "Enter", "Exit", "Failed_Enter", "Failed_Constant", "Failed_Exit", "Wrong_Pass", "Excited_Enter", "Excited_Constant", "Excited_Exit", "Sleepy_Enter", "Sleepy_Constant", "Sleepy_Exit", "Coffee"];
          for (const [path, url] of Object.entries(motions)) {
            const index = Number(path.substring(path.lastIndexOf("/") + 1).split(".")[0]);
            const group = index === 0 ? "Idle" : names[index + 1];
            if (group) (groups[group] ?? (groups[group] = [])).push({ File: absolute(url) });
          }
          const loaded = await PIXI.live2d.Live2DModel.from({ url: absolute(mocUrl), Version: 3, FileReferences: { Moc: absolute(mocUrl), Textures: [absolute(alternate ? alternateTextureUrl : textureUrl)], Physics: absolute(physicsUrl), Motions: groups }, Groups: [{ Target: "Parameter", Name: "EyeBlink", Ids: [] }, { Target: "Parameter", Name: "LipSync", Ids: [] }] }, { autoInteract: false, autoUpdate: false });
          if (disposed) {
            loaded.destroy({ texture: true, baseTexture: true });
            return;
          }
          model = loaded;
          app.stage.addChild(model);
          fit();
          model.internalModel.motionManager.on("motionStart", (group) => {
            if (group !== "Idle" && !disposed) {
              element.dataset.clickMotion = group;
              element.dataset.clickCount = String(++clickCount);
            }
          });
          if (!reduced.matches) void model.motion("Idle", 0, 1);
          model.internalModel.on("beforeModelUpdate", () => {
            view.dataset.headAngle = String(model.internalModel.coreModel.getParameterValueById("ParamAngleX"));
          });
          app.ticker.add(() => {
            if (lastPoint) {
              const box = view.getBoundingClientRect();
              model.focus(lastPoint.x - box.left, lastPoint.y - box.top);
            }
            model.update(app.ticker.deltaMS);
          });
          element.dataset.artwork = alternate ? "alternate" : "original";
          element.dataset.ready = "true";
          sync();
        } catch (error) {
          if (!disposed) {
            element.dataset.ready = "fallback";
            console.warn("Sappy seal unavailable", error);
          }
        }
      })();
      return () => {
        disposed = true;
        visibility.disconnect();
        resize.disconnect();
        window.removeEventListener("pointermove", focus);
        window.removeEventListener("pointerdown", focus);
        window.removeEventListener("click", click);
        window.removeEventListener("blur", neutral);
        document.removeEventListener("visibilitychange", sync);
        reduced.removeEventListener("change", sync);
        app?.stop();
        app?.destroy(false, { children: true, texture: true, baseTexture: true });
        app = null;
        model = null;
      };
    }, [enabled, alternate]);
    return enabled ? /* @__PURE__ */ React.createElement("div", { ref: host, className: "sappy-seal-peek", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("img", { className: "sappy-seal-fallback", src: fallbackUrl, alt: "" }), /* @__PURE__ */ React.createElement("canvas", { ref: canvas, className: "sappy-seal-canvas" })) : null;
  }
  return __toCommonJS(shared_wallet_sappy_seal_exports);
})();
