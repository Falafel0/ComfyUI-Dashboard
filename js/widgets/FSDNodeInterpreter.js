
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { WidgetInterpreter } from "./WidgetInterpreter.js";
import { broadcastWidgetUpdate } from "../state.js";

/**
 * Универсальный интерпретатор для всех FSD-нод
 * Обрабатывает специфические виджеты FSD-нод с улучшенной логикой
 */
export class FSDNodeInterpreter extends WidgetInterpreter {
    constructor() {
        super();
        this.priority = 75; // Высокий приоритет для FSD-нод

        this.supportedNodeTypes = [
            'FSD_MathAddDynamic', 'FSD_MathMultiplyDynamic',
            'FSD_StringJoinDynamic', 'FSD_LogicANDDynamic',
            'FSD_LogicORDynamic', 'FSD_UniversalPackDynamic',

            'FSD_MathAdd', 'FSD_MathSubtract', 'FSD_MathMultiply', 'FSD_MathDivide',
            'FSD_MathModulo', 'FSD_MathPower', 'FSD_MathSquareRoot', 'FSD_MathAbsolute',
            'FSD_MathClamp', 'FSD_MathLerp', 'FSD_MathCounter', 'FSD_MathAccumulator',

            'FSD_FloatToIntAdvanced', 'FSD_IntToFloat', 'FSD_NumberToStringAdvanced',
            'FSD_StringToNumberAdvanced', 'FSD_CompareNumbers', 'FSD_BooleanToWidget',
            'FSD_StateFormatter',

            'FSD_MathExpressionEvaluate', 'FSD_TextLengthToNumber', 'FSD_NumberToPaddedString',
            'FSD_ExtractNumberFromString', 'FSD_MultiplyText', 'FSD_PercentageFormat',
            'FSD_TextToSeed', 'FSD_SplitResolutionString', 'FSD_InjectNumberIntoString',
            'FSD_JoinNumbersToString', 'FSD_TimeToString', 'FSD_StringOccurrenceCounter',

            'FSD_StringReplaceABC', 'FSD_StringReplaceAdvancedABCDEF',

            'FSD_ExpressionCondition', 'FSD_WidgetCondition', 'FSD_RegexCondition',
            'FSD_LogicAND', 'FSD_LogicOR', 'FSD_LogicNOT', 'FSD_LogicXOR',
            'FSD_CheckValueInRange', 'FSD_CompareStringsExact', 'FSD_LogicFlipFlop',

            'FSD_StackPush', 'FSD_StackPop', 'FSD_StackGetByIndex', 'FSD_StackLength',
            'FSD_StackClear', 'FSD_StackJoinToString',

            'FSD_FileSaveState', 'FSD_FileLoadState', 'FSD_FileAppendToList',
            'FSD_FileClearStateKey', 'FSD_FileListSavedKeys',
            'FSD_FileLoadStateDropdown', 'FSD_FileDeleteStateDropdown',

            'FSD_PresetPack', 'FSD_PresetUnpack', 'FSD_PresetSaveToFile',
            'FSD_PresetLoadFromFile', 'FSD_PresetDelete', 'FSD_PresetListGroups',
            'FSD_PresetListItemsInGroup', 'FSD_PresetMerge', 'FSD_PresetUpdateField',
            'FSD_PresetExtractSingleField', 'FSD_PresetLoadDropdown', 'FSD_PresetDeleteDropdown',

            'FSD_BooleanToggle', 'FSD_RandomBoolean', 'FSD_MultiBooleanLogic',
            'FSD_CompareANY', 'FSD_SignalSend', 'FSD_SignalReceive', 'FSD_ManualTriggerSeed',

            'FSD_LazySwitchANY', 'FSD_SwitchByIndexANY', 'FSD_LazyDiverterANY',
            'FSD_LazyGateANY', 'FSD_LazyPassIfTrue', 'FSD_LazyPassIfFalse',

            'FSD_DetectNodesState', 'FSD_DetectGroupState',
            'FSD_StateMutatorSettings', 'FSD_ApplyStateMutator', 'FSD_LogicAutoMutator',

            'FSD_DropdownCheckpoints', 'FSD_DropdownLoras', 'FSD_DropdownVAEs',
            'FSD_DropdownControlNets', 'FSD_DropdownSamplers', 'FSD_DropdownSchedulers',
            'FSD_DropdownMutatorAction', 'FSD_DropdownMutatorTarget',
            'FSD_DropdownCustomList', 'FSD_CustomListManager', 'FSD_StringSplitByIndex',

            'FSD_PackBasicPipe', 'FSD_UnpackBasicPipe', 'FSD_EditBasicPipe'
        ];
    }

