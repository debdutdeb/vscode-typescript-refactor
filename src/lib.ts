import * as vscode from "vscode";

export function verifyContext(
  document?: vscode.TextDocument
): asserts document is vscode.TextDocument {
  const error = (m: string) => {
    vscode.window.showErrorMessage(m);
    throw Error(m);
  };
  if (!document) {
    error("No document found");
  } else if (document.languageId !== "typescript") {
    error("Not a TypeScript file");
  }
}
