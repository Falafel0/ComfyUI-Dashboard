import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { WidgetInterpreter } from "./WidgetInterpreter.js";

/**
 * Interpreter for FSD/9 Workflow Control nodes — special UI rendering.
 * Handles buttons, toggles, sliders, counters, gates with live feedback.
 */
export class WorkflowControlInterpreter extends WidgetInterpreter {
    constructor() {
        super();
        this.priority = 90;

        this.supportedNodeTypes = [
            'FSD_ButtonTrigger',
            'FSD_ToggleSwitch',
            'FSD_ValueSlider',
            'FSD_ModeSelector',
            'FSD_TriggerGate',
            'FSD_ConditionalRouter',
            'FSD_ValueReader',
            'FSD_ValueWriter',
            'FSD_BatchSeed',
            'FSD_PipeSnapshot',
            'FSD_PipeRestore',
            'FSD_PipeCounter',
            'FSD_SeedRandomizer',
        ];
    }

    canHandle(w, node, options) {
        // Match any widget on a workflow control node
        return this.supportedNodeTypes.some(nt =>
            node.type && node.type === nt
        );
    }

    render(w, nodeId, widgetIndex, options = {}) {
        const nodeType = app.graph.getNodeById(nodeId)?.type || "";
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        switch (nodeType) {
            case 'FSD_ButtonTrigger':    return this._renderButton(w, nodeId, widgetIndex, options, wrapper);
            case 'FSD_ToggleSwitch':     return this._renderToggle(w, nodeId, widgetIndex, options, wrapper);
            case 'FSD_ValueSlider':      return this._renderSlider(w, nodeId, widgetIndex, options, wrapper);
            case 'FSD_ModeSelector':     return this._renderModeSelect(w, nodeId, widgetIndex, options, wrapper);
            case 'FSD_TriggerGate':      return this._renderGate(w, nodeId, widgetIndex, options, wrapper);
            case 'FSD_ConditionalRouter':return this._renderRouter(w, nodeId, widgetIndex, options, wrapper);
            case 'FSD_PipeCounter':      return this._renderCounter(w, nodeId, widgetIndex, options, wrapper);
            case 'FSD_SeedRandomizer':   return this._renderSeed(w, nodeId, widgetIndex, options, wrapper);
            case 'FSD_BatchSeed':        return this._renderBatchSeed(w, nodeId, widgetIndex, options, wrapper);
            case 'FSD_PipeSnapshot':
            case 'FSD_PipeRestore':      return this._renderSnapshot(w, nodeId, widgetIndex, options, wrapper, nodeType);
            default:                     return this._renderDefault(w, nodeId, widgetIndex, options, wrapper);
        }
    }

    // ─── Button Trigger ───
    _renderButton(w, nodeId, widgetIndex, options, wrapper) {
        wrapper.classList.add("gw-widget--action");
        const node = app.graph.getNodeById(nodeId);
        const labelWidget = node?.widgets?.find(w => w.name === "label");

        const btn = document.createElement("button");
        btn.className = "a11-wf-btn";
        btn.innerText = labelWidget?.value || "▶ Trigger";
        btn.title = "Click to fire trigger — executes workflow";
        btn.style.cssText = `
            width: 100%; padding: 10px 16px; border: none; border-radius: 8px;
            background: var(--a11-accent, #6366f1); color: #fff; font-weight: 600;
            font-size: 14px; cursor: pointer; transition: all 0.15s;
            font-family: inherit;
        `;
        btn.addEventListener("mouseenter", () => btn.style.filter = "brightness(1.15)");
        btn.addEventListener("mouseleave", () => btn.style.filter = "");
        btn.addEventListener("mousedown", () => btn.style.transform = "scale(0.97)");
        btn.addEventListener("mouseup", () => btn.style.transform = "");

        btn.addEventListener("click", () => {
            // Set trigger to true — it auto-resets via fsd_mutate_state
            if (w.callback) w.callback(true);
            api.queuePrompt(0, 1);
        });

        wrapper.appendChild(btn);
        return wrapper;
    }

