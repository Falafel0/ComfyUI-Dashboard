import { app } from "../../scripts/app.js";
import { state, loadSettings, loadValuePresets } from "./state.js";
import { updateDynamicStyles } from "./styles.js";
import { injectUI, setupUIListeners, loadFromGraph, setupResizers, toggleWebUIStudio } from "./ui.js";
import { initGrid } from "./grid.js";
import { setupExecutionLogic } from "./execution.js";

const GRID_CSS = "https://cdn.jsdelivr.net/npm/gridstack@7.2.3/dist/gridstack.min.css";
const GRID_JS = "https://cdn.jsdelivr.net/npm/gridstack@7.2.3/dist/gridstack-all.js";
const LOCAL_CSS = "/a11_studio/css/a11-studio.css";

function loadResource(url, type) {
    return new Promise((resolve, reject) => {
        const el = document.createElement(type === 'css' ? 'link' : 'script');
        if (type === 'css') {
            el.rel = 'stylesheet';
            el.href = url;
        } else {
            el.src = url;
        }
        el.onload = () => resolve();
        el.onerror = () => reject(new Error(`Failed to load ${url}`));
        document.head.appendChild(el);
    });
}

app.registerExtension({
    name: "Comfy.A1111ModeModular",
    async setup() {
        await loadResource(GRID_CSS, 'css');
        await loadResource(GRID_JS, 'js');

        await loadSettings();
        await loadValuePresets();

        await loadResource(LOCAL_CSS, 'css');

        injectUI();
        setupResizers();

        initGrid();
        setupUIListeners();
        setupExecutionLogic();
        updateDynamicStyles();

        const originalLoad = app.loadGraphData;
        app.loadGraphData = function(graphData) {
            const result = originalLoad.apply(this, arguments);
            setTimeout(() => {
                const overlay = document.getElementById("a11-overlay");
                if (app.graph.extra?.a1111_webui_tabs_data) {
                    state.appData = JSON.parse(JSON.stringify(app.graph.extra.a1111_webui_tabs_data));
                } else if (app.graph.extra?.a1111_webui_layout) {
                    state.appData = { tabs:[{ name: "Main", layout: app.graph.extra.a1111_webui_layout, activeGroups: [], generateBtnText: "Generate", presetCategory: "", gallerySources:[] }], activeIdx: 0 };
                }
                if (overlay && overlay.classList.contains("visible")) {
                    loadFromGraph();
                }
            }, 100);
            return result;
        };
    }
});
