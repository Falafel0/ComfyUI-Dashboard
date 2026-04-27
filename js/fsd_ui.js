import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.FSD.Nodes",
    async nodeCreated(node) {
        // ==========================================
        // 1. РАСКРАСКА НОД
        // ==========================================
        // Применяем стили ко всем нодам из вашего пака (FSD, Math, Logic, Stack и т.д.)
        if (node.comfyClass && (
            node.comfyClass.startsWith("FSD_") ||
            node.comfyClass.startsWith("Math") ||
            node.comfyClass.startsWith("Logic") ||
            node.comfyClass.startsWith("Stack") ||
            node.comfyClass.startsWith("Preset") ||
            node.comfyClass.startsWith("File")
        )) {
            // Базовый цвет (Стильный тёмно-серый)
            node.color = "#2b2b2b";
            node.bgcolor = "#1e1e1e";

            // Оранжевый для движка генерации
            if (node.comfyClass === "FSD_Generate") {
                node.color = "#f25b22";
            }
            // Зеленый для финала/сохранения
            else if (node.comfyClass === "FSD_SaveImage") {
                node.color = "#228b22";
            }
            // Модификаторы, Лоры, Контролнеты (Тёмно-синий)
            else if (node.comfyClass.startsWith("FSD_Patch") || node.comfyClass.includes("LoRA") || node.comfyClass.includes("ControlNet") || node.comfyClass.includes("Prompts")) {
                node.color = "#1e3a5f";
                node.bgcolor = "#152642";
            }
            // Роутеры и Переключатели (Бирюзовый)
            else if (node.comfyClass.includes("Switch") || node.comfyClass.includes("Bypass") || node.comfyClass.includes("Combine")) {
                node.color = "#005b66";
                node.bgcolor = "#00404c";
            }
            // Математика и Логика (Фиолетовый)
            else if (node.comfyClass.startsWith("Math") || node.comfyClass.startsWith("Logic")) {
                node.color = "#4a2c7a";
                node.bgcolor = "#331b5c";
            }
            // Мосты, Упаковщики и Извлечения (Бордовый)
            else if (node.comfyClass.includes("ToKSampler") || node.comfyClass.includes("Pack") || node.comfyClass.includes("Unpack") || node.comfyClass.includes("Update") || node.comfyClass.includes("Extract")) {
                node.color = "#7a2020";
                node.bgcolor = "#4a1010";
            }

            // Перекраска кабелей (шины) FSD_PIPE в золотой цвет
            if (node.inputs) {
                node.inputs.forEach(inp => { if (inp.type === "FSD_PIPE") inp.color_on = "#ffaa00"; });
            }
            if (node.outputs) {
                node.outputs.forEach(out => { if (out.type === "FSD_PIPE") out.color_on = "#ffaa00"; });
            }
        }

        // ==========================================
        // 2. ДИНАМИЧЕСКИЕ ВХОДЫ (КНОПКИ + / -)
        // ==========================================
        const dynamicNodes = [
            "FSD_MakeList",
            "FSD_TextConcat",
            "FSD_StringJoinDynamic",
            "FSD_PipeSetCustom",
            "FSD_GenericBatchCombine"
        ];

        if (dynamicNodes.includes(node.comfyClass)) {
            // Определяем, текстовая ли это нода или нода переменных
            const isText = node.comfyClass === "FSD_TextConcat" || node.comfyClass === "FSD_StringJoinDynamic";
            const isSet = node.comfyClass === "FSD_PipeSetCustom";

            // Кнопка ДОБАВИТЬ ВХОД
            node.addWidget("button", "+ Add Input", null, () => {
                const count = node.inputs ? node.inputs.length : 0;
                let prefix = "item_";
                if (isText) prefix = "text_";
                // Для SetCustom используем var_, пользователь может переименовать её потом ПКМ -> Rename Slot
                if (isSet) prefix = "var_";

                // Добавляем порт (текст принимает только строку, остальные — любой тип '*')
                node.addInput(`${prefix}${count}`, isText ? "STRING" : "*");
            });

            // Кнопка УДАЛИТЬ ВХОД
            node.addWidget("button", "- Remove Input", null, () => {
                // Определяем минимальное количество входов, которые нельзя удалять.
                // Для PipeSetCustom это 1 (вход pipe). Для текстовых объединений это 1 (вход separator). У остальных = 0.
                const minInputs = (isSet || isText) ? 1 : 0;

                if (node.inputs && node.inputs.length > minInputs) {
                    node.removeInput(node.inputs.length - 1);
                }
            });
        }
    }
});