    // ─── Toggle Switch ───
    _renderToggle(w, nodeId, widgetIndex, options, wrapper) {
        wrapper.classList.add("gw-widget--toggle");
        const node = app.graph.getNodeById(nodeId);
        const stateW = node?.widgets?.find(w => w.name === "state");
        const labelOnW = node?.widgets?.find(w => w.name === "label_on");
        const labelOffW = node?.widgets?.find(w => w.name === "label_off");
        const isOn = stateW?.value === true;

        const row = document.createElement("div");
        row.style.cssText = "display:flex; align-items:center; gap:10px;";

        const toggle = document.createElement("div");
        toggle.className = "a11-wf-toggle";
        toggle.style.cssText = `
            width: 44px; height: 24px; border-radius: 12px; cursor: pointer;
            background: ${isOn ? 'var(--a11-accent, #6366f1)' : 'var(--a11-border, #555)'};
            transition: background 0.2s; position: relative; flex-shrink: 0;
        `;

        const knob = document.createElement("div");
        knob.style.cssText = `
            width: 20px; height: 20px; border-radius: 50%; background: #fff;
            position: absolute; top: 2px; left: ${isOn ? '22px' : '2px'};
            transition: left 0.2s;
        `;
        toggle.appendChild(knob);

        const label = document.createElement("span");
        label.style.cssText = "font-size:13px; color:var(--a11-text); flex:1;";
        label.innerText = isOn ? (labelOnW?.value || "ENABLED") : (labelOffW?.value || "DISABLED");

        toggle.addEventListener("click", () => {
            const newVal = !(stateW?.value === true);
            if (stateW) {
                stateW.value = newVal;
                stateW.callback?.(newVal);
            }
            toggle.style.background = newVal ? 'var(--a11-accent, #6366f1)' : 'var(--a11-border, #555)';
            knob.style.left = newVal ? '22px' : '2px';
            label.innerText = newVal ? (labelOnW?.value || "ENABLED") : (labelOffW?.value || "DISABLED");
            api.queuePrompt(0, 1);
        });

        row.appendChild(toggle);
        row.appendChild(label);
        wrapper.appendChild(row);
        return wrapper;
    }

    // ─── Value Slider ───
    _renderSlider(w, nodeId, widgetIndex, options, wrapper) {
        wrapper.classList.add("gw-widget--slider");
        const node = app.graph.getNodeById(nodeId);
        const valW = node?.widgets?.find(w => w.name === "value");
        const minW = node?.widgets?.find(w => w.name === "min_val");
        const maxW = node?.widgets?.find(w => w.name === "max_val");
        const stepW = node?.widgets?.find(w => w.name === "step");
        const nameW = node?.widgets?.find(w => w.name === "field_name");

        const min = parseFloat(minW?.value) || 0;
        const max = parseFloat(maxW?.value) || 1;
        const step = parseFloat(stepW?.value) || 0.01;
        const cur = parseFloat(valW?.value) ?? 0.5;

        // Label
        if (nameW?.value) {
            const lbl = document.createElement("div");
            lbl.style.cssText = "font-size:11px; color:var(--a11-text-muted); margin-bottom:4px;";
            lbl.innerText = nameW.value;
            wrapper.appendChild(lbl);
        }

        const row = document.createElement("div");
        row.style.cssText = "display:flex; align-items:center; gap:8px;";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = min; slider.max = max; slider.step = step; slider.value = cur;
        slider.style.cssText = "flex:1; accent-color: var(--a11-accent, #6366f1);";

        const valDisplay = document.createElement("span");
        valDisplay.style.cssText = "font-size:12px; color:var(--a11-text); min-width:40px; text-align:right; font-variant-numeric: tabular-nums;";
        valDisplay.innerText = parseFloat(cur).toFixed(step < 1 ? 2 : 0);

        slider.addEventListener("input", () => {
            const v = parseFloat(slider.value);
            if (valW) {
                valW.value = v;
                valW.callback?.(v);
            }
            valDisplay.innerText = parseFloat(v).toFixed(step < 1 ? 2 : 0);
        });

        slider.addEventListener("change", () => {
            api.queuePrompt(0, 1);
        });

        row.appendChild(slider);
        row.appendChild(valDisplay);
        wrapper.appendChild(row);
        return wrapper;
    }

