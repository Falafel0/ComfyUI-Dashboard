import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "FSD.DynamicSwitches",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {

        // 1. ДИНАМИЧЕСКИЙ SWITCH (Много входов -> 1 выход)
        if (nodeData.name === "FSD_DynamicSwitchANY") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                // При создании прячем все входы кроме "input_0", и добавляем "input_1" пустым
                if (this.inputs) {
                    this.inputs = this.inputs.filter(slot => slot.name === "input_0");
                    this.addInput("input_1", "*");
                }
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);

                // 1 = Изменения на входе (INPUT)
                if (type === 1 && this.inputs) {
                    let lastInput = this.inputs[this.inputs.length - 1];

                    // Если к последнему свободному входу что-то подключили -> генерируем новый
                    if (lastInput && lastInput.link != null) {
                        const newIndex = this.inputs.length;
                        if (newIndex < 20) { // Лимит 20, как задано в Python
                            this.addInput(`input_${newIndex}`, "*");
                        }
                    }

                    // Если удалили провода -> убираем лишние "пустые" хвосты
                    while (this.inputs.length > 2) {
                        let last = this.inputs[this.inputs.length - 1];
                        let secondLast = this.inputs[this.inputs.length - 2];
                        if (last.link == null && secondLast.link == null) {
                            this.removeInput(this.inputs.length - 1);
                        } else {
                            break;
                        }
                    }
                }
            };
        }

        // 2. ДИНАМИЧЕСКИЙ ДИВЕРТЕР (1 Вход -> Много выходов)
        if (nodeData.name === "FSD_DynamicDiverterANY") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                // При создании оставляем только два выхода (out_0 и out_1)
                if (this.outputs) {
                    this.outputs = this.outputs.slice(0, 2);
                }
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);

                // 2 = Изменения на выходе (OUTPUT)
                if (type === 2 && this.outputs) {
                    let lastOutput = this.outputs[this.outputs.length - 1];

                    // Если из последнего выхода потянули провод -> создаем новый
                    if (lastOutput && lastOutput.links && lastOutput.links.length > 0) {
                        const newIndex = this.outputs.length;
                        if (newIndex < 20) {
                            this.addOutput(`out_${newIndex}`, "*");
                        }
                    }

                    // Очищаем пустые хвосты
                    while (this.outputs.length > 2) {
                        let last = this.outputs[this.outputs.length - 1];
                        let secondLast = this.outputs[this.outputs.length - 2];
                        if ((!last.links || last.links.length === 0) &&
                            (!secondLast.links || secondLast.links.length === 0)) {
                            this.removeOutput(this.outputs.length - 1);
                        } else {
                            break;
                        }
                    }
                }
            };
        }
    }
});