    canHandle(w, node, options) {
        if (!node || !node.type) return false;

        const nodeType = node.type;

        const isFSDNode = nodeType.startsWith('FSD_') ||
                         this.supportedNodeTypes.includes(nodeType);

        if (!isFSDNode) return false;

        if (w.name === "execute" || w.name === "trigger" || w.name === "reset") {
            return true;
        }

        return true;
    }

    render(w, nodeId, widgetIndex, options = {}) {
        const node = app.graph?.getNodeById(nodeId);
        const nodeType = node?.type || '';

        if (w.name === "execute" || w.name === "trigger" || w.name === "manual_trigger") {
            return this.renderButton(w, nodeId, widgetIndex, options);
        }

        if (w.name === "reset") {
            return this.renderResetButton(w, nodeId, widgetIndex, options);
        }

        if (nodeType.includes('Dropdown') || nodeType.includes('List')) {
            return this.renderDropdown(w, nodeId, widgetIndex, options);
        }

        if (typeof w.value === 'boolean' || w.type === 'toggle' || w.type === 'boolean') {
            return this.renderToggle(w, nodeId, widgetIndex, options);
        }

        if (typeof w.value === 'number' || w.type === 'number' || w.type === 'slider' || w.type === 'int' || w.type === 'float') {
            return this.renderNumber(w, nodeId, widgetIndex, options);
        }

        if (typeof w.value === 'string' || w.type === 'text' || w.type === 'string' || w.type === 'customtext') {
            if (w.options?.multiline) {
                return this.renderText(w, nodeId, widgetIndex, options);
            }
            return this.renderComboOrText(w, nodeId, widgetIndex, options);
        }

        if (w.type === 'combo' || w.type === 'combobox' || (w.options && Array.isArray(w.options.values))) {
            return this.renderCombo(w, nodeId, widgetIndex, options);
        }

        return this.renderDefault(w, nodeId, widgetIndex, options);
    }

    renderButton(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options) || "Execute";

        const btn = document.createElement("button");
        btn.className = "a11-btn a11-btn-primary";
        btn.innerText = displayName;
        btn.style.width = "100%";
        btn.style.padding = "8px 12px";

        btn.onclick = () => {
            if (w.callback) {
                w.callback(w.value);
            }
            const node = app.graph?.getNodeById(nodeId);
            if (node && node.onExecute) {
                node.onExecute();
            }
            broadcastWidgetUpdate(nodeId, widgetIndex, Date.now(), 'ui');
        };

        wrapper.appendChild(btn);
        this.applyStyles(wrapper, null, [btn], options);

