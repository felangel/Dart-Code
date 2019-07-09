import * as fs from "fs";
import * as path from "path";
import { FLUTTER_CREATE_PROJECT_TRIGGER_FILE, FLUTTER_STAGEHAND_PROJECT_TRIGGER_FILE } from "../../shared/constants";
import { flatMap } from "../../shared/utils";
import { sortBy } from "../../shared/utils/array";
import { findProjectFolders } from "../../shared/utils/fs";
import glob = require("glob");

describe.only("perf", () => {
	it("should be fast", async () => {
		const searchLocations = [
			"/Users/dantup/Desktop/monorepo_test_1",
			"/Users/dantup/Desktop/monorepo_test_2",
			"/Users/dantup/Desktop/monorepo_test_3",
			"/Users/dantup/Desktop/monorepo_test_4",
			"/Users/dantup/Desktop/monorepo_test_5",
		];

		async function run(name: string, f: (locs: string[]) => string[] | Promise<string[]>): Promise<void> {
			const startTime = Date.now();
			const projects = await f(searchLocations);
			const endTime = Date.now();

			console.log(`${name}: ${endTime - startTime}ms (${projects.length} projects)`);
		}

		await run("Orig", findProjectFolders);
		await run("WithoutExists", findProjectFoldersWithoutExists);
		await run("Async", findProjectFoldersAsync);
		await run("Glob", findProjectFoldersGlob);
		await run("GlobSync", findProjectFoldersGlobSync);
	});
});

function findProjectFoldersWithoutExists(roots: string[], options: { sort?: boolean, requirePubspec?: boolean } = {}): string[] {
	const level2Folders = flatMap(roots, getChildFolders);
	const level3Folders = flatMap(level2Folders, getChildFolders);
	const allPossibleFolders = roots.concat(level2Folders).concat(level3Folders);

	const projectFolders = allPossibleFolders.filter((f) => {
		return options && options.requirePubspec
			? hasPubspec(f)
			: hasPubspec(f) || hasCreateTriggerFile(f) || isFlutterRepo(f);
	});
	return options && options.sort
		? sortBy(projectFolders, (p) => p.toLowerCase())
		: projectFolders;
}

async function findProjectFoldersAsync(roots: string[], options: { sort?: boolean, requirePubspec?: boolean } = {}): Promise<string[]> {
	const level2Folders = await flatMap(await Promise.all(roots.map(getChildFoldersAsync)), (x) => x);
	const level3Folders = await flatMap(await Promise.all(level2Folders.map(getChildFoldersAsync)), (x) => x);
	const allPossibleFolders = roots.concat(level2Folders).concat(level3Folders);

	const projectFolders: string[] = [];
	await Promise.all(allPossibleFolders.map(async (f) => {
		const matches = await Promise.all([hasPubspecAsync(f), hasCreateTriggerFileAsync(f), isFlutterRepoAsync(f)]);
		if (matches.indexOf(true) !== -1)
			projectFolders.push(f);
	}));
	return projectFolders;
}

async function findProjectFoldersGlob(roots: string[], options: { sort?: boolean, requirePubspec?: boolean } = {}): Promise<string[]> {
	const results = await Promise.all(roots.map(findProjectsGlob));
	return flatMap(results, (x) => x);
}

function findProjectFoldersGlobSync(roots: string[], options: { sort?: boolean, requirePubspec?: boolean } = {}): string[] {
	return flatMap(roots, findProjectsGlobSync);
}

function getChildFolders(parent: string, options?: { allowBin?: boolean, allowCache?: boolean }): string[] {
	return fs.readdirSync(parent)
		.filter((f) => f !== "bin" || (options && options.allowBin)) // Don't look in bin folders
		.filter((f) => f !== "cache" || (options && options.allowCache)) // Don't look in cache folders
		.map((item) => path.join(parent, item))
		.filter((item) => fs.statSync(item).isDirectory());
}

async function getChildFoldersAsync(parent: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		fs.readdir(parent, (err, files) => {
			if (err)
				return reject(err);

			const f = files.filter((f) => f !== "bin") // Don't look in bin folders
				.filter((f) => f !== "cache") // Don't look in cache folders
				.map((item) => path.join(parent, item))
				.filter((item) => fs.statSync(item).isDirectory());
			resolve(f);
		});
	});
}

function hasPubspec(folder: string): boolean {
	return fs.existsSync(path.join(folder, "pubspec.yaml"));
}

function hasCreateTriggerFile(folder: string): boolean {
	return fs.existsSync(path.join(folder, FLUTTER_CREATE_PROJECT_TRIGGER_FILE))
		|| fs.existsSync(path.join(folder, FLUTTER_STAGEHAND_PROJECT_TRIGGER_FILE));
}

function isFlutterRepo(folder: string): boolean {
	return fs.existsSync(path.join(folder, "bin/flutter")) && fs.existsSync(path.join(folder, "bin/cache/dart-sdk"));
}

function existsAsync(p: string): Promise<boolean> {
	return new Promise((resolve) => fs.exists(p, resolve));
}

async function hasPubspecAsync(folder: string): Promise<boolean> {
	return existsAsync(path.join(folder, "pubspec.yaml"));
}

async function hasCreateTriggerFileAsync(folder: string): Promise<boolean> {
	return (await Promise.all([
		existsAsync(path.join(folder, FLUTTER_CREATE_PROJECT_TRIGGER_FILE)),
		existsAsync(path.join(folder, FLUTTER_STAGEHAND_PROJECT_TRIGGER_FILE)),
	])).indexOf(true) !== -1;
}

async function isFlutterRepoAsync(folder: string): Promise<boolean> {
	return (await Promise.all([
		existsAsync(path.join(folder, "bin/flutter")),
		existsAsync(path.join(folder, "bin/cache/dart-sdk")),
	])).indexOf(true) !== -1;
}

function findProjectsGlob(root: string): Promise<string[]> {
	return new Promise<string[]>((resolve, reject) => {
		glob("pubspec.yaml", { cwd: root, nosort: true, absolute: true, matchBase: true }, (err, files) => {
			if (err)
				reject(err);
			else
				resolve(files);
		});
	});
}

function findProjectsGlobSync(root: string): string[] {
	return glob.sync("pubspec.yaml", { cwd: root, nosort: true, absolute: true, matchBase: true });
}