    // ─── Mode Selector ───
    _renderModeSelect(w, nodeId, widgetIndex, options, wrapper) {
        wrapper.classList.add("gw-widget--select");
        const node = app.graph.getNodeById(nodeId);
        const modeW = node?.widgets?.find(w => w.name === "mode");
        const customW = node?.widgets?.find(w => w.name === "custom_prompt");

        const container = document.createElement("div");
        container.style.cssText = "display:flex; flex-direction:column; gap:4px;";

        const select = document.createElement("select");
        select.className = "a11-select";
        select.style.cssText = "width:100%;";
        const modes = ["Style Transfer", "Upscale", "Inpaint", "Refine", "Variation", "Custom"];
        modes.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m; opt.innerText = m;
            if (modeW?.value === m) opt.selected = true;
            select.appendChild(opt);
        });

        select.addEventListener("change", () => {
            if (modeW) { modeW.value = select.value; modeW.callback?.(select.value); }
            api.queuePrompt(0, 1);
        });

        container.appendChild(select);

        if (modeW?.value === "Custom" && customW) {
            const input = document.createElement("input");
            input.type = "text";
            input.className = "a11-input";
            input.value = customW.value || "";
            input.placeholder = "Custom prompt...";
            input.style.cssText = "width:100%; margin-top:4px;";
            input.addEventListener("change", () => {
                customW.value = input.value;
                customW.callback?.(input.value);
            });
            container.appendChild(input);
        }

        wrapper.appendChild(container);
        return wrapper;
    }

    // ─── Trigger Gate ───
    _renderGate(w, nodeId, widgetIndex, options, wrapper) {
        wrapper.classList.add("gw-widget--gate");
        const node = app.graph.getNodeById(nodeId);
        const gateW = node?.widgets?.find(w => w.name === "gate_open");
        const modeW = node?.widgets?.find(w => w.name === "open_mode");
        const isOpen = gateW?.value === true;

        const indicator = document.createElement("div");
        indicator.style.cssText = `
            display: flex; align-items: center; gap: 8px; padding: 8px;
            border-radius: 6px; font-size: 13px;
            background: ${isOpen ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'};
            color: ${isOpen ? '#22c55e' : '#ef4444'};
        `;
        indicator.innerHTML = `
            <span style="font-size:18px;">${isOpen ? '🟢' : '🔴'}</span>
            <span style="flex:1;">${isOpen ? 'GATE OPEN' : 'GATE CLOSED'}</span>
            <span style="font-size:11px; opacity:0.7;">${modeW?.value || 'Open=True'}</span>
        `;

        indicator.addEventListener("click", () => {
            if (gateW) {
                gateW.value = !gateW.value;
                gateW.callback?.(gateW.value);
            }
            api.queuePrompt(0, 1);
        });
        indicator.style.cursor = "pointer";

        wrapper.appendChild(indicator);
        return wrapper;
    }

    // ─── Conditional Router ───
    _renderRouter(w, nodeId, widgetIndex, options, wrapper) {
        wrapper.classList.add("gw-widget--router");
        const node = app.graph.getNodeById(nodeId);
        const condW = node?.widgets?.find(w => w.name === "condition");
        const threshW = node?.widgets?.find(w => w.name === "threshold");
        const ruleW = node?.widgets?.find(w => w.name === "rule");
        const cond = parseFloat(condW?.value) ?? 0.5;
        const thresh = parseFloat(threshW?.value) ?? 0.5;
        const match = ruleW?.value?.includes(">=") ? cond >= thresh : cond < thresh;

        const bar = document.createElement("div");
        bar.style.cssText = "display:flex; gap:4px; align-items:center; font-size:11px;";
        bar.innerHTML = `
            <span>cond: ${cond.toFixed(2)}</span>
            <span style="color:var(--a11-text-muted);">${ruleW?.value?.includes(">=") ? '≥' : '<'}</span>
            <span>${thresh.toFixed(2)}</span>
            <span style="margin-left:auto; color:${match ? '#22c55e' : '#ef4444'}; font-weight:600;">→ ${match ? 'A' : 'B'}</span>
        `;

        wrapper.appendChild(bar);
        return wrapper;
    }

    // ─── Counter ───
    _renderCounter(w, nodeId, widgetIndex, options, wrapper) {
        wrapper.classList.add("gw-widget--counter");
        const node = app.graph.getNodeById(nodeId);
        const resetW = node?.widgets?.find(w => w.name === "reset");

        const display = document.createElement("div");
        display.style.cssText = `
            text-align: center; font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums;
            color: var(--a11-accent, #6366f1); padding: 4px 0;
        `;
        display.innerText = "0";

        const resetBtn = document.createElement("button");
        resetBtn.className = "a11-btn";
        resetBtn.innerText = "↺ Reset";
        resetBtn.style.cssText = "width:100%; margin-top:4px;";
        resetBtn.addEventListener("click", () => {
            if (resetW) { resetW.value = true; resetW.callback?.(true); }
            display.innerText = "0";
            api.queuePrompt(0, 1);
        });

        wrapper.appendChild(display);
        wrapper.appendChild(resetBtn);
        return wrapper;
    }

    // ─── Seed Randomizer ───
    _renderSeed(w, nodeId, widgetIndex, options, wrapper) {
        wrapper.classList.add("gw-widget--seed");
        const node = app.graph.getNodeById(nodeId);
        const modeW = node?.widgets?.find(w => w.name === "mode");

        const display = document.createElement("div");
        display.style.cssText = `
            text-align: center; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums;
            color: var(--a11-accent, #6366f1); padding: 4px 0; font-family: monospace;
            overflow: hidden; text-overflow: ellipsis;
        `;
        display.innerText = "—";
        display.title = "Seed will be generated on execution";

        const modeLabel = document.createElement("div");
        modeLabel.style.cssText = "font-size:10px; color:var(--a11-text-muted); text-align:center;";
        modeLabel.innerText = modeW?.value || "Random";

        const btn = document.createElement("button");
        btn.className = "a11-btn action-btn";
        btn.innerText = "🎲 Randomize";
        btn.style.cssText = "width:100%; margin-top:4px;";
        btn.addEventListener("click", () => {
            display.innerText = "⏳";
            api.queuePrompt(0, 1);
        });

        wrapper.appendChild(display);
        wrapper.appendChild(modeLabel);
        wrapper.appendChild(btn);
        return wrapper;
    }

    // ─── Batch Seed ───
    _renderBatchSeed(w, nodeId, widgetIndex, options, wrapper) {
        wrapper.classList.add("gw-widget--batch");
        const node = app.graph.getNodeById(nodeId);
        const baseW = node?.widgets?.find(w => w.name === "base_seed");
        const countW = node?.widgets?.find(w => w.name === "count");
        const modeW = node?.widgets?.find(w => w.name === "mode");

        const info = document.createElement("div");
        info.style.cssText = "font-size:11px; color:var(--a11-text-muted);";
        info.innerText = `${countW?.value || '?'} seeds · ${modeW?.value || 'Increment'} · base=${baseW?.value ?? 0}`;

        wrapper.appendChild(info);
        return wrapper;
    }

    // ─── Snapshot ───
    _renderSnapshot(w, nodeId, widgetIndex, options, wrapper, nodeType) {
        wrapper.classList.add("gw-widget--snapshot");
        const node = app.graph.getNodeById(nodeId);
        const nameW = node?.widgets?.find(w => w.name === "snapshot_name" || w.name === "fields");

        const icon = nodeType === 'FSD_PipeSnapshot' ? '💾' : '📂';
        const action = nodeType === 'FSD_PipeSnapshot' ? 'Save' : 'Restore';

        const info = document.createElement("div");
        info.style.cssText = "font-size:12px; color:var(--a11-text); text-align:center;";
        info.innerText = `${icon} ${action}: ${nameW?.value || '—'}`;
        info.title = "Snapshot for A/B comparison";

        wrapper.appendChild(info);
        return wrapper;
    }

    // ─── Default (ValueReader, ValueWriter etc.) ───
    _renderDefault(w, nodeId, widgetIndex, options, wrapper) {
        const node = app.graph.getNodeById(nodeId);
        const fieldW = node?.widgets?.find(w => w.name === "field_name");

        const info = document.createElement("div");
        info.style.cssText = "font-size:11px; color:var(--a11-text-muted); padding:4px;";
        info.innerText = `📌 ${fieldW?.value || '?'}`;

        wrapper.appendChild(info);
        return wrapper;
    }
}

export default WorkflowControlInterpreter;
