import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "FSD.AdvancedNodeBypasser",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // MATCH THE PYTHON CLASS NAME
        if (nodeData.name === "FSD_AdvancedNodeBypasser") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                // Track nodes disabled by THIS specific bypasser instance
                this._fsd_bypassed_nodes = new Set();

                setTimeout(() => {
                    const wState = this.widgets?.find(w => w.name === "state");
                    const wAction = this.widgets?.find(w => w.name === "action");
                    const wTargetType = this.widgets?.find(w => w.name === "target_type");
                    const wMatchType = this.widgets?.find(w => w.name === "match_type");
                    const wTarget = this.widgets?.find(w => w.name === "target");

                    if (!wState || !wAction || !wTargetType || !wMatchType || !wTarget) return;

                    const applyBypass = () => {
                        const isActive = wState.value;
                        const actionMode = wAction.value;
                        const targetType = wTargetType.value;
                        const matchType = wMatchType.value;
                        const targetText = wTarget.value;

                        // 0 = Active, 2 = Mute (Red), 4 = Bypass (Purple)
                        const activeCode = actionMode === "Mute" ? 2 : 4;

                        const matchString = (str, rawTarget) => {
                            if (!str || !rawTarget) return false;
                            if (matchType === "Regex") {
                                try { return new RegExp(rawTarget, "i").test(str); }
                                catch (e) { return false; }
                            }
                            const patterns = rawTarget.split(",").map(p => p.trim()).filter(p => p !== "");
                            for (const pattern of patterns) {
                                const strLower = str.toLowerCase();
                                const patLower = pattern.toLowerCase();
                                if (matchType === "Exact" && strLower === patLower) return true;
                                if (matchType === "Contains" && strLower.includes(patLower)) return true;
                            }
                            return false;
                        };

                        let targetNodes = new Set();

                        if (targetType === "Node IDs") {
                            const ids = targetText.split(",").map(id => id.trim());
                            app.graph._nodes.forEach(n => {
                                if (ids.includes(n.id.toString())) targetNodes.add(n);
                            });
                        }
                        else if (targetType === "Group Name") {
                            app.graph._groups.forEach(g => {
                                if (matchString(g.title, targetText)) {
                                    g.recomputeInsideNodes();
                                    g._nodes.forEach(n => targetNodes.add(n));
                                }
                            });
                        }
                        else if (targetType === "Node Title") {
                            app.graph._nodes.forEach(n => {
                                if (matchString(n.title || n.type, targetText)) targetNodes.add(n);
                            });
                        }
                        else if (targetType === "Node Type") {
                            app.graph._nodes.forEach(n => {
                                if (matchString(n.type, targetText)) targetNodes.add(n);
                            });
                        }

                        // 1. Reset nodes previously disabled by THIS bypasser
                        this._fsd_bypassed_nodes.forEach(node => {
                            if (app.graph._nodes.includes(node)) {
                                node.mode = 0;
                            }
                        });
                        this._fsd_bypassed_nodes.clear();

                        // 2. Apply Bypass/Mute if checkbox is checked
                        if (isActive) {
                            targetNodes.forEach(node => {
                                if (node.id !== this.id) {
                                    node.mode = activeCode;
                                    this._fsd_bypassed_nodes.add(node);
                                }
                            });
                        }
                        app.graph.setDirtyCanvas(true, true);
                    };

                    // Attach logic to widget callbacks
                    [wState, wAction, wTargetType, wMatchType, wTarget].forEach(widget => {
                        const origCb = widget.callback;
                        widget.callback = function () {
                            if (origCb) origCb.apply(this, arguments);
                            applyBypass();
                        };
                    });

                }, 100);

                return r;
            };
        }
    }
});