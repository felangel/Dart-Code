import * as vs from "vscode";
import { LanguageClient } from "vscode-languageclient";
import * as editors from "../editors";
import { showCode } from "../utils/vscode/editor";
import { SuperRequest } from "./custom_protocol";
import { lspClient } from "./setup";

export class LspGoToSuperCommand implements vs.Disposable {
	private disposables: vs.Disposable[] = [];

	constructor(private readonly analyzer: LanguageClient) {
		this.disposables.push(vs.commands.registerCommand("dart.goToSuper", this.goToSuper, this));
	}

	private async goToSuper(): Promise<void> {
		const editor = editors.getActiveDartEditor();
		if (!editor) {
			vs.window.showWarningMessage("No active Dart editor.");
			return;
		}

		const location = await this.analyzer.sendRequest(
			SuperRequest.type,
			{
				position: lspClient.code2ProtocolConverter.asPosition(editor.selection.start),
				textDocument: lspClient.code2ProtocolConverter.asVersionedTextDocumentIdentifier(editor.document),
			},
		);

		if (!location)
			return;

		const codeLocation = lspClient.protocol2CodeConverter.asLocation(location);
		const elementDocument = await vs.workspace.openTextDocument(codeLocation.uri);
		const elementEditor = await vs.window.showTextDocument(elementDocument);
		showCode(elementEditor, codeLocation.range, codeLocation.range, codeLocation.range);
	}

	public dispose(): any {
		this.disposables.forEach((d) => d.dispose());
	}
}
