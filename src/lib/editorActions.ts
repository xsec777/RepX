// 把「右键转换」挂到 Monaco 上
import type { editor as MonacoEditor } from "monaco-editor";
import { CONVERT_ACTIONS } from "./codec";
import { copyText } from "./utils";

export type NotifyFn = (text: string, tone?: "ok" | "error") => void;

interface RegisterOptions {
  readOnly: boolean;
  notify?: NotifyFn;
}

// 右键菜单分组名，排在 Monaco 自带项后面
const GROUP_ID = "9_repx_convert";

export function registerConvertActions(editor: MonacoEditor.IStandaloneCodeEditor, options: RegisterOptions): void {
  const { readOnly, notify } = options;

  CONVERT_ACTIONS.forEach((action, index) => {
    editor.addAction({
      id: `fp.convert.${action.id}`,
      label: readOnly ? `${action.label}（复制）` : action.label,
      // 没有选中内容时这些项不出现，免得误以为是全文转换
      precondition: "editorHasSelection",
      contextMenuGroupId: GROUP_ID,
      contextMenuOrder: (index + 1) / 10,
      run: (instance) => {
        const selection = instance.getSelection();
        const model = instance.getModel();
        if (!selection || !model || selection.isEmpty()) return;

        const source = model.getValueInRange(selection);
        let result: string;
        try {
          result = action.run(source);
        } catch (err) {
          notify?.(`${action.label}失败：${err instanceof Error ? err.message : String(err)}`, "error");
          return;
        }
        if (result === source) {
          notify?.("内容和原来一样，没改动", "ok");
          return;
        }

        if (readOnly) {
          copyText(result)
            .then(() => notify?.(`已${action.label}并复制`))
            .catch(() => notify?.("复制失败", "error"));
          return;
        }

        instance.executeEdits("repx-convert", [
          { range: selection, text: result, forceMoveMarkers: true },
        ]);
        instance.pushUndoStop();
        instance.focus();
      },
    });
  });
}