        return wrapper;
    }

    renderResetButton(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);

        const row = document.createElement("div");
        row.style.cssText = "display:flex; gap:5px; align-items:center;";

        const btn = document.createElement("button");
        btn.className = "a11-btn";
        btn.innerText = "🔄 Reset";
        btn.title = "Reset counter/accumulator";

        btn.onclick = () => {
            w.value = true;
            if (w.callback) w.callback(true);
            this.syncNode(nodeId, widgetIndex, true);

            setTimeout(() => {
                w.value = false;
                if (w.callback) w.callback(false);
                this.syncNode(nodeId, widgetIndex, false);
            }, 100);
        };

        row.appendChild(btn);
        wrapper.appendChild(row);
        this.applyStyles(wrapper, null, [btn], options);

        return wrapper;
    }

    renderDropdown(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        const sel = document.createElement("select");
        sel.className = "a11-select";
        sel.style.width = "100%";

        const populate = (filter = "") => {
            sel.innerHTML = "";
            const lowerFilter = filter.toLowerCase();

            if (w.options?.values) {
                w.options.values.forEach(v => {
                    if (!filter || v.toLowerCase().includes(lowerFilter) || v === w.value) {
                        const opt = document.createElement("option");
                        opt.value = v;
                        opt.innerText = v;
                        if (v === w.value) opt.selected = true;
                        sel.appendChild(opt);
                    }
                });
            }
        };

        populate();

        sel.onchange = (e) => {
            w.value = e.target.value;
            if (w.callback) w.callback(w.value);
            this.syncNode(nodeId, widgetIndex, w.value);
        };

        this.setupLiveSync(w, nodeId, sel, (newVal) => {
            if (sel.value !== newVal) sel.value = newVal;
        });

        if (!options.hideFilter && w.options?.values?.length > 5) {
            const search = document.createElement("input");
            search.type = "text";
            search.placeholder = "🔍 Filter...";
            search.className = "a11-input";
            search.style.marginBottom = "2px";

            search.oninput = (e) => populate(e.target.value);

            wrapper.appendChild(search);
        }

        wrapper.appendChild(sel);
        this.applyStyles(wrapper, lbl, [sel], options);

        return wrapper;
    }

    renderToggle(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        const row = document.createElement("div");
        row.className = "a11-switch-row";

        const label = document.createElement("label");
        label.className = "a11-switch";

        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = !!w.value;

        const sliderSpan = document.createElement("span");
        sliderSpan.className = "a11-switch-slider";

        label.appendChild(chk);
        label.appendChild(sliderSpan);

        let text = null;
        if (!options.hideLabel) {
            text = document.createElement("span");
            text.className = "a11-switch-label";
            text.innerText = displayName;
            row.appendChild(text);
        }

        chk.onchange = (e) => {
            w.value = e.target.checked;
            if (w.callback) w.callback(w.value);
            this.syncNode(nodeId, widgetIndex, w.value);
        };

        this.setupLiveSync(w, nodeId, chk, (newVal) => {
            chk.checked = !!newVal;
        });

        row.prepend(label);
        wrapper.appendChild(row);
        this.applyStyles(wrapper, text, [chk], options);

        return wrapper;
    }

    renderNumber(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        let min = options.min !== undefined && options.min !== "" ? Number(options.min) : w.options?.min;
        let max = options.max !== undefined && options.max !== "" ? Number(options.max) : w.options?.max;
        let step = options.step !== undefined && options.step !== "" ? Number(options.step) : w.options?.step;
        let val = Number(w.value);

        const name = w.name.toLowerCase();
        if (name.includes('index') || name.includes('position')) {
            if (min === undefined) min = 0;
            if (step === undefined) step = 1;
        }
        if (name.includes('count') || name.includes('length')) {
            if (min === undefined) min = 0;
            if (max === undefined) max = 1000;
            if (step === undefined) step = 1;
        }
        if (name.includes('padding') || name.includes('zeros')) {
            if (min === undefined) min = 0;
            if (max === undefined) max = 20;
            if (step === undefined) step = 1;
        }
        if (name.includes('decimals') || name.includes('precision')) {
            if (min === undefined) min = 0;
            if (max === undefined) max = 10;
            if (step === undefined) step = 1;
        }

        if (max === undefined) max = val > 100 ? 1024 : 100;
        if (min === undefined) min = 0;
        if (step === undefined) step = Number.isInteger(val) ? 1 : 0.01;

        const row = document.createElement("div");
        row.className = "a11-slider-row";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "a11-slider-input";
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = val;

        const num = document.createElement("input");
        num.type = "number";
        num.className = "a11-input a11-num-input";
        num.min = min;
        num.max = max;
        num.step = step;
        num.value = val;

        const validateAndSync = (rawValue) => {
            let v = parseFloat(rawValue);
            if (isNaN(v)) v = min;
            if (v < min) v = min;
            if (v > max) v = max;
            w.value = v;
            if (w.callback) w.callback(v);
            this.syncNode(nodeId, widgetIndex, v);
        };

        slider.oninput = (e) => validateAndSync(e.target.value);
        num.onchange = (e) => validateAndSync(e.target.value);

        this.setupLiveSync(w, nodeId, num, (newVal) => {
            slider.value = newVal;
            num.value = newVal;
        });

        if (options.hideSlider) slider.style.display = "none";
        if (options.hideNumber) num.style.display = "none";

        row.appendChild(slider);
        row.appendChild(num);
        wrapper.appendChild(row);
        this.applyStyles(wrapper, lbl, [slider, num], options);

        return wrapper;
    }

    renderText(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);

        if (!options.customHeight) {
            wrapper.classList.add("gw-widget-wrapper--grows");
        }
        wrapper.classList.add("is-text-widget");

        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        const txt = document.createElement("textarea");
        txt.className = "a11-textarea";
        txt.value = w.value || "";

        if (w.options?.multiline) {
            txt.rows = w.options.multiline === true ? 4 : w.options.multiline;
        }

        txt.oninput = (e) => {
            w.value = e.target.value;
            if (w.callback) w.callback(w.value);
            this.syncNode(nodeId, widgetIndex, w.value);
        };

        this.setupLiveSync(w, nodeId, txt, (newVal) => {
            if (txt.value !== newVal) txt.value = newVal;
        });

        wrapper.appendChild(txt);
        this.applyStyles(wrapper, lbl, [txt], options);

        return wrapper;
    }

    renderCombo(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        const sel = document.createElement("select");
        sel.className = "a11-select";
        sel.style.width = "100%";

        const populate = (filter = "") => {
            sel.innerHTML = "";
            const lowerFilter = filter.toLowerCase();

            if (w.options?.values) {
                w.options.values.forEach(v => {
                    if (!filter || v.toLowerCase().includes(lowerFilter) || v === w.value) {
                        const opt = document.createElement("option");
                        opt.value = v;
                        opt.innerText = v;
                        if (v === w.value) opt.selected = true;
                        sel.appendChild(opt);
                    }
                });
            }
        };

        populate();

        sel.onchange = (e) => {
            w.value = e.target.value;
            if (w.callback) w.callback(w.value);
            this.syncNode(nodeId, widgetIndex, w.value);
        };

        this.setupLiveSync(w, nodeId, sel, (newVal) => {
            if (sel.value !== newVal) sel.value = newVal;
        });

        if (!options.hideFilter && w.options?.values?.length > 10 && !options.readOnly) {
            const search = document.createElement("input");
            search.type = "text";
            search.placeholder = "🔍 Filter...";
            search.className = "a11-input";
            search.style.marginBottom = "2px";

            search.oninput = (e) => populate(e.target.value);

            wrapper.appendChild(search);
        }

        wrapper.appendChild(sel);
        this.applyStyles(wrapper, lbl, [sel], options);

        return wrapper;
    }

    renderComboOrText(w, nodeId, widgetIndex, options = {}) {
        if (w.options && Array.isArray(w.options.values)) {
            return this.renderCombo(w, nodeId, widgetIndex, options);
        }

        return this.renderText(w, nodeId, widgetIndex, options);
    }

    renderDefault(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        const inp = document.createElement("input");
        inp.className = "a11-input";
        inp.value = w.value !== undefined ? w.value : "";

        inp.onchange = (e) => {
            w.value = e.target.value;
            if (w.callback) w.callback(w.value);
            this.syncNode(nodeId, widgetIndex, w.value);
        };

        this.setupLiveSync(w, nodeId, inp, (newVal) => {
            if (inp.value !== newVal) inp.value = newVal;
        });

        wrapper.appendChild(inp);
        this.applyStyles(wrapper, lbl, [inp], options);

        return wrapper;
    }

    setupLiveSync(w, nodeId, domElement, updateFn) {
        if (!w || !domElement) return;
        let lastVal = w.value;
        const loop = () => {
            if (!document.body.contains(domElement)) return;
            if (w.value !== lastVal) {
                lastVal = w.value;
                updateFn(lastVal);
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    syncNode(nodeId, widgetIndex, value) {
        if (!app.graph) return;

        const liveNode = app.graph.getNodeById(nodeId);
        if (liveNode && liveNode.widgets) {
            let targetWidget = liveNode.widgets[widgetIndex];
            if (!targetWidget || targetWidget.name !== w.name) {
                targetWidget = liveNode.widgets.find(wid => wid.name === w.name);
            }
            if (targetWidget) {
                targetWidget.value = value;
                if (targetWidget.callback) targetWidget.callback(value);
            }
        }

        if (app.canvas && app.canvas.parentNode) {
            app.graph.setDirtyCanvas(true, true);
        }

        broadcastWidgetUpdate(nodeId, widgetIndex, value, 'ui');
    }
}

export default FSDNodeInterpreter;
