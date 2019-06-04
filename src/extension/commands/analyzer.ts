import * as vs from "vscode";
import { openInBrowser } from "../../shared/vscode/utils";
import { Analyzer } from "../analysis/analyzer";
import { DiagnosticServerRequest } from "../lsp/custom_protocol";
import { lspClient } from "../lsp/setup";

export class AnalyzerCommands {
	constructor(context: vs.ExtensionContext, analyzer: Analyzer) {
		context.subscriptions.push(vs.commands.registerCommand("dart.openAnalyzerDiagnostics", async () => {
			const res = await analyzer.diagnosticGetServerPort();
			openInBrowser(`http://127.0.0.1:${res.port}/`);

			if (lspClient) {
				const diagServer = await lspClient.sendRequest(DiagnosticServerRequest.type, undefined);
				openInBrowser(`http://127.0.0.1:${diagServer.port}`);
			}
		}));
	}
}
