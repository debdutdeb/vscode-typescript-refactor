import * as vscode from "vscode";
import { verifyContext } from "./lib";
import { TypescriptResourceCompiler } from "./parser";

export async function convertClassToInterface() {
  if (!vscode.window.activeTextEditor) {
    return;
  }
  const { document, selection } = vscode.window.activeTextEditor;
  verifyContext(document);
  const { fileName } = document;
  const parser = new TypescriptResourceCompiler(await document.getText());
  const selectedClass = selection.isEmpty
    ? await vscode.window.showQuickPick(
        (
          await parser.getClassNames()
        ).map((name) => ({
          label: `$(symbol-class) ${name}`,
          kind: vscode.QuickPickItemKind.Default,
        })),
        {
          title: "Select class to convert",
        }
      )
    : document.getText(selection);
}
