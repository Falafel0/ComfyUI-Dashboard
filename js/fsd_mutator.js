
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// 1. MUTE & BYPASS MUTATOR LOGIC
api.addEventListener("fsd_mutate_state", (event) => {
    const data = event.detail;
    if (!app.graph) return;

    let changed = false;
    let nodes_to_mutate = new Set();

    if (data.group_name) {
        const group = app.graph._groups.find(g => g.title.trim() === data.group_name.trim());
        if (group) {
            group.recomputeInsideNodes();
            if (group._nodes) {
                for (const n of group._nodes) {
                    nodes_to_mutate.add(n);
                }
            }
        }
    }

    if (data.nodes && Array.isArray(data.nodes)) {
        for (const node_id of data.nodes) {
            const n = app.graph.getNodeById(Number(node_id)) || app.graph.getNodeById(String(node_id));
            if (n) nodes_to_mutate.add(n);
        }
    }

    for (const node of nodes_to_mutate) {
        let new_mode = data.mode;
        if (data.mode === 99) {
            new_mode = (node.mode === 4) ? 0 : 4;
        } else if (data.mode === 98) {
            new_mode = (node.mode === 2) ? 0 : 2;
        }
        if (node.mode !== new_mode) {
            node.mode = new_mode;
            changed = true;
        }
    }

    if (changed) {
        app.graph.setDirtyCanvas(true);
    }
});

// 2. DYNAMIC PINS & AUTO-EXPANDING NODES
app.registerExtension({
    name: "FSD.DynamicNodes",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {

        // Ноды, которые растягиваются АВТОМАТИЧЕСКИ при подключении провода
        const autoExpandingNodes =[
            "FSD_MathAddDynamic", "FSD_MathMultiplyDynamic",
            "FSD_StringJoinDynamic", "FSD_LogicANDDynamic", "FSD_LogicORDynamic",
            "FSD_UniversalPackDynamic"
        ];

        if (autoExpandingNodes.includes(nodeData.name)) {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                this.addInput("in_0", "*");
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
                if (type === LiteGraph.INPUT) {
                    for (let i = this.inputs.length - 1; i >= 0; i--) {
                        if (!this.inputs[i].link && this.inputs[i].name.startsWith("in_")) {
                            this.removeInput(i);
                        }
                    }
                    let count = 0;
                    for (let i = 0; i < this.inputs.length; i++) {
                        if (this.inputs[i].name.startsWith("in_")) {
                            this.inputs[i].name = "in_" + count;
                            count++;
                        }
                    }
                    this.addInput("in_" + count, "*");
                }
            };
        }

        // Ноды, куда добавление входов ИМЕЕТ СМЫСЛ (Ручное через Правый Клик)
        const manuallyExpandableNodes =[
            "FSD_MathAdd", "FSD_MathMultiply",
            "FSD_LogicAND", "FSD_LogicOR", "FSD_LogicXOR", "FSD_MultiBooleanLogic",
            "FSD_StringReplaceABC", "FSD_StringReplaceAdvancedABCDEF",
            "FSD_JoinNumbersToString", "FSD_SwitchByIndexANY",
            "FSD_StackPush", "FSD_PresetPack"
        ];

        // ДОБАВЛЯЕМ КОНТЕКСТНОЕ МЕНЮ ТОЛЬКО ТАМ, ГДЕ ОНО РАБОТАЕТ!
        if (autoExpandingNodes.includes(nodeData.name) || manuallyExpandableNodes.includes(nodeData.name)) {
            const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
            nodeType.prototype.getExtraMenuOptions = function (_, options) {
                if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);
                options.push({
                    content: "➕ Add Dynamic Input",
                    callback: () => {
                        const idx = this.inputs ? this.inputs.length : 0;
                        this.addInput("dyn_" + idx, "*");
                    }
                });
                options.push({
                    content: "➖ Remove Last Input",
                    callback: () => {
                        if (this.inputs && this.inputs.length > 0) {
                            this.removeInput(this.inputs.length - 1);
                        }
                    }
                });
            };
        }
    }
});
