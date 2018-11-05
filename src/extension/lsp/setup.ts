import * as path from "path";
import * as stream from "stream";
import * as vs from "vscode";
import { LanguageClient, LanguageClientOptions, StreamInfo } from "vscode-languageclient";
import * as WebSocket from "ws";
import { dartVMPath } from "../../shared/constants";
import { Sdks } from "../../shared/interfaces";
import { config } from "../config";
import { safeSpawn } from "../utils/processes";

let lspClient: LanguageClient;

export function initLSP(context: vs.ExtensionContext, sdks: Sdks) {
	vs.window.showInformationMessage("LSP preview is enabled!");
	const client = startLsp(context, sdks);
	return {
		dispose: async (): Promise<void> => (await client).dispose(),
	};
}

async function startLsp(context: vs.ExtensionContext, sdks: Sdks): Promise<vs.Disposable> {
	const lspInspector = vs.extensions.getExtension("octref.lsp-inspector-webview");

	// Open the LSP Inspector if we have it installed.
	if (lspInspector) {
		await lspInspector.activate();
		await vs.commands.executeCommand("lspInspector.start");
	}

	// Create a web socket to the inspector to pipe the logs over.
	const websocketOutputChannel = lspInspector && await openLSPInspectorSocket();

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: "file", language: "dart" }],
		outputChannel: websocketOutputChannel,
		synchronize: {
			// Keep this in sync with the isAnalyzable function.
			fileEvents: [
				vs.workspace.createFileSystemWatcher("**/*.dart"),
				vs.workspace.createFileSystemWatcher("**/*.html"),
				vs.workspace.createFileSystemWatcher("**/pubspec.yaml"),
				vs.workspace.createFileSystemWatcher("**/analysis_options.yaml"),
				vs.workspace.createFileSystemWatcher("**/.analysis_options"),
			],
		},
	};

	lspClient = new LanguageClient(
		"dartAnalysisLSP",
		"Dart Analysis Server",
		() => spawn(sdks),
		clientOptions,
	);

	return lspClient.start();
}

function openLSPInspectorSocket(): Promise<vs.OutputChannel> {
	return new Promise((resolve, reject) => {
		// Read the inspectors config to see which port it's listening on.
		const socketPort = vs.workspace.getConfiguration("lspInspector").get("port");
		const socket = new WebSocket(`ws://localhost:${socketPort}`);

		let log = "";
		const websocketOutputChannel: vs.OutputChannel = {
			name: "websocket",
			// Only append the logs but send them later
			append(value: string) {
				log += value;
			},
			appendLine(value: string) {
				log += value;
				if (socket && socket.readyState === WebSocket.OPEN) {
					socket.send(log);
				}
				// console.log(log);
				log = "";
			},
			clear() { }, // tslint:disable-line:no-empty
			show() { }, // tslint:disable-line:no-empty
			hide() { }, // tslint:disable-line:no-empty
			dispose() { }, // tslint:disable-line:no-empty
		};

		socket.on("open", () => resolve(websocketOutputChannel));
		socket.on("error", (err: Error) => reject(err));
	});
}

function spawn(sdks: Sdks): Thenable<StreamInfo> {
	// TODO: Replace with constructing an Analyzer that passes LSP flag (but still reads config
	// from paths etc) and provide it's process.
	const vmPath = path.join(sdks.dart, dartVMPath);
	const args = config.previewLspArgs;

	const process = safeSpawn(undefined, vmPath, args);

	console.log(vmPath);
	console.log(args);

	const reader = process.stdout.pipe(new LoggingTransform("<=="));
	const writer = new LoggingTransform("==>");
	writer.pipe(process.stdin);

	return Promise.resolve({ reader, writer });
}

class LoggingTransform extends stream.Transform {
	constructor(private prefix: string, opts?: stream.TransformOptions) {
		super(opts);
	}
	public _transform(chunk: any, encoding: string, callback: () => void): void {
		console.log(`${this.prefix} ${chunk}`);
		this.push(chunk, encoding);
		callback();
	}
